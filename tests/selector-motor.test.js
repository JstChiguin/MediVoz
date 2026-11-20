const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { Navegador } = require('./ayudas/navegador');
const { iniciarServidor } = require('./servidor-estatico');

const vistas = [
  { ancho: 320, alto: 568, movil: true },
  { ancho: 360, alto: 640, movil: true },
  { ancho: 390, alto: 844, movil: true },
  { ancho: 412, alto: 915, movil: true },
  { ancho: 768, alto: 1024, movil: true },
  { ancho: 1366, alto: 768, movil: false }
];

let servidor;
let navegador;

before(async () => {
  servidor = await iniciarServidor();
  navegador = await Navegador.abrir();
  navegador.registrarRed();
});

after(async () => {
  await navegador.cerrar();
  servidor.servidor.close();
});

async function prepararVista({ ancho, alto, movil }) {
  await navegador.configurarVista({ ancho, alto, movil });
  await navegador.ir(servidor.url);
  await navegador.evaluar(() => { localStorage.clear(); sessionStorage.clear(); });
  await navegador.recargar();
}

const medir = () => navegador.evaluar(() => {
  const selector = document.getElementById('motorVoz');
  const caja = selector.getBoundingClientRect();
  const contenedor = selector.closest('.selector-motor').getBoundingClientRect();
  const microfono = document.getElementById('micBtn').getBoundingClientRect();
  const aviso = document.getElementById('avisoMotor').getBoundingClientRect();
  const estilo = getComputedStyle(selector);
  const lienzo = document.createElement('canvas').getContext('2d');
  lienzo.font = `${estilo.fontWeight} ${estilo.fontSize} ${estilo.fontFamily}`;
  const anchoTexto = Math.max(...[...selector.options].map((o) => lienzo.measureText(o.textContent).width));
  const intersecta = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  return {
    izquierda: caja.left,
    derecha: caja.right,
    anchoVentana: document.documentElement.clientWidth,
    desbordeHorizontal: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    contenedorDentro: contenedor.left >= 0 && contenedor.right <= document.documentElement.clientWidth,
    tamanoLetra: parseFloat(estilo.fontSize),
    textoCabe: anchoTexto <= selector.clientWidth,
    anchoTexto,
    textos: [...selector.options].map((o) => o.textContent),
    familia: estilo.fontFamily,
    tapaMicrofono: intersecta(caja, microfono) || intersecta(aviso, microfono),
    avisoDebajo: aviso.top >= caja.bottom,
    desplazable: document.documentElement.scrollHeight >= document.documentElement.clientHeight,
    avisoDentro: aviso.left >= 0 && aviso.right <= document.documentElement.clientWidth
  };
});

describe('Selector de motores en distintas pantallas', () => {
  for (const vista of vistas) {
    it(`a ${vista.ancho} px muestra los nombres completos, sin desbordamiento horizontal ni superposiciones`, async () => {
      await prepararVista(vista);
      const m = await medir();
      assert.deepEqual(m.textos, ['IA local — Privada', 'Chrome — Rápido']);
      assert.equal(m.desbordeHorizontal, false);
      assert.equal(m.contenedorDentro, true);
      assert.ok(m.izquierda >= 0 && m.derecha <= m.anchoVentana, `selector fuera de la pantalla: ${m.izquierda}-${m.derecha}`);
      assert.ok(m.textoCabe, `el texto más largo (${m.anchoTexto}px) no cabe en el selector`);
      assert.ok(m.tamanoLetra <= 14, `letra demasiado grande: ${m.tamanoLetra}px`);
      assert.match(m.familia, /Inter/);
      assert.equal(m.tapaMicrofono, false);
      assert.equal(m.avisoDebajo, true);
      assert.equal(m.avisoDentro, true);
    });
  }

  it('con Chrome elegido y el aviso de consentimiento visible sigue sin desbordar a 320 px', async () => {
    await prepararVista(vistas[0]);
    await navegador.evaluar(() => {
      const s = document.getElementById('motorVoz');
      s.value = 'navegador';
      s.dispatchEvent(new Event('change'));
    });
    const m = await medir();
    assert.equal(m.desbordeHorizontal, false);
    assert.ok(m.textoCabe);
    assert.equal(m.tapaMicrofono, false);
    const aviso = await navegador.evaluar(() => ({
      titulo: document.getElementById('tituloAvisoMotor').textContent,
      consentimientoDentro: document.getElementById('consentimientoNavegador').getBoundingClientRect().right <= document.documentElement.clientWidth,
      botonesVisibles: ['aceptarMotorNavegador', 'volverIaLocal'].every((id) => {
        const caja = document.getElementById(id).getBoundingClientRect();
        return caja.width > 0 && caja.right <= document.documentElement.clientWidth;
      })
    }));
    assert.equal(aviso.titulo, 'Chrome — Mayor rapidez');
    assert.equal(aviso.consentimientoDentro, true);
    assert.equal(aviso.botonesVisibles, true);
  });

  it('el desplazamiento vertical sigue disponible y se llega al historial con el aviso del selector abierto', async () => {
    await prepararVista(vistas[0]);
    const resultado = await navegador.evaluar(() => {
      window.scrollTo(0, document.documentElement.scrollHeight);
      const historial = document.getElementById('historyList').getBoundingClientRect();
      return { posicion: window.scrollY, historialVisible: historial.top < window.innerHeight };
    });
    assert.ok(resultado.posicion > 0);
    assert.equal(resultado.historialVisible, true);
  });
});

describe('Accesibilidad del selector de motores', () => {
  it('es un control nativo <select> con etiqueta asociada, enfocable con teclado y con opciones distinguibles', async () => {
    await prepararVista(vistas[2]);
    const accesibilidad = await navegador.evaluar(() => {
      const selector = document.getElementById('motorVoz');
      const etiqueta = document.querySelector('label[for="motorVoz"]');
      selector.focus();
      return {
        etiqueta: etiqueta ? etiqueta.textContent : '',
        nativo: selector.tagName,
        enfocado: document.activeElement === selector,
        tabindexNegativo: selector.tabIndex < 0,
        deshabilitado: selector.disabled,
        valoresUnicos: new Set([...selector.options].map((o) => o.value)).size === selector.options.length,
        textosUnicos: new Set([...selector.options].map((o) => o.textContent)).size === selector.options.length,
        zonaTactil: selector.getBoundingClientRect().height
      };
    });
    assert.equal(accesibilidad.etiqueta, 'Motor de voz');
    assert.equal(accesibilidad.nativo, 'SELECT');
    assert.equal(accesibilidad.enfocado, true);
    assert.equal(accesibilidad.tabindexNegativo, false);
    assert.equal(accesibilidad.deshabilitado, false);
    assert.equal(accesibilidad.valoresUnicos, true);
    assert.equal(accesibilidad.textosUnicos, true);
    assert.ok(accesibilidad.zonaTactil >= 28, `zona táctil de ${accesibilidad.zonaTactil}px`);
  });

  it('el cambio de motor se anuncia a los lectores de pantalla mediante una región en vivo y no oculta el texto', async () => {
    await prepararVista(vistas[2]);
    const region = await navegador.evaluar(() => {
      const aviso = document.getElementById('avisoMotor');
      return { vivo: aviso.getAttribute('aria-live'), oculto: aviso.hidden || getComputedStyle(aviso).display === 'none', texto: aviso.innerText };
    });
    assert.equal(region.vivo, 'polite');
    assert.equal(region.oculto, false);
    assert.match(region.texto, /IA local — Mayor privacidad/);
  });
});
