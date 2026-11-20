const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { Navegador, esperar } = require('./ayudas/navegador');
const { iniciarServidor } = require('./servidor-estatico');

const CLAVE_HISTORIAL = 'mediVozHistory';
const PACIENTE_UNO = 'Paciente Ficticio Uno';
const PACIENTE_DOS = 'Paciente Ficticio Dos';
const TEXTO_UNO = 'Texto ficticio de prueba número uno';
const TEXTO_DOS = 'Texto ficticio de prueba número dos';

const SIMULACIONES = `
  try { if (!localStorage.getItem('mediVozMotor')) localStorage.setItem('mediVozMotor', 'navegador-consentido'); } catch (e) {}
  window.confirm = () => true;
  window.__portapapeles = [];
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: (texto) => { window.__portapapeles.push(texto); return Promise.resolve(); } }
  });
  window.__ventanas = [];
  window.open = () => {
    const ventana = { html: '', impresa: false, document: { write(h) { ventana.html += h; }, close() { if (ventana.onload) ventana.onload(); } }, print() { ventana.impresa = true; } };
    window.__ventanas.push(ventana);
    return ventana;
  };
  window.__reconocimientos = [];
  class ReconocimientoFalso {
    constructor() { this.inicios = 0; this.detenciones = 0; window.__reconocimientos.push(this); }
    start() { this.inicios++; }
    stop() { this.detenciones++; }
  }
  if (sessionStorage.getItem('sinVoz')) {
    window.SpeechRecognition = undefined;
    window.webkitSpeechRecognition = undefined;
  } else {
    window.SpeechRecognition = ReconocimientoFalso;
  }
  window.__descargas = [];
  window.__blobs = {};
  const crearUrlOriginal = URL.createObjectURL.bind(URL);
  URL.createObjectURL = (blob) => { const url = crearUrlOriginal(blob); window.__blobs[url] = blob; return url; };
  HTMLAnchorElement.prototype.click = function () { window.__descargas.push({ nombre: this.download, url: this.href }); };
`;

let servidor;
let navegador;

before(async () => {
  servidor = await iniciarServidor();
  navegador = await Navegador.abrir();
  await navegador.configurarVista({ ancho: 1366, alto: 768, movil: false });
  await navegador.bloquearUrls(['*fonts.googleapis.com*', '*fonts.gstatic.com*']);
  await navegador.scriptInicial(SIMULACIONES);
});

after(async () => {
  await navegador.cerrar();
  servidor.servidor.close();
});

const pulsar = (id) => navegador.evaluar((i) => document.getElementById(i).click(), id);
const historial = () => navegador.evaluar((clave) => JSON.parse(localStorage.getItem(clave) || '[]'), CLAVE_HISTORIAL);
const textoDe = (id) => navegador.evaluar((i) => document.getElementById(i).innerText, id);
const pulsarEnRegistro = (indice, titulo) => navegador.evaluar((i, t) => {
  document.querySelectorAll('.history-item')[i].querySelector(`[title="${t}"]`).click();
}, indice, titulo);

async function guardarRegistro(paciente, texto) {
  await navegador.evaluar((p, t) => {
    document.getElementById('doctorSelect').selectedIndex = 1;
    document.getElementById('patientInput').value = p;
    document.getElementById('transcriptBox').innerText = t;
  }, paciente, texto);
  await pulsar('saveBtn');
  await esperar(5);
}

beforeEach(async () => {
  await navegador.ir(servidor.url);
  await navegador.evaluar(() => {
    localStorage.clear();
    localStorage.setItem('mediVozMedicos', JSON.stringify(['Médico Ficticio Alfa', 'Médico Ficticio Beta']));
  });
  await navegador.recargar();
});

describe('Reconocimiento de voz', () => {
  it('inicia en español de Chile, transcribe y se detiene', async () => {
    await pulsar('micBtn');
    const config = await navegador.evaluar(() => {
      const r = window.__reconocimientos[0];
      return { lang: r.lang, continuo: r.continuous, inicios: r.inicios };
    });
    assert.deepEqual(config, { lang: 'es-CL', continuo: true, inicios: 1 });
    assert.equal(await textoDe('micStatus'), 'Escuchando… hable ahora');

    await navegador.evaluar(() => {
      const resultado = [{ transcript: 'dictado ficticio de prueba' }];
      resultado.isFinal = true;
      window.__reconocimientos[0].onresult({ resultIndex: 0, results: [resultado] });
    });
    assert.match(await textoDe('transcriptBox'), /dictado ficticio de prueba/);

    await pulsar('micBtn');
    assert.equal(await textoDe('micStatus'), 'Presiona el micrófono para dictar');
    assert.equal(await navegador.evaluar(() => window.__reconocimientos[0].detenciones), 1);
  });

  it('muestra y reinicia el temporizador de grabación', async () => {
    await pulsar('micBtn');
    await navegador.esperarCondicion(() => document.getElementById('recordTimer').innerText === '⏱ 00:02', 'temporizador en 00:02');
    await pulsar('micBtn');
    await pulsar('micBtn');
    assert.equal(await textoDe('recordTimer'), '⏱ 00:00');
    await pulsar('micBtn');
  });

  it('recupera la grabación cuando el servicio de voz se corta', async () => {
    await pulsar('micBtn');
    await navegador.evaluar(() => window.__reconocimientos[0].onend());
    assert.equal(await navegador.evaluar(() => window.__reconocimientos[0].inicios), 2);
    await pulsar('micBtn');
    await navegador.evaluar(() => window.__reconocimientos[0].onend());
    assert.equal(await navegador.evaluar(() => window.__reconocimientos[0].inicios), 2);
  });

  it('muestra mensajes de error y detiene la grabación', async () => {
    await pulsar('micBtn');
    await navegador.evaluar(() => window.__reconocimientos[0].onerror({ error: 'not-allowed' }));
    assert.equal(await textoDe('errorBanner'), '⚠ Permiso de micrófono denegado.');
    assert.equal(await textoDe('micStatus'), 'Presiona el micrófono para dictar');
  });

  it('informa cuando el navegador no soporta reconocimiento de voz', async () => {
    await navegador.evaluar(() => sessionStorage.setItem('sinVoz', '1'));
    try {
      await navegador.recargar();
      await pulsar('micBtn');
      assert.match(await textoDe('errorBanner'), /no soporta reconocimiento de voz/);
    } finally {
      await navegador.evaluar(() => sessionStorage.removeItem('sinVoz'));
    }
  });
});

describe('Transcripción y acciones', () => {
  it('permite editar el texto, copiar y borrar', async () => {
    await navegador.evaluar((t) => { document.getElementById('transcriptBox').innerText = t; }, TEXTO_UNO);
    await pulsar('copyBtn');
    assert.deepEqual(await navegador.evaluar(() => window.__portapapeles), [TEXTO_UNO]);
    await pulsar('clearBtn');
    assert.equal(await textoDe('transcriptBox'), 'El texto dictado aparecerá aquí…');
    await pulsar('copyBtn');
    assert.equal(await textoDe('toast'), 'No hay texto para copiar.');
  });

  it('no guarda una transcripción vacía', async () => {
    await pulsar('saveBtn');
    assert.equal(await textoDe('toast'), 'Dicta o escribe algo primero.');
    assert.deepEqual(await historial(), []);
  });
});

describe('Historial local', () => {
  it('guarda con el esquema existente y lo muestra', async () => {
    await guardarRegistro(PACIENTE_UNO, TEXTO_UNO);
    const registros = await historial();
    assert.equal(registros.length, 1);
    assert.deepEqual(Object.keys(registros[0]).sort(), ['doctor', 'id', 'patient', 'text', 'time']);
    assert.equal(registros[0].patient, PACIENTE_UNO);
    assert.equal(registros[0].text, TEXTO_UNO);
    assert.notEqual(registros[0].doctor, 'Médico sin especificar');
    assert.equal(typeof registros[0].id, 'number');
    assert.match(await textoDe('historyList'), new RegExp(PACIENTE_UNO));
    assert.equal(await textoDe('patientInput'), '');
  });

  it('usa valores por defecto sin médico ni paciente', async () => {
    await navegador.evaluar((t) => { document.getElementById('transcriptBox').innerText = t; }, TEXTO_UNO);
    await pulsar('saveBtn');
    const [registro] = await historial();
    assert.equal(registro.doctor, 'Médico sin especificar');
    assert.equal(registro.patient, 'Paciente sin nombre');
  });

  it('conserva los registros guardados al recargar la página', async () => {
    await guardarRegistro(PACIENTE_UNO, TEXTO_UNO);
    await navegador.recargar();
    assert.equal((await historial()).length, 1);
    assert.match(await textoDe('historyList'), new RegExp(PACIENTE_UNO));
  });

  it('mantiene un máximo de 20 registros', async () => {
    for (let i = 0; i < 22; i++) await guardarRegistro('Paciente Ficticio ' + i, 'Texto ficticio ' + i);
    assert.equal((await historial()).length, 20);
  });

  it('copia un registro individual', async () => {
    await guardarRegistro(PACIENTE_UNO, TEXTO_UNO);
    await pulsarEnRegistro(0, 'Copiar');
    const copiado = await navegador.evaluar(() => window.__portapapeles[0]);
    assert.match(copiado, new RegExp(`Paciente: ${PACIENTE_UNO}`));
    assert.match(copiado, new RegExp(TEXTO_UNO));
  });

  it('edita un registro: lo carga en el formulario y lo retira del historial', async () => {
    await guardarRegistro(PACIENTE_UNO, TEXTO_UNO);
    await pulsarEnRegistro(0, 'Editar');
    assert.equal(await navegador.evaluar(() => document.getElementById('patientInput').value), PACIENTE_UNO);
    assert.equal(await textoDe('transcriptBox'), TEXTO_UNO);
    assert.deepEqual(await historial(), []);
  });

  it('elimina un registro individual sin tocar los demás', async () => {
    await guardarRegistro(PACIENTE_UNO, TEXTO_UNO);
    await guardarRegistro(PACIENTE_DOS, TEXTO_DOS);
    await pulsarEnRegistro(0, 'Borrar');
    const restantes = await historial();
    assert.equal(restantes.length, 1);
    assert.equal(restantes[0].patient, PACIENTE_UNO);
  });

  it('exporta un registro a Word', async () => {
    await guardarRegistro(PACIENTE_UNO, TEXTO_UNO);
    await navegador.esperarCondicion(() => typeof window.docx !== 'undefined', 'biblioteca docx cargada');
    await pulsarEnRegistro(0, 'Exportar Word');
    await navegador.esperarCondicion(() => window.__descargas.length === 1, 'descarga generada');
    const descarga = await navegador.evaluar(async () => {
      const { nombre, url } = window.__descargas[0];
      const bytes = new Uint8Array(await window.__blobs[url].arrayBuffer());
      return { nombre, firmaZip: String.fromCharCode(bytes[0], bytes[1]), tamano: bytes.length };
    });
    assert.equal(descarga.nombre, 'Transcripcion_MediVoz.docx');
    assert.equal(descarga.firmaZip, 'PK');
    assert.ok(descarga.tamano > 1000);
  });

  it('imprime un registro individual', async () => {
    await guardarRegistro(PACIENTE_UNO, TEXTO_UNO);
    await pulsarEnRegistro(0, 'Imprimir');
    const ventana = await navegador.evaluar(() => window.__ventanas[0]);
    assert.equal(ventana.impresa, true);
    assert.match(ventana.html, new RegExp(PACIENTE_UNO));
    assert.match(ventana.html, new RegExp(TEXTO_UNO));
  });

  it('imprime el historial completo', async () => {
    await guardarRegistro(PACIENTE_UNO, TEXTO_UNO);
    await guardarRegistro(PACIENTE_DOS, TEXTO_DOS);
    await pulsar('printHistoryBtn');
    const ventana = await navegador.evaluar(() => window.__ventanas[0]);
    assert.equal(ventana.impresa, true);
    assert.match(ventana.html, new RegExp(PACIENTE_UNO));
    assert.match(ventana.html, new RegExp(PACIENTE_DOS));
  });

  it('elimina el historial completo', async () => {
    await guardarRegistro(PACIENTE_UNO, TEXTO_UNO);
    await pulsar('clearHistoryBtn');
    assert.equal(await navegador.evaluar((c) => localStorage.getItem(c), CLAVE_HISTORIAL), null);
    assert.match(await textoDe('historyList'), /Aún no hay transcripciones guardadas\./);
  });
});

describe('Estructura de archivos', () => {
  it('carga estilos y scripts mediante rutas relativas', async () => {
    const rutas = await navegador.evaluar(() => ({
      estilos: [...document.querySelectorAll('link[rel="stylesheet"]')].map((l) => l.getAttribute('href')).filter((h) => !h.startsWith('http')),
      scripts: [...document.querySelectorAll('script[src]')].map((s) => s.getAttribute('src')).filter((h) => !h.startsWith('http')),
      estilosEnLinea: document.querySelectorAll('style').length,
      scriptsEnLinea: [...document.querySelectorAll('script:not([src])')].length
    }));
    assert.deepEqual(rutas.estilos, ['css/fuentes.css', 'css/styles.css']);
    assert.deepEqual(rutas.scripts, ['js/vendor/docx-8.5.0.umd.js', 'js/config.js', 'js/medicos.js', 'js/almacen-seguro.js', 'js/panel-seguridad.js', 'js/panel-diccionario.js', 'js/script.js']);
    assert.equal(rutas.estilosEnLinea, 0);
    assert.equal(rutas.scriptsEnLinea, 0);
  });
});
