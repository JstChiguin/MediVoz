const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { Navegador } = require('./ayudas/navegador');
const { iniciarServidor } = require('./servidor-estatico');

const VERSION_ESPERADA = '2.2.1';
const TEXTO_FIRMA = 'by Chiguin';
const MARGEN_ESQUINA = 48;

const vistas = [
  { nombre: 'escritorio', ancho: 1366, alto: 768, movil: false },
  { nombre: 'móvil', ancho: 390, alto: 844, movil: true }
];

let servidor;
let navegador;

before(async () => {
  servidor = await iniciarServidor();
  navegador = await Navegador.abrir();
  await navegador.bloquearUrls(['*fonts.googleapis.com*', '*fonts.gstatic.com*', '*unpkg.com*']);
});

after(async () => {
  await navegador.cerrar();
  servidor.servidor.close();
});

function medirFirma() {
  const firma = document.querySelector('firma-medivoz');
  const autor = firma && firma.querySelector('.firma-medivoz__autor');
  const version = firma && firma.querySelector('.firma-medivoz__version');
  const caja = (el) => {
    const r = el.getBoundingClientRect();
    return { izquierda: r.left, derecha: r.right, arriba: r.top, abajo: r.bottom, ancho: r.width, alto: r.height };
  };
  const estilo = getComputedStyle(firma);
  return {
    existe: Boolean(firma),
    posicion: estilo.position,
    display: estilo.display,
    visibilidad: estilo.visibility,
    opacidad: Number(estilo.opacity),
    textoAutor: autor.innerText,
    textoVersion: version.innerText,
    tamanoAutor: parseFloat(getComputedStyle(autor).fontSize),
    tamanoVersion: parseFloat(getComputedStyle(version).fontSize),
    firma: caja(firma),
    autor: caja(autor),
    version: caja(version),
    ventana: { ancho: window.innerWidth, alto: window.innerHeight }
  };
}

function desplazarA(fraccion) {
  const elemento = document.scrollingElement;
  elemento.scrollTop = fraccion * (elemento.scrollHeight - elemento.clientHeight);
}

function medirSolapes() {
  const firma = document.querySelector('firma-medivoz').getBoundingClientRect();
  const reserva = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--reserva-firma')) || 0;
  const recorte = { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight - reserva };
  const cruza = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  const visible = (r) => ({
    left: Math.max(r.left, recorte.left),
    right: Math.min(r.right, recorte.right),
    top: Math.max(r.top, recorte.top),
    bottom: Math.min(r.bottom, recorte.bottom)
  });
  const controles = [...document.querySelectorAll('button, input, select, [contenteditable="true"]')]
    .filter((el) => {
      const r = visible(el.getBoundingClientRect());
      return r.right > r.left && r.bottom > r.top && cruza(r, firma);
    })
    .map((el) => el.id || el.title || el.className || el.tagName);
  const tarjeta = visible(document.querySelector('.card').getBoundingClientRect());
  return {
    controles,
    tarjeta: tarjeta.right > tarjeta.left && tarjeta.bottom > tarjeta.top && cruza(tarjeta, firma),
    reserva,
    firmaEnFranja: reserva === 0 || firma.top >= recorte.bottom - 0.5,
    ventana: { ancho: window.innerWidth, alto: window.innerHeight },
    firma: { derecha: firma.right, abajo: firma.bottom, izquierda: firma.left }
  };
}

const resoluciones = [
  [320, 568], [360, 640], [375, 667], [390, 844], [412, 915], [540, 720],
  [768, 1024], [844, 390], [1024, 768], [1100, 700], [1101, 700], [1366, 768]
];

for (const [ancho, alto] of resoluciones) {
  describe(`Firma sin superposición a ${ancho}x${alto}`, () => {
    it('queda fija en la esquina y nunca cubre controles ni contenido durante todo el scroll', async () => {
      await navegador.configurarVista({ ancho, alto, movil: ancho <= 520 });
      await navegador.ir(servidor.url);
      await navegador.evaluar(() => {
        const registros = Array.from({ length: 6 }, (_, i) => ({
          id: 1000 + i,
          doctor: 'Médico Ficticio',
          patient: 'Paciente Ficticio ' + i,
          text: 'Texto ficticio de prueba ' + i,
          time: '01-01-26 10:0' + i
        }));
        localStorage.setItem('mediVozHistory', JSON.stringify(registros));
      });
      await navegador.ir(servidor.url);
      await navegador.esperarCondicion(() => document.querySelectorAll('.history-item').length === 6, 'historial cargado');
      for (let paso = 0; paso <= 20; paso++) {
        await navegador.evaluar(desplazarA, paso / 20);
        const s = await navegador.evaluar(medirSolapes);
        const etiqueta = `scroll ${paso / 20}`;
        assert.deepEqual(s.controles, [], etiqueta + ': firma sobre controles');
        assert.equal(s.tarjeta, false, etiqueta + ': firma sobre el contenido');
        assert.equal(s.firmaEnFranja, true, etiqueta + ': firma fuera de la franja reservada');
        assert.ok(s.ventana.ancho - s.firma.derecha <= MARGEN_ESQUINA, etiqueta + ': fuera de la esquina derecha');
        assert.ok(s.ventana.alto - s.firma.abajo <= MARGEN_ESQUINA, etiqueta + ': fuera de la esquina inferior');
        assert.ok(s.firma.izquierda > s.ventana.ancho / 2, etiqueta + ': firma centrada');
      }
      await navegador.evaluar(() => localStorage.clear());
    });
  });
}

for (const vista of vistas) {
  describe(`Firma flotante en ${vista.nombre}`, () => {
    beforeEach(async () => {
      await navegador.configurarVista(vista);
      await navegador.ir(servidor.url);
      await navegador.esperarCondicion(() => Boolean(document.querySelector('firma-medivoz .firma-medivoz__autor')), 'firma renderizada');
    });

    it('muestra exactamente el texto "by Chiguin"', async () => {
      const medida = await navegador.evaluar(medirFirma);
      assert.equal(medida.textoAutor, TEXTO_FIRMA);
      const crudo = await navegador.evaluar(() => document.querySelector('.firma-medivoz__autor').textContent);
      assert.equal(crudo, TEXTO_FIRMA);
    });

    it('muestra la versión 2.2.1 tomada de config.js', async () => {
      const medida = await navegador.evaluar(medirFirma);
      const configuracion = await navegador.evaluar(() => window.MEDIVOZ_CONFIG.version);
      assert.equal(configuracion, VERSION_ESPERADA);
      assert.equal(medida.textoVersion, 'v' + VERSION_ESPERADA);
    });

    it('está visible', async () => {
      const m = await navegador.evaluar(medirFirma);
      assert.notEqual(m.display, 'none');
      assert.equal(m.visibilidad, 'visible');
      assert.ok(m.opacidad >= 0.5, 'opacidad demasiado baja: ' + m.opacidad);
      assert.ok(m.firma.ancho > 20 && m.firma.alto > 10, 'tamaño visible insuficiente');
      assert.ok(m.firma.izquierda >= 0 && m.firma.arriba >= 0);
      assert.ok(m.firma.derecha <= m.ventana.ancho && m.firma.abajo <= m.ventana.alto);
    });

    it('usa posicionamiento fijo', async () => {
      const m = await navegador.evaluar(medirFirma);
      assert.equal(m.posicion, 'fixed');
    });

    it('permanece en la esquina inferior derecha, sin centrarse, incluso al desplazarse', async () => {
      for (const fraccion of [0, 0.5, 1]) {
        await navegador.evaluar(desplazarA, fraccion);
        const m = await navegador.evaluar(medirFirma);
        assert.ok(m.ventana.ancho - m.firma.derecha <= MARGEN_ESQUINA, `${fraccion}: lejos del borde derecho`);
        assert.ok(m.ventana.alto - m.firma.abajo <= MARGEN_ESQUINA, `${fraccion}: lejos del borde inferior`);
        assert.ok(m.firma.izquierda > m.ventana.ancho / 2, `${fraccion}: la firma cruza el centro horizontal`);
      }
    });

    it('muestra la versión debajo, más pequeña y centrada respecto del texto de la firma', async () => {
      const m = await navegador.evaluar(medirFirma);
      assert.ok(m.version.arriba >= m.autor.abajo - 1, 'la versión no está debajo del texto');
      assert.ok(m.tamanoVersion < m.tamanoAutor, 'la versión no es más pequeña');
      const centroAutor = (m.autor.izquierda + m.autor.derecha) / 2;
      const centroVersion = (m.version.izquierda + m.version.derecha) / 2;
      assert.ok(Math.abs(centroAutor - centroVersion) <= 1.5, 'la versión no está centrada respecto de la firma');
    });

    it('no se duplica visualmente', async () => {
      const conteo = await navegador.evaluar(() => ({
        elementos: document.querySelectorAll('firma-medivoz').length,
        textosVisibles: document.body.innerText.split('by Chiguin').length - 1,
        textosTotales: document.body.textContent.split('by Chiguin').length - 1,
        versionesVisibles: document.body.innerText.split('v2.2.1').length - 1
      }));
      assert.equal(conteo.elementos, 1);
      assert.equal(conteo.textosVisibles, 1);
      assert.equal(conteo.textosTotales, 1);
      assert.equal(conteo.versionesVisibles, 1);
    });

    it('no intercepta clics ni toques', async () => {
      const m = await navegador.evaluar(() => getComputedStyle(document.querySelector('firma-medivoz')).pointerEvents);
      assert.equal(m, 'none');
    });

    it('resiste estilos que intenten ocultarla o moverla', async () => {
      await navegador.evaluar(() => {
        const estilo = document.createElement('style');
        estilo.textContent = 'firma-medivoz, [class*="firma"] { display:none; visibility:hidden; opacity:0; position:static; right:auto; left:0; text-transform:uppercase; }';
        document.head.appendChild(estilo);
      });
      const m = await navegador.evaluar(medirFirma);
      assert.equal(m.posicion, 'fixed');
      assert.equal(m.visibilidad, 'visible');
      assert.notEqual(m.display, 'none');
      assert.equal(m.textoAutor, TEXTO_FIRMA);
      assert.ok(m.firma.izquierda > m.ventana.ancho / 2);
    });

    it('se restaura si el elemento es eliminado o duplicado', async () => {
      await navegador.evaluar(() => document.querySelector('firma-medivoz').remove());
      await navegador.esperarCondicion(() => document.querySelectorAll('firma-medivoz').length === 1, 'firma restaurada');
      await navegador.evaluar(() => document.body.appendChild(document.createElement('firma-medivoz')));
      await navegador.esperarCondicion(() => document.querySelectorAll('firma-medivoz').length === 1, 'duplicado retirado');
      const m = await navegador.evaluar(medirFirma);
      assert.equal(m.textoAutor, TEXTO_FIRMA);
    });
  });
}

describe('Versión centralizada', () => {
  const raiz = path.resolve(__dirname, '..');
  const leer = (archivo) => fs.readFileSync(path.join(raiz, archivo), 'utf8');

  it('config.js declara la versión 2.2.1', () => {
    assert.match(leer('js/config.js'), /version:\s*'2\.2\.1'/);
  });

  it('la versión no está escrita en index.html, script.js ni styles.css', () => {
    for (const archivo of ['index.html', 'js/script.js', 'css/styles.css']) {
      assert.ok(!leer(archivo).includes('2.2.1'), `${archivo} contiene la versión escrita`);
    }
  });

  it('index.html contiene una sola firma y ninguna firma textual adicional', () => {
    const html = leer('index.html');
    assert.equal(html.split('<firma-medivoz').length - 1, 1);
    assert.ok(!html.includes('by Chiguin'));
  });
});
