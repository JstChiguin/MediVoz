const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { Navegador, esperar } = require('./ayudas/navegador');
const { iniciarServidor } = require('./servidor-estatico');

const SIMULACION = `
  window.__reconocimientos = [];
  class ReconocimientoFalso {
    constructor() { window.__reconocimientos.push(this); }
    start() {}
    stop() {}
  }
  window.SpeechRecognition = ReconocimientoFalso;
`;

const TEXTO_LOCAL = 'El audio se procesa directamente en este dispositivo y no se envía a servidores externos de transcripción. Puede ser más lenta y consumir más memoria. La primera vez necesita descargar el modelo de IA.';
const TEXTO_CHROME = 'Puede ofrecer una transcripción más rápida y precisa, dependiendo del dispositivo y del tipo de dictado. El audio podría enviarse a servidores externos para su procesamiento, por lo que ofrece menor privacidad.';

const LIMITE_IA_MS = 90000;

let servidor;
let navegador;

before(async () => {
  servidor = await iniciarServidor();
  navegador = await Navegador.abrir({ argumentos: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
  await navegador.scriptInicial(SIMULACION);
  navegador.registrarRed();
  await navegador.ir(servidor.url);
});

after(async () => {
  await navegador.cerrar();
  servidor.servidor.close();
});

async function reiniciar({ consentimiento = false, motorAntiguo = null } = {}) {
  await navegador.evaluar((acepto, antiguo) => {
    localStorage.clear();
    sessionStorage.clear();
    if (antiguo) localStorage.setItem('mediVozMotor', antiguo);
    if (acepto) sessionStorage.setItem('mediVozMotorNavegador', 'aceptado');
  }, consentimiento, motorAntiguo);
  await navegador.recargar();
}

const motor = () => navegador.evaluar(() => document.getElementById('motorVoz').value);
const panelOculto = () => navegador.evaluar(() => document.getElementById('consentimientoNavegador').hidden);
const consentimientoGuardado = () => navegador.evaluar(() => sessionStorage.getItem('mediVozMotorNavegador'));
const almacenamientoPersistente = () => navegador.evaluar(() => Object.keys(localStorage));
const reconocimientosCreados = () => navegador.evaluar(() => window.__reconocimientos.length);
const pulsar = (id) => navegador.evaluar((i) => document.getElementById(i).click(), id);
const elegir = (valor) => navegador.evaluar((v) => {
  const selector = document.getElementById('motorVoz');
  selector.value = v;
  selector.dispatchEvent(new Event('change'));
}, valor);
const aviso = () => navegador.evaluar(() => (document.getElementById('errorBanner').classList.contains('show') ? document.getElementById('errorBanner').innerText : ''));
const explicacion = () => navegador.evaluar(() => ({
  titulo: document.getElementById('tituloAvisoMotor').textContent,
  texto: document.getElementById('textoAvisoMotor').textContent
}));

describe('Motor predeterminado: IA local', () => {
  it('un usuario nuevo empieza con la IA local, sin consentimiento guardado ni panel de aviso', async () => {
    await reiniciar();
    assert.equal(await motor(), 'local');
    assert.equal(await panelOculto(), true);
    assert.equal(await consentimientoGuardado(), null);
  });

  it('una elección guardada por la versión 2.2.0 no activa el motor externo y se elimina', async () => {
    for (const antiguo of ['navegador', 'navegador-consentido', 'valor-desconocido']) {
      await reiniciar({ motorAntiguo: antiguo });
      assert.equal(await motor(), 'local', antiguo);
      assert.deepEqual(await almacenamientoPersistente(), [], antiguo);
    }
  });

  it('el selector ofrece nombres cortos y las explicaciones quedan debajo, no dentro de las opciones', async () => {
    await reiniciar();
    const opciones = await navegador.evaluar(() => [...document.querySelectorAll('#motorVoz option')].map((o) => [o.value, o.textContent]));
    assert.deepEqual(opciones, [['local', 'IA local — Privada'], ['navegador', 'Chrome — Rápido']]);
  });

  it('con la IA local se muestra la explicación de privacidad sin afirmar mayor precisión', async () => {
    await reiniciar();
    assert.deepEqual(await explicacion(), { titulo: 'IA local — Mayor privacidad', texto: TEXTO_LOCAL });
    assert.doesNotMatch(TEXTO_LOCAL, /más precisa|mejor precisión|siempre/i);
  });
});

describe('Motor del navegador (Chrome): consentimiento explícito y por sesión', () => {
  it('con Chrome se muestra la explicación de rapidez y la advertencia de privacidad, sin afirmar que siempre es más preciso', async () => {
    await reiniciar();
    await elegir('navegador');
    assert.deepEqual(await explicacion(), { titulo: 'Chrome — Mayor rapidez', texto: TEXTO_CHROME });
    assert.doesNotMatch(TEXTO_CHROME, /siempre/i);
    assert.match(TEXTO_CHROME, /dependiendo del dispositivo/);
    assert.equal(await panelOculto(), false);
    const panel = await navegador.evaluar(() => document.getElementById('consentimientoNavegador').innerText);
    assert.match(panel, /puede enviar tu voz a servicios externos/);
    assert.match(panel, /solo para esta sesión/);
  });

  it('al elegirlo sin aceptar no queda ningún consentimiento y al recargar vuelve a la IA local', async () => {
    await reiniciar();
    await elegir('navegador');
    assert.equal(await consentimientoGuardado(), null);
    await navegador.recargar();
    assert.equal(await motor(), 'local');
  });

  it('sin aceptar, el micrófono no inicia el reconocimiento externo', async () => {
    await reiniciar();
    await elegir('navegador');
    await pulsar('micBtn');
    await esperar(300);
    assert.match(await aviso(), /acepta primero el aviso/);
    assert.equal(await reconocimientosCreados(), 0);
    assert.equal(await navegador.evaluar(() => document.getElementById('micBtn').classList.contains('recording')), false);
  });

  it('al aceptar, el consentimiento vale solo para la sesión: no se escribe en el almacenamiento persistente', async () => {
    await reiniciar();
    await elegir('navegador');
    await pulsar('aceptarMotorNavegador');
    assert.equal(await panelOculto(), true);
    assert.equal(await consentimientoGuardado(), 'aceptado');
    assert.deepEqual(await almacenamientoPersistente(), []);
    await pulsar('micBtn');
    await esperar(300);
    assert.equal(await reconocimientosCreados(), 1);
    await pulsar('micBtn');
    await navegador.recargar();
    assert.equal(await motor(), 'navegador');
    assert.equal(await panelOculto(), true);
  });

  it('en una sesión nueva sin consentimiento, Chrome no vuelve a estar activo', async () => {
    await reiniciar({ consentimiento: true });
    assert.equal(await motor(), 'navegador');
    await navegador.evaluar(() => sessionStorage.clear());
    await navegador.recargar();
    assert.equal(await motor(), 'local');
  });

  it('volver a la IA local elimina el consentimiento y obliga a aceptar de nuevo', async () => {
    await reiniciar({ consentimiento: true });
    await elegir('local');
    assert.equal(await consentimientoGuardado(), null);
    await elegir('navegador');
    assert.equal(await panelOculto(), false);
    await pulsar('volverIaLocal');
    assert.equal(await motor(), 'local');
    assert.equal(await consentimientoGuardado(), null);
    assert.equal(await panelOculto(), true);
    assert.deepEqual(await explicacion(), { titulo: 'IA local — Mayor privacidad', texto: TEXTO_LOCAL });
  });

  it('el motor seleccionado se ve claramente en el título de la explicación mientras se usa', async () => {
    await reiniciar({ consentimiento: true });
    assert.equal((await explicacion()).titulo, 'Chrome — Mayor rapidez');
    assert.equal(await navegador.evaluar(() => document.getElementById('motorVoz').selectedOptions[0].textContent), 'Chrome — Rápido');
  });
});

describe('Nunca se cambia solo al motor externo', () => {
  it('si la IA local falla al cargar, el motor sigue siendo local, el micrófono queda libre y no se crea ningún reconocimiento externo', async () => {
    await reiniciar();
    await navegador.interceptarRespuesta('*manifiesto.json', (cuerpo) => {
      const manifiesto = JSON.parse(cuerpo);
      manifiesto.archivos.find((a) => a.nombre === 'joiner.int8.onnx').sha256 = '0'.repeat(64);
      return JSON.stringify(manifiesto);
    });
    await pulsar('micBtn');
    await navegador.esperarCondicionConLimite(LIMITE_IA_MS, () => document.getElementById('errorBanner').classList.contains('show'), 'aviso de fallo de la IA local');
    assert.equal(await motor(), 'local');
    assert.equal(await consentimientoGuardado(), null);
    assert.equal(await reconocimientosCreados(), 0);
    assert.equal(await navegador.evaluar(() => document.getElementById('micBtn').disabled), false);
    assert.equal(await navegador.evaluar(() => document.getElementById('micBtn').classList.contains('recording')), false);
  });

  it('el código no contiene ningún cambio automático de motor', () => {
    const codigo = ['js/script.js', 'js/ia/reconocedor-local.js'].map((f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8')).join('\n');
    const asignaciones = codigo.match(/motorVoz\.value\s*=[^=]/g) || [];
    assert.equal(asignaciones.length, 2, 'solo la carga inicial y el botón Usar la IA local');
    assert.doesNotMatch(codigo, /motorVoz\.value\s*=\s*['"]navegador/);
  });
});
