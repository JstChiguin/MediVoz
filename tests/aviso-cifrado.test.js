const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { Navegador } = require('./ayudas/navegador');
const { iniciarServidor } = require('./servidor-estatico');
const { SIMULACIONES_BASE } = require('./ayudas/simulaciones');

const CONTRASENA = 'Clave-Ficticia-2026!';
const REGISTROS = [
  { id: 1700000000001, doctor: 'Médico Ficticio Alfa', patient: 'Paciente Ficticio Uno', text: 'Paracetamol 500 mg cada 8 horas por 3 días.', time: '01-01-26 10:00' },
  { id: 1700000000002, doctor: 'Médico Ficticio Beta', patient: 'Paciente Ficticio Dos', text: 'Presión arterial 120/80 mmHg sin hallazgos.', time: '01-01-26 10:05' }
];

const TITULO = 'Protege tu historial';
const TEXTO = 'Para cifrar las transcripciones guardadas, presiona el botón 🔒 Seguridad y activa el cifrado con una contraseña. Si no lo activas, el historial se guardará sin cifrar en este navegador.';
const PRECAUCION = 'Guarda tu contraseña en un lugar seguro. Si la pierdes, no podrás recuperar las transcripciones cifradas.';

let servidor;
let navegador;

before(async () => {
  servidor = await iniciarServidor();
  navegador = await Navegador.abrir();
  await navegador.scriptInicial(SIMULACIONES_BASE);
});

after(async () => {
  await navegador.cerrar();
  servidor.servidor.close();
});

async function iniciar(vista = { ancho: 390, alto: 844, movil: true }) {
  await navegador.configurarVista(vista);
  await navegador.ir(servidor.url);
  await navegador.evaluar((registros) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('mediVozMedicos', JSON.stringify(['Médico Ficticio Alfa']));
    localStorage.setItem('mediVozHistory', JSON.stringify(registros));
  }, REGISTROS);
  await navegador.recargar();
}

const aviso = () => navegador.evaluar(() => ({
  titulo: document.getElementById('tituloAvisoCifrado').textContent,
  texto: document.getElementById('textoAvisoCifrado').textContent,
  precaucion: document.getElementById('precaucionAvisoCifrado').textContent,
  precaucionVisible: !document.getElementById('precaucionAvisoCifrado').hidden
}));
const almacenado = () => navegador.evaluar(() => Object.fromEntries(Object.keys(localStorage).map((k) => [k, localStorage.getItem(k)])));
const estado = () => navegador.evaluar(() => AlmacenSeguro.estado());

async function activarCifrado() {
  await navegador.evaluar(async (c) => {
    document.getElementById('abrirSeguridadBtn').click();
    document.getElementById('contrasenaNueva').value = c;
    document.getElementById('contrasenaRepetida').value = c;
    document.getElementById('formularioCifrado').requestSubmit();
  }, CONTRASENA);
  await navegador.esperarCondicion(() => AlmacenSeguro.estado().cifrado, 'cifrado activado');
}

describe('Aviso para activar el cifrado: contenido y ubicación', () => {
  it('muestra el título, la explicación y la precaución de la contraseña con el texto acordado', async () => {
    await iniciar();
    assert.deepEqual(await aviso(), { titulo: TITULO, texto: TEXTO, precaucion: PRECAUCION, precaucionVisible: true });
  });

  it('está junto al historial, debajo de sus botones y antes de la lista de transcripciones', async () => {
    await iniciar();
    const orden = await navegador.evaluar(() => {
      const seccion = document.querySelector('.history-section');
      const cabecera = document.querySelector('.history-header').getBoundingClientRect();
      const nota = document.getElementById('avisoCifrado').getBoundingClientRect();
      const lista = document.getElementById('historyList').getBoundingClientRect();
      return { dentro: seccion.contains(document.getElementById('avisoCifrado')), despuesDeBotones: nota.top >= cabecera.bottom, antesDeLista: nota.bottom <= lista.top };
    });
    assert.deepEqual(orden, { dentro: true, despuesDeBotones: true, antesDeLista: true });
  });

  it('el botón real de seguridad existe, su rótulo coincide con la instrucción y abre el formulario de cifrado', async () => {
    await iniciar();
    const boton = await navegador.evaluar(() => document.getElementById('abrirSeguridadBtn').textContent.trim());
    assert.equal(boton, '🔒 Seguridad');
    assert.ok((await aviso()).texto.includes(boton), 'la instrucción debe nombrar el botón exactamente como se ve');
    await navegador.evaluar(() => document.getElementById('abrirSeguridadBtn').click());
    const panel = await navegador.evaluar(() => ({
      abierto: !document.getElementById('panelSeguridad').hidden,
      formularioVisible: !document.getElementById('formularioCifrado').hidden,
      campoContrasena: document.getElementById('contrasenaNueva').type
    }));
    assert.deepEqual(panel, { abierto: true, formularioVisible: true, campoContrasena: 'password' });
  });

  it('no afirma que el historial esté cifrado cuando no se ha activado', async () => {
    await iniciar();
    const { titulo, texto } = await aviso();
    assert.doesNotMatch(titulo + texto, /están cifrad|está cifrad|Historial cifrado/);
    assert.match(texto, /Si no lo activas, el historial se guardará sin cifrar/);
  });
});

describe('Aviso para activar el cifrado: no es intrusivo y se adapta a pantallas pequeñas', () => {
  for (const vista of [{ ancho: 320, alto: 568, movil: true }, { ancho: 390, alto: 844, movil: true }, { ancho: 768, alto: 1024, movil: true }, { ancho: 1366, alto: 768, movil: false }]) {
    it(`a ${vista.ancho} px es legible, queda dentro de la pantalla y no tapa botones ni controles`, async () => {
      await iniciar(vista);
      const m = await navegador.evaluar(() => {
        const nota = document.getElementById('avisoCifrado');
        const caja = nota.getBoundingClientRect();
        const estilo = getComputedStyle(nota);
        const intersecta = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
        const controles = [...document.querySelectorAll('button, select, input')].filter((e) => e.offsetParent !== null && !nota.contains(e)).map((e) => e.getBoundingClientRect());
        return {
          posicion: estilo.position,
          tamanoLetra: parseFloat(estilo.fontSize),
          dentro: caja.left >= 0 && caja.right <= document.documentElement.clientWidth,
          desborde: document.documentElement.scrollWidth > document.documentElement.clientWidth,
          tapaControles: controles.some((c) => intersecta(caja, c)),
          texto: nota.scrollWidth <= nota.clientWidth
        };
      });
      assert.equal(m.posicion, 'static');
      assert.ok(m.tamanoLetra >= 11, `letra ilegible: ${m.tamanoLetra}px`);
      assert.equal(m.dentro, true);
      assert.equal(m.desborde, false);
      assert.equal(m.tapaControles, false);
      assert.equal(m.texto, true);
    });
  }

  it('no es una ventana emergente: no hay diálogos visibles ni confirmaciones al abrir la aplicación', async () => {
    await navegador.configurarVista({ ancho: 390, alto: 844, movil: true });
    await navegador.scriptInicial('window.__confirmaciones = 0; window.__alertas = 0; window.alert = () => { window.__alertas++; };');
    await iniciar();
    const m = await navegador.evaluar(() => ({
      dialogosVisibles: [...document.querySelectorAll('[role="dialog"]')].filter((d) => !d.closest('[hidden]')).length,
      alertas: window.__alertas,
      dentroDeVentana: Boolean(document.getElementById('avisoCifrado').closest('[role="dialog"], .medicos-fondo')),
      panelSeguridadOculto: document.getElementById('panelSeguridad').hidden
    }));
    assert.deepEqual(m, { dialogosVisibles: 0, alertas: 0, dentroDeVentana: false, panelSeguridadOculto: true });
  });
});

describe('Aviso para activar el cifrado: refleja el estado real sin tocar los datos', () => {
  it('no activa el cifrado ni modifica el historial ni el almacenamiento al mostrarse', async () => {
    await iniciar();
    const antes = await almacenado();
    await navegador.recargar();
    assert.deepEqual(await estado(), { cifrado: false, bloqueado: false, guardarEnDispositivo: true });
    assert.deepEqual(await almacenado(), antes);
    assert.equal(JSON.parse(antes.mediVozHistory).length, REGISTROS.length);
    assert.equal(antes.mediVozHistorialCifrado, undefined);
    assert.equal(antes.mediVozSeguridad, undefined);
    assert.match(await navegador.evaluar(() => document.getElementById('historyList').innerText), /Paciente Ficticio Uno/);
  });

  it('al activar el cifrado el aviso pasa a confirmar el estado real y conserva la precaución de la contraseña', async () => {
    await iniciar();
    await activarCifrado();
    const activo = await aviso();
    assert.equal(activo.titulo, 'Historial cifrado');
    assert.doesNotMatch(activo.texto, /se guardará sin cifrar/);
    assert.equal(activo.precaucion, PRECAUCION);
    assert.equal(activo.precaucionVisible, true);
    await navegador.evaluar(() => document.getElementById('bloquearBtn').click());
    assert.equal((await aviso()).titulo, 'Historial cifrado');
    assert.deepEqual((await estado()), { cifrado: true, bloqueado: true, guardarEnDispositivo: true });
  });

  it('al desactivar el cifrado el aviso vuelve a invitar a activarlo', async () => {
    await iniciar();
    await activarCifrado();
    await navegador.evaluar((c) => {
      document.getElementById('abrirSeguridadBtn').click();
      document.getElementById('contrasenaDesactivar').value = c;
      document.getElementById('formularioDesactivar').requestSubmit();
    }, CONTRASENA);
    await navegador.esperarCondicion(() => !AlmacenSeguro.estado().cifrado, 'cifrado desactivado');
    assert.deepEqual(await aviso(), { titulo: TITULO, texto: TEXTO, precaucion: PRECAUCION, precaucionVisible: true });
  });

  it('si el historial no se guarda en el dispositivo, el aviso lo dice y no promete un historial sin cifrar guardado', async () => {
    await iniciar();
    await navegador.evaluar(() => {
      document.getElementById('abrirSeguridadBtn').click();
      document.getElementById('guardarEnDispositivo').click();
    });
    const sesion = await aviso();
    assert.equal(sesion.titulo, 'Historial solo en esta sesión');
    assert.doesNotMatch(sesion.texto, /se guardará sin cifrar/);
    assert.equal(sesion.precaucionVisible, false);
    assert.match(sesion.texto, /🔒 Seguridad/);
  });

  it('el aviso no usa innerHTML: solo texto, sin elementos inyectables', async () => {
    const fs = require('fs');
    const path = require('path');
    const codigo = fs.readFileSync(path.join(__dirname, '..', 'js/panel-seguridad.js'), 'utf8');
    assert.doesNotMatch(codigo, /innerHTML|insertAdjacentHTML|outerHTML/);
  });
});
