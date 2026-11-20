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

async function reiniciar(motorGuardado) {
  await navegador.evaluar((valor) => {
    localStorage.clear();
    if (valor) localStorage.setItem('mediVozMotor', valor);
  }, motorGuardado);
  await navegador.recargar();
}

const motor = () => navegador.evaluar(() => document.getElementById('motorVoz').value);
const panelOculto = () => navegador.evaluar(() => document.getElementById('consentimientoNavegador').hidden);
const guardado = () => navegador.evaluar(() => localStorage.getItem('mediVozMotor'));
const reconocimientosCreados = () => navegador.evaluar(() => window.__reconocimientos.length);
const pulsar = (id) => navegador.evaluar((i) => document.getElementById(i).click(), id);
const elegir = (valor) => navegador.evaluar((v) => {
  const selector = document.getElementById('motorVoz');
  selector.value = v;
  selector.dispatchEvent(new Event('change'));
}, valor);
const aviso = () => navegador.evaluar(() => (document.getElementById('errorBanner').classList.contains('show') ? document.getElementById('errorBanner').innerText : ''));

describe('Motor predeterminado: IA local', () => {
  it('un usuario nuevo empieza con la IA local, sin consentimiento guardado ni panel de aviso', async () => {
    await reiniciar(null);
    assert.equal(await motor(), 'local');
    assert.equal(await panelOculto(), true);
    assert.equal(await guardado(), null);
  });

  it('una elección antigua del motor del navegador sin consentimiento vuelve a la IA local', async () => {
    await reiniciar('navegador');
    assert.equal(await motor(), 'local');
    await reiniciar('valor-desconocido');
    assert.equal(await motor(), 'local');
  });

  it('el selector ofrece la IA local primero y el motor del navegador con su advertencia', async () => {
    const opciones = await navegador.evaluar(() => [...document.querySelectorAll('#motorVoz option')].map((o) => [o.value, o.textContent]));
    assert.equal(opciones[0][0], 'local');
    assert.match(opciones[0][1], /predeterminada/);
    assert.equal(opciones[1][0], 'navegador');
    assert.match(opciones[1][1], /terceros/);
  });
});

describe('Motor del navegador: consentimiento explícito', () => {
  it('al elegirlo aparece la advertencia de privacidad y no se recuerda como consentido', async () => {
    await reiniciar(null);
    await elegir('navegador');
    assert.equal(await panelOculto(), false);
    assert.match(await navegador.evaluar(() => document.getElementById('consentimientoNavegador').innerText), /puede enviar tu voz a servicios externos/);
    assert.equal(await guardado(), 'local');
    await navegador.recargar();
    assert.equal(await motor(), 'local');
  });

  it('sin aceptar, el micrófono no inicia el reconocimiento externo', async () => {
    await reiniciar(null);
    await elegir('navegador');
    await pulsar('micBtn');
    await esperar(300);
    assert.match(await aviso(), /acepta primero el aviso/);
    assert.equal(await reconocimientosCreados(), 0);
    assert.equal(await navegador.evaluar(() => document.getElementById('micBtn').classList.contains('recording')), false);
  });

  it('al aceptar se recuerda el consentimiento y el motor del navegador funciona', async () => {
    await reiniciar(null);
    await elegir('navegador');
    await pulsar('aceptarMotorNavegador');
    assert.equal(await panelOculto(), true);
    assert.equal(await guardado(), 'navegador-consentido');
    await pulsar('micBtn');
    await esperar(300);
    assert.equal(await reconocimientosCreados(), 1);
    await pulsar('micBtn');
    await navegador.recargar();
    assert.equal(await motor(), 'navegador');
    assert.equal(await panelOculto(), true);
  });

  it('volver a la IA local elimina el consentimiento y obliga a aceptar de nuevo', async () => {
    await reiniciar('navegador-consentido');
    assert.equal(await motor(), 'navegador');
    await elegir('local');
    assert.equal(await guardado(), 'local');
    await elegir('navegador');
    assert.equal(await panelOculto(), false);
    await pulsar('volverIaLocal');
    assert.equal(await motor(), 'local');
    assert.equal(await guardado(), 'local');
    assert.equal(await panelOculto(), true);
  });

  it('el aviso de privacidad del motor del navegador queda visible mientras se usa', async () => {
    await reiniciar('navegador-consentido');
    assert.match(await navegador.evaluar(() => document.getElementById('avisoMotor').innerText), /puede enviar el audio a servicios externos/);
  });
});

describe('Nunca se cambia solo al motor externo', () => {
  it('si la IA local falla al cargar, el motor sigue siendo local, el micrófono queda libre y no se crea ningún reconocimiento externo', async () => {
    await reiniciar(null);
    await navegador.interceptarRespuesta('*manifiesto.json', (cuerpo) => {
      const manifiesto = JSON.parse(cuerpo);
      manifiesto.archivos.find((a) => a.nombre === 'joiner.int8.onnx').sha256 = '0'.repeat(64);
      return JSON.stringify(manifiesto);
    });
    await pulsar('micBtn');
    await navegador.esperarCondicion(() => document.getElementById('errorBanner').classList.contains('show'), 'aviso de fallo de la IA local');
    assert.equal(await motor(), 'local');
    assert.equal(await guardado(), null);
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
