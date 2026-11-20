const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const RUTAS_NAVEGADOR = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
].filter(Boolean);

function esperar(ms) {
  return new Promise((resolver) => setTimeout(resolver, ms));
}

async function esperarHasta(condicion, tiempoMaximo, descripcion) {
  const limite = Date.now() + tiempoMaximo;
  while (Date.now() < limite) {
    const resultado = await condicion();
    if (resultado) return resultado;
    await esperar(50);
  }
  throw new Error('Tiempo agotado esperando: ' + descripcion);
}

class ClienteCdp {
  constructor(socket) {
    this.socket = socket;
    this.contador = 0;
    this.pendientes = new Map();
    this.escuchas = new Map();
    socket.addEventListener('message', (evento) => {
      const mensaje = JSON.parse(evento.data);
      if (mensaje.id && this.pendientes.has(mensaje.id)) {
        const { resolver, rechazar } = this.pendientes.get(mensaje.id);
        this.pendientes.delete(mensaje.id);
        if (mensaje.error) rechazar(new Error(mensaje.error.message));
        else resolver(mensaje.result);
        return;
      }
      (this.escuchas.get(mensaje.method) || []).forEach((escucha) => escucha(mensaje.params));
    });
  }

  enviar(metodo, parametros = {}) {
    const id = ++this.contador;
    return new Promise((resolver, rechazar) => {
      this.pendientes.set(id, { resolver, rechazar });
      this.socket.send(JSON.stringify({ id, method: metodo, params: parametros }));
    });
  }

  escuchar(metodo, escucha) {
    this.escuchas.set(metodo, [...(this.escuchas.get(metodo) || []), escucha]);
  }

  cuando(metodo) {
    return new Promise((resolver) => {
      const escucha = (parametros) => {
        this.escuchas.set(metodo, this.escuchas.get(metodo).filter((e) => e !== escucha));
        resolver(parametros);
      };
      this.escuchas.set(metodo, [...(this.escuchas.get(metodo) || []), escucha]);
    });
  }
}

class Navegador {
  static async abrir(opciones = {}) {
    const ejecutable = RUTAS_NAVEGADOR.find((ruta) => fs.existsSync(ruta));
    if (!ejecutable) throw new Error('No se encontró Chrome ni Edge. Defina CHROME_PATH.');
    const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'medivoz-pruebas-'));
    const proceso = spawn(ejecutable, [
      '--headless=new',
      '--remote-debugging-port=0',
      '--user-data-dir=' + perfil,
      '--no-first-run',
      '--no-default-browser-check',
      ...(opciones.conGpu ? [] : ['--disable-gpu']),
      '--no-sandbox',
      ...(opciones.argumentos || []),
      'about:blank'
    ], { stdio: 'ignore' });
    const archivoPuerto = path.join(perfil, 'DevToolsActivePort');
    await esperarHasta(() => fs.existsSync(archivoPuerto), 20000, 'inicio del navegador');
    const puerto = fs.readFileSync(archivoPuerto, 'utf8').split('\n')[0].trim();
    const paginas = await esperarHasta(async () => {
      const respuesta = await fetch(`http://127.0.0.1:${puerto}/json/list`);
      const lista = (await respuesta.json()).filter((p) => p.type === 'page');
      return lista.length ? lista : null;
    }, 20000, 'pestaña inicial');
    const socket = new WebSocket(paginas[0].webSocketDebuggerUrl);
    await new Promise((resolver, rechazar) => {
      socket.addEventListener('open', resolver);
      socket.addEventListener('error', rechazar);
    });
    const cliente = new ClienteCdp(socket);
    await cliente.enviar('Page.enable');
    await cliente.enviar('Runtime.enable');
    await cliente.enviar('Network.enable');
    return new Navegador(proceso, perfil, cliente, socket);
  }

  constructor(proceso, perfil, cliente, socket) {
    this.proceso = proceso;
    this.perfil = perfil;
    this.cliente = cliente;
    this.socket = socket;
  }

  memoriaMb() {
    const { spawnSync } = require('child_process');
    const patron = path.basename(this.perfil);
    const orden = "$t=0; Get-CimInstance Win32_Process -Filter \"Name='chrome.exe'\" | Where-Object { $_.CommandLine -like '*" + patron + "*' } | ForEach-Object { $p=Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue; if ($p) { $t += $p.WorkingSet64 } }; [math]::Round($t/1MB)";
    const resultado = spawnSync('powershell', ['-NoProfile', '-Command', orden], { encoding: 'utf8' });
    return Number(String(resultado.stdout).trim()) || 0;
  }

  async configurarVista({ ancho, alto, movil }) {
    await this.cliente.enviar('Emulation.setDeviceMetricsOverride', {
      width: ancho,
      height: alto,
      deviceScaleFactor: movil ? 2 : 1,
      mobile: Boolean(movil)
    });
  }

  registrarRed() {
    this.solicitudes = [];
    const porId = new Map();
    this.cliente.escuchar('Network.requestWillBeSent', (p) => {
      const registro = { url: p.request.url, metodo: p.request.method, cuerpo: p.request.postData || '', bloqueada: false };
      porId.set(p.requestId, registro);
      this.solicitudes.push(registro);
    });
    this.cliente.escuchar('Network.loadingFailed', (p) => {
      const registro = porId.get(p.requestId);
      if (registro && p.blockedReason) registro.bloqueada = true;
    });
    this.cliente.escuchar('Network.webSocketCreated', (p) => {
      this.solicitudes.push({ url: p.url, metodo: 'WEBSOCKET', cuerpo: '' });
    });
    return this.solicitudes;
  }

  async interceptarRespuesta(patron, transformar) {
    await this.cliente.enviar('Fetch.enable', { patterns: [{ urlPattern: patron, requestStage: 'Response' }] });
    this.cliente.escuchar('Fetch.requestPaused', async (p) => {
      try {
        const cuerpo = await this.cliente.enviar('Fetch.getResponseBody', { requestId: p.requestId });
        const original = cuerpo.base64Encoded ? Buffer.from(cuerpo.body, 'base64').toString('utf8') : cuerpo.body;
        const modificado = transformar(original);
        await this.cliente.enviar('Fetch.fulfillRequest', {
          requestId: p.requestId,
          responseCode: 200,
          responseHeaders: [{ name: 'Content-Type', value: 'application/json' }],
          body: Buffer.from(modificado, 'utf8').toString('base64')
        });
      } catch (error) {
        await this.cliente.enviar('Fetch.continueRequest', { requestId: p.requestId }).catch(() => {});
      }
    });
  }

  async bloquearUrls(patrones) {
    await this.cliente.enviar('Network.setBlockedURLs', { urls: patrones });
  }

  async scriptInicial(codigo) {
    await this.cliente.enviar('Page.addScriptToEvaluateOnNewDocument', { source: codigo });
  }

  async ir(url) {
    const cargada = this.cliente.cuando('Page.loadEventFired');
    await this.cliente.enviar('Page.navigate', { url });
    await Promise.race([
      cargada,
      esperar(20000).then(() => { throw new Error('La página no terminó de cargar'); })
    ]);
  }

  async recargar() {
    const cargada = this.cliente.cuando('Page.loadEventFired');
    await this.cliente.enviar('Page.reload');
    await cargada;
  }

  async evaluar(funcion, ...argumentos) {
    const expresion = `(${funcion.toString()})(...${JSON.stringify(argumentos)})`;
    const resultado = await this.cliente.enviar('Runtime.evaluate', {
      expression: expresion,
      awaitPromise: true,
      returnByValue: true
    });
    if (resultado.exceptionDetails) {
      throw new Error(resultado.exceptionDetails.exception?.description || resultado.exceptionDetails.text);
    }
    return resultado.result.value;
  }

  async evaluarRespetandoCsp(expresion) {
    const resultado = await this.cliente.enviar('Runtime.evaluate', {
      expression: expresion,
      awaitPromise: true,
      returnByValue: true,
      allowUnsafeEvalBlockedByCSP: false
    });
    if (resultado.exceptionDetails) throw new Error(resultado.exceptionDetails.text);
    return resultado.result.value;
  }

  async esperarCondicion(funcion, descripcion, ...argumentos) {
    return esperarHasta(() => this.evaluar(funcion, ...argumentos), 8000, descripcion);
  }

  async esperarCondicionConLimite(limiteMs, funcion, descripcion, ...argumentos) {
    return esperarHasta(() => this.evaluar(funcion, ...argumentos), limiteMs, descripcion);
  }

  async cerrar() {
    try { await this.cliente.enviar('Browser.close'); } catch (_) {}
    try { this.socket.close(); } catch (_) {}
    await esperar(300);
    try { this.proceso.kill(); } catch (_) {}
    await esperar(300);
    try { fs.rmSync(this.perfil, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch (_) {}
  }
}

module.exports = { Navegador, esperar };
