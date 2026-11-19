const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { Navegador } = require('./ayudas/navegador');
const { iniciarServidor } = require('./servidor-estatico');
const { SIMULACIONES_BASE, dictar } = require('./ayudas/simulaciones');

const FRASES_CLINICAS = [
  'Paciente ficticio con cefalea tensional de tres días de evolución.',
  'Se indica ibuprofeno 400 miligramos cada ocho horas por cinco días.',
  'Presión arterial 130 sobre 85 milímetros de mercurio, saturación 97 por ciento.'
];
const NOMBRE_PACIENTE = 'Paciente Ficticio Privado';
const CONTRASENA = 'Clave-Ficticia-2026!';

let servidor;
let navegador;

before(async () => {
  servidor = await iniciarServidor();
  navegador = await Navegador.abrir();
  await navegador.scriptInicial(SIMULACIONES_BASE);
  navegador.registrarRed();
});

after(async () => {
  await navegador.cerrar();
  servidor.servidor.close();
});

async function prepararAlmacenamiento() {
  await navegador.evaluar(() => {
    localStorage.clear();
    localStorage.setItem('mediVozMedicos', JSON.stringify(['Médico Ficticio Alfa']));
  });
  await navegador.recargar();
}

async function recorrerFlujoCompleto(preparar = true) {
  if (preparar) await prepararAlmacenamiento();
  await navegador.evaluar(() => document.getElementById('micBtn').click());
  for (const frase of FRASES_CLINICAS) await navegador.evaluar(dictar, frase);
  await navegador.evaluar((nombre) => {
    document.getElementById('micBtn').click();
    document.getElementById('patientInput').value = nombre;
    document.getElementById('saveBtn').click();
  }, NOMBRE_PACIENTE);
  await navegador.evaluar(() => {
    const boton = (a) => document.querySelector(`#historyList button[data-accion="${a}"]`);
    boton('copiar').click();
    boton('imprimir').click();
    document.getElementById('printHistoryBtn').click();
    boton('word').click();
  });
  await navegador.esperarCondicion(() => window.__descargas.length >= 1, 'Word generado');
  await navegador.evaluar((c) => {
    document.getElementById('abrirSeguridadBtn').click();
    document.getElementById('contrasenaNueva').value = c;
    document.getElementById('contrasenaRepetida').value = c;
    document.getElementById('formularioCifrado').requestSubmit();
  }, CONTRASENA);
  await navegador.esperarCondicion(() => AlmacenSeguro.estado().cifrado, 'cifrado');
  await navegador.evaluar(() => document.getElementById('bloquearBtn').click());
  await navegador.evaluar((c) => {
    document.getElementById('contrasenaDesbloqueo').value = c;
    document.getElementById('formularioDesbloqueo').requestSubmit();
  }, CONTRASENA);
  await navegador.esperarCondicion(() => !AlmacenSeguro.estado().bloqueado, 'desbloqueo');
}

describe('Privacidad de red durante el flujo completo de la aplicación', () => {
  it('toda solicitud va al propio origen y ninguna contiene texto clínico, paciente ni contraseña', async () => {
    navegador.solicitudes.length = 0;
    await navegador.ir(servidor.url);
    navegador.solicitudes.length = 0;
    await recorrerFlujoCompleto();
    const origen = new URL(servidor.url).origin;
    const ajenas = navegador.solicitudes.filter((s) => !s.url.startsWith(origen) && !/^(data|blob):/.test(s.url));
    assert.deepEqual(ajenas, []);
    const sensibles = [...FRASES_CLINICAS, NOMBRE_PACIENTE, CONTRASENA, encodeURIComponent(NOMBRE_PACIENTE)];
    for (const solicitud of navegador.solicitudes) {
      assert.equal(solicitud.metodo, 'GET', solicitud.url);
      for (const dato of sensibles) {
        assert.ok(!solicitud.url.includes(dato) && !solicitud.cuerpo.includes(dato), solicitud.url);
      }
    }
    assert.deepEqual(await navegador.evaluar(() => window.__violacionesCsp), []);
  });

  it('la carga inicial solo pide archivos propios de la aplicación', async () => {
    navegador.solicitudes.length = 0;
    await navegador.ir(servidor.url);
    const rutas = navegador.solicitudes.filter((s) => !/^data:/.test(s.url)).map((s) => new URL(s.url).pathname).sort();
    const permitidas = /^\/(|index\.html|css\/[\w.-]+\.css|css\/fuentes\/[\w.-]+\.woff2|js\/[\w.-]+\.js|js\/vendor\/[\w.-]+\.js|favicon\.ico)$/;
    for (const ruta of rutas) assert.match(ruta, permitidas);
  });

  it('funciona sin conexión una vez cargada: dictar, guardar, cifrar, imprimir y exportar', async () => {
    await navegador.ir(servidor.url);
    await prepararAlmacenamiento();
    await navegador.cliente.enviar('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
    try {
      navegador.solicitudes.length = 0;
      await recorrerFlujoCompleto(false);
    } finally {
      await navegador.cliente.enviar('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    }
    assert.equal(await navegador.evaluar(() => history.length), 1);
    assert.equal(await navegador.evaluar(() => AlmacenSeguro.estado().cifrado), true);
  });

  it('no deja grabaciones ni datos de audio en el almacenamiento del navegador', async () => {
    const bases = await navegador.evaluar(async () => (indexedDB.databases ? await indexedDB.databases() : []));
    assert.deepEqual(bases, []);
    const claves = await navegador.evaluar(() => Object.keys(localStorage).concat(Object.keys(sessionStorage)));
    assert.deepEqual(claves.sort(), ['mediVozHistorialCifrado', 'mediVozMedicos', 'mediVozSeguridad']);
    const caches = await navegador.evaluar(async () => (self.caches ? await caches.keys() : []));
    assert.deepEqual(caches, []);
    const registros = await navegador.evaluar(async () => (navigator.serviceWorker ? (await navigator.serviceWorker.getRegistrations()).length : 0));
    assert.equal(registros, 0);
  });

  it('los mensajes de error y el registro de consola no incluyen texto clínico', async () => {
    const consola = [];
    navegador.cliente.escuchar('Runtime.consoleAPICalled', (p) => consola.push(JSON.stringify(p.args)));
    navegador.cliente.escuchar('Runtime.exceptionThrown', (p) => consola.push(JSON.stringify(p.exceptionDetails)));
    await navegador.ir(servidor.url);
    await recorrerFlujoCompleto();
    const unido = consola.join('\n');
    for (const dato of [...FRASES_CLINICAS, NOMBRE_PACIENTE, CONTRASENA]) assert.ok(!unido.includes(dato));
  });
});
