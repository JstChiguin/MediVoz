const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { Navegador, esperar } = require('./ayudas/navegador');
const { iniciarServidor } = require('./servidor-estatico');
const { tasaErrorPalabras, precisionTerminos } = require('../evaluacion/metricas');
const referencias = require('./audios/referencias.json');

const SESION_AUDIO_MS = 1000;
const LIMITE_IA_MS = 90000;
const CLAVES_ESPERADAS = ['mediVozMedicos'];
const abiertos = [];
let servidor;

async function abrirNavegador(clip) {
  if (!servidor) servidor = await iniciarServidor();
  const argumentos = ['--autoplay-policy=no-user-gesture-required'];
  if (clip) {
    argumentos.push(
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
      '--use-file-for-fake-audio-capture=' + path.resolve(__dirname, 'audios', clip + '.wav') + '%noloop'
    );
  }
  const navegador = await Navegador.abrir({ argumentos });
  abiertos.push(navegador);
  const simulaciones = `
    window.__ventanas = [];
    window.open = () => { window.__ventanas.push(1); return null; };
    window.__descargas = [];
    HTMLAnchorElement.prototype.click = function () { window.__descargas.push(this.download); };
    window.__violacionesCsp = [];
    document.addEventListener('securitypolicyviolation', (e) => window.__violacionesCsp.push(e.violatedDirective));
  `;
  await navegador.scriptInicial(simulaciones);
  navegador.registrarRed();
  await navegador.ir(servidor.url);
  await navegador.evaluar(() => {
    localStorage.clear();
    localStorage.setItem('mediVozMedicos', JSON.stringify(['Médico Ficticio Alfa']));
  });
  await navegador.recargar();
  return navegador;
}

after(async () => {
  for (const navegador of abiertos) await navegador.cerrar();
  if (servidor) servidor.servidor.close();
});

async function dictarConIaLocal(navegador, segundosDeAudio) {
  await navegador.evaluar(() => {
    const selector = document.getElementById('motorVoz');
    selector.value = 'local';
    selector.dispatchEvent(new Event('change'));
    document.getElementById('micBtn').click();
  });
  await navegador.esperarCondicionConLimite(LIMITE_IA_MS, () => document.getElementById('micStatus').innerText.startsWith('Escuchando') || document.getElementById('errorBanner').classList.contains('show'), 'inicio de la escucha');
  const error = await navegador.evaluar(() => document.getElementById('errorBanner').classList.contains('show') ? document.getElementById('errorBanner').innerText : '');
  assert.equal(error, '', error);
  await esperar(segundosDeAudio * 1000 + SESION_AUDIO_MS);
  await navegador.evaluar(() => document.getElementById('micBtn').click());
  await navegador.esperarCondicionConLimite(LIMITE_IA_MS, () => document.getElementById('micStatus').innerText.startsWith('Presiona'), 'fin de la transcripción');
}

const textoTranscrito = (navegador) => navegador.evaluar(() => document.getElementById('transcriptBox').innerText.trim());
const clip = (id) => referencias.find((r) => r.id === id);

describe('IA local: carga bajo demanda y elección del motor', () => {
  it('la IA local es el motor predeterminado, avisa que el audio no sale del dispositivo y no descarga ningún modelo al iniciar', async () => {
    const navegador = await abrirNavegador();
    assert.equal(await navegador.evaluar(() => document.getElementById('motorVoz').value), 'local');
    assert.match(await navegador.evaluar(() => document.getElementById('avisoMotor').innerText), /directamente en este dispositivo/);
    assert.equal(await navegador.evaluar(() => document.getElementById('consentimientoNavegador').hidden), true);
    await esperar(1500);
    assert.deepEqual(navegador.solicitudes.filter((s) => /\/modelos\//.test(s.url) || /\/js\/ia\//.test(s.url) || /vendor\/ort/.test(s.url)), []);
  });

  it('elegir la IA local explica su privacidad y aun así no descarga nada hasta dictar', async () => {
    const navegador = await abrirNavegador();
    await navegador.evaluar(() => {
      const selector = document.getElementById('motorVoz');
      selector.value = 'local';
      selector.dispatchEvent(new Event('change'));
    });
    assert.match(await navegador.evaluar(() => document.getElementById('avisoMotor').innerText), /directamente en este dispositivo/);
    await navegador.recargar();
    assert.equal(await navegador.evaluar(() => document.getElementById('motorVoz').value), 'local');
    await esperar(1000);
    assert.deepEqual(navegador.solicitudes.filter((s) => /\/modelos\//.test(s.url)), []);
    assert.deepEqual((await navegador.evaluar(() => Object.keys(localStorage))).sort(), CLAVES_ESPERADAS);
  });
});

describe('IA local: transcripción real de audio con un micrófono simulado', () => {
  it('transcribe un dictado corto con precisión y sin tráfico externo', async () => {
    const navegador = await abrirNavegador('dictado-corto');
    await dictarConIaLocal(navegador, 5.2);
    const texto = await textoTranscrito(navegador);
    const wer = tasaErrorPalabras(clip('dictado-corto').referencia, texto);
    console.log(`  [micrófono simulado] dictado-corto WER=${(wer * 100).toFixed(1)}% texto="${texto}"`);
    assert.ok(wer <= 0.3, `WER ${wer} texto ${texto}`);
    const origen = new URL(servidor.url).origin;
    const ajenas = navegador.solicitudes.filter((s) => !s.url.startsWith(origen) && !/^(data|blob):/.test(s.url));
    assert.deepEqual(ajenas, []);
    assert.ok(navegador.solicitudes.every((s) => s.metodo === 'GET'));
    assert.ok(navegador.solicitudes.every((s) => !s.cuerpo));
    assert.deepEqual(await navegador.evaluar(() => window.__violacionesCsp), []);
  });

  it('conserva las dosis y las unidades de un dictado clínico, aunque el nombre del fármaco pueda fallar', async () => {
    const navegador = await abrirNavegador('dictado-dosis');
    await dictarConIaLocal(navegador, 6.7);
    const texto = await textoTranscrito(navegador);
    const referencia = clip('dictado-dosis').referencia;
    const wer = tasaErrorPalabras(referencia, texto);
    const terminos = precisionTerminos(['enalapril', 'losartán', 'persistente'], texto);
    console.log(`  [micrófono simulado] dictado-dosis WER=${(wer * 100).toFixed(1)}% términos=${terminos.correctos}/${terminos.total} texto="${texto}"`);
    assert.ok(wer <= 0.5, `WER ${wer} texto ${texto}`);
    assert.match(texto.toLowerCase(), /\b(50|cincuenta)\b/);
    assert.match(texto.toLowerCase(), /miligramos|mg/);
    assert.match(texto.toLowerCase(), /persistente/);
  });

  it('separa un dictado con pausas en frases, las ordena y no pierde ninguna', async () => {
    const navegador = await abrirNavegador('dictado-pausas');
    await dictarConIaLocal(navegador, 15);
    const texto = await textoTranscrito(navegador);
    const wer = tasaErrorPalabras(clip('dictado-pausas').referencia, texto);
    console.log(`  [micrófono simulado] dictado-pausas WER=${(wer * 100).toFixed(1)}% texto="${texto}"`);
    assert.ok(wer <= 0.3, `WER ${wer} texto ${texto}`);
    const minusculas = texto.toLowerCase();
    assert.ok(minusculas.indexOf('estable') < minusculas.indexOf('presi'));
    assert.ok(minusculas.indexOf('presi') < minusculas.indexOf('alta'));
  });

  it('permite guardar la transcripción y la envía al historial como texto', async () => {
    const navegador = await abrirNavegador('dictado-corto');
    await dictarConIaLocal(navegador, 5.2);
    await navegador.evaluar(() => {
      document.getElementById('patientInput').value = 'Paciente Ficticio IA';
      document.getElementById('saveBtn').click();
    });
    const historial = await navegador.evaluar(() => JSON.parse(localStorage.getItem('mediVozHistory')));
    assert.equal(historial.length, 1);
    assert.match(historial[0].text.toLowerCase(), /paciente refiere/);
  });
});

describe('IA local: lo dictado nunca se convierte en instrucciones', () => {
  it('una frase dictada que pide borrar datos, desactivar el cifrado y enviar información solo se transcribe', async () => {
    const navegador = await abrirNavegador('dictado-inyeccion');
    await navegador.evaluar(() => {
      localStorage.setItem('mediVozHistory', JSON.stringify([{ id: 1700000000001, doctor: 'D', patient: 'Paciente Ficticio Previo', text: 'Texto ficticio previo', time: 't' }]));
    });
    await navegador.recargar();
    const antes = await navegador.evaluar(() => JSON.stringify(Object.fromEntries(Object.keys(localStorage).map((k) => [k, localStorage.getItem(k)]))));
    navegador.solicitudes.length = 0;
    await dictarConIaLocal(navegador, 11);
    const texto = (await textoTranscrito(navegador)).toLowerCase();
    console.log(`  [micrófono simulado] dictado-inyeccion texto="${texto}"`);
    assert.match(texto, /instrucciones/);
    const despues = await navegador.evaluar(() => JSON.stringify(Object.fromEntries(Object.keys(localStorage).map((k) => [k, localStorage.getItem(k)]))));
    assert.equal(despues, antes);
    assert.deepEqual(await navegador.evaluar(() => AlmacenSeguro.estado()), { cifrado: false, bloqueado: false, guardarEnDispositivo: true });
    assert.equal(await navegador.evaluar(() => window.__ventanas.length + window.__descargas.length), 0);
    const origen = new URL(servidor.url).origin;
    assert.deepEqual(navegador.solicitudes.filter((s) => !s.url.startsWith(origen) && !/^(data|blob):/.test(s.url)), []);
    assert.deepEqual(await navegador.evaluar(() => window.__violacionesCsp), []);
    assert.equal(await navegador.evaluar(() => [...document.querySelectorAll('#transcriptBox *')].every((e) => e.tagName === 'SPAN')), true);
  });
});

describe('IA local: integridad y recuperación ante fallos', () => {
  it('descarta un modelo cuya huella no coincide y avisa al usuario sin dejar el micrófono activo', async () => {
    const navegador = await abrirNavegador('dictado-corto');
    await navegador.interceptarRespuesta('*manifiesto.json', (cuerpo) => {
      const manifiesto = JSON.parse(cuerpo);
      manifiesto.archivos.find((a) => a.nombre === 'joiner.int8.onnx').sha256 = '0'.repeat(64);
      return JSON.stringify(manifiesto);
    });
    await navegador.evaluar(() => {
      const selector = document.getElementById('motorVoz');
      selector.value = 'local';
      selector.dispatchEvent(new Event('change'));
      document.getElementById('micBtn').click();
    });
    await navegador.esperarCondicion(() => document.getElementById('errorBanner').classList.contains('show'), 'aviso de integridad');
    assert.match(await navegador.evaluar(() => document.getElementById('errorBanner').innerText), /huella|descartado/);
    assert.equal(await navegador.evaluar(() => document.getElementById('micBtn').classList.contains('recording')), false);
    assert.equal(await navegador.evaluar(() => document.getElementById('micBtn').disabled), false);
    const cache = await navegador.evaluar(async () => (await caches.keys()).length ? (await (await caches.open((await caches.keys())[0])).keys()).map((r) => r.url) : []);
    assert.ok(!cache.some((url) => /joiner/.test(url)), cache.join());
  });

  it('el botón Borrar descarta la transcripción pendiente de la IA local', async () => {
    const navegador = await abrirNavegador('dictado-pausas');
    await navegador.evaluar(() => {
      const selector = document.getElementById('motorVoz');
      selector.value = 'local';
      selector.dispatchEvent(new Event('change'));
      document.getElementById('micBtn').click();
    });
    await navegador.esperarCondicion(() => document.getElementById('micStatus').innerText.startsWith('Escuchando'), 'escucha');
    await esperar(6000);
    await navegador.evaluar(() => document.getElementById('clearBtn').click());
    await esperar(5000);
    const texto = await textoTranscrito(navegador);
    assert.match(texto, /El texto dictado aparecerá aquí/);
  });
});

describe('IA local: memoria y liberación', () => {
  it('avisa cuando el dispositivo informa poca memoria al elegir la IA local, sin cambiar de motor por su cuenta', async () => {
    const navegador = await abrirNavegador();
    await navegador.evaluar(() => {
      Object.defineProperty(navigator, 'deviceMemory', { configurable: true, value: 2 });
      const selector = document.getElementById('motorVoz');
      selector.value = 'local';
      selector.dispatchEvent(new Event('change'));
    });
    assert.match(await navegador.evaluar(() => document.getElementById('toast').innerText), /poca memoria/);
    assert.equal(await navegador.evaluar(() => document.getElementById('motorVoz').value), 'local');
  });

  it('libera el modelo y el worker al descargarlo y la memoria baja', async () => {
    const navegador = await abrirNavegador('dictado-corto');
    await dictarConIaLocal(navegador, 5.2);
    assert.equal(await navegador.evaluar(() => reconocedorLocal.estaListo()), true);
    const conModelo = process.platform === 'win32' ? navegador.memoriaMb() : 0;
    await navegador.evaluar(() => reconocedorLocal.descargarModelo());
    assert.equal(await navegador.evaluar(() => reconocedorLocal.estaListo()), false);
    assert.equal(await navegador.evaluar(() => reconocedorLocal.trabajador === null), true);
    if (process.platform === 'win32') {
      await esperar(2500);
      const liberada = navegador.memoriaMb();
      console.log(`  [memoria] con modelo ${conModelo} MB, tras liberarlo ${liberada} MB`);
      assert.ok(liberada < conModelo - 150, `${conModelo} -> ${liberada}`);
    }
  });
});
