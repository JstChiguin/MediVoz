const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { Navegador } = require('./ayudas/navegador');
const { iniciarServidor } = require('./servidor-estatico');

const VERSION_ESPERADA = '2.0.0';
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

    it('muestra la versión 2.0.0 tomada de config.js', async () => {
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
      const posiciones = ['arriba', 'medio', 'final'];
      for (const posicion of posiciones) {
        await navegador.evaluar((pos) => {
          const maximo = document.documentElement.scrollHeight - window.innerHeight;
          window.scrollTo(0, pos === 'arriba' ? 0 : pos === 'medio' ? maximo / 2 : maximo);
        }, posicion);
        const m = await navegador.evaluar(medirFirma);
        assert.ok(m.ventana.ancho - m.firma.derecha <= MARGEN_ESQUINA, `${posicion}: lejos del borde derecho`);
        assert.ok(m.ventana.alto - m.firma.abajo <= MARGEN_ESQUINA, `${posicion}: lejos del borde inferior`);
        assert.ok(m.firma.izquierda > m.ventana.ancho / 2, `${posicion}: la firma cruza el centro horizontal`);
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
        versionesVisibles: document.body.innerText.split('v2.0.0').length - 1
      }));
      assert.equal(conteo.elementos, 1);
      assert.equal(conteo.textosVisibles, 1);
      assert.equal(conteo.textosTotales, 1);
      assert.equal(conteo.versionesVisibles, 1);
    });

    it('no tapa botones, campos ni controles al llegar al final de la página', async () => {
      await navegador.evaluar(() => window.scrollTo(0, document.documentElement.scrollHeight));
      const solapados = await navegador.evaluar(() => {
        const f = document.querySelector('firma-medivoz').getBoundingClientRect();
        return [...document.querySelectorAll('button, input, select, [contenteditable="true"]')]
          .filter((el) => {
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.height > 0 &&
              r.left < f.right && r.right > f.left && r.top < f.bottom && r.bottom > f.top;
          })
          .map((el) => el.id || el.className || el.tagName);
      });
      assert.deepEqual(solapados, []);
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

  it('config.js declara la versión 2.0.0', () => {
    assert.match(leer('js/config.js'), /version:\s*'2\.0\.0'/);
  });

  it('la versión no está escrita en index.html, script.js ni styles.css', () => {
    for (const archivo of ['index.html', 'js/script.js', 'css/styles.css']) {
      assert.ok(!leer(archivo).includes('2.0.0'), `${archivo} contiene la versión escrita`);
    }
  });

  it('index.html contiene una sola firma y ninguna firma textual adicional', () => {
    const html = leer('index.html');
    assert.equal(html.split('<firma-medivoz').length - 1, 1);
    assert.ok(!html.includes('by Chiguin'));
  });
});
