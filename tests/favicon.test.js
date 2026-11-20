const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { Navegador } = require('./ayudas/navegador');
const { iniciarServidor } = require('./servidor-estatico');

const raiz = path.resolve(__dirname, '..');
const leerTexto = (ruta) => fs.readFileSync(path.join(raiz, ruta), 'utf8');
const leerBytes = (ruta) => fs.readFileSync(path.join(raiz, ruta));
const FIRMA_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PREFIJO_GITHUB_PAGES = '/MediVoz/';

const dimensionesPng = (ruta) => {
  const bytes = leerBytes(ruta);
  assert.ok(bytes.subarray(0, 8).equals(FIRMA_PNG), `${ruta} no es un PNG válido`);
  return { ancho: bytes.readUInt32BE(16), alto: bytes.readUInt32BE(20) };
};

const html = leerTexto('index.html');
const enlaces = [...html.matchAll(/<link\b[^>]*>/g)].map((m) => m[0]);
const atributo = (etiqueta, nombre) => (etiqueta.match(new RegExp(`${nombre}="([^"]*)"`)) || [])[1];
const enlacesDeIcono = enlaces.filter((e) => /rel="(icon|apple-touch-icon)"/.test(e));
const rutaSinConsulta = (url) => url.split('?')[0];

describe('Favicon: archivos y formatos', () => {
  it('existen el .ico clásico con los tamaños 16, 32 y 48 y está en la raíz del sitio', () => {
    const bytes = leerBytes('favicon.ico');
    assert.equal(bytes.readUInt16LE(0), 0);
    assert.equal(bytes.readUInt16LE(2), 1);
    const cantidad = bytes.readUInt16LE(4);
    const anchos = Array.from({ length: cantidad }, (_, i) => bytes[6 + i * 16] || 256).sort((a, b) => a - b);
    assert.deepEqual(anchos, [16, 32, 48]);
  });

  it('los PNG tienen las dimensiones declaradas para escritorio, Android e iOS', () => {
    assert.deepEqual(dimensionesPng('iconos/icono-32.png'), { ancho: 32, alto: 32 });
    assert.deepEqual(dimensionesPng('iconos/icono-192.png'), { ancho: 192, alto: 192 });
    assert.deepEqual(dimensionesPng('iconos/icono-512.png'), { ancho: 512, alto: 512 });
    assert.deepEqual(dimensionesPng('iconos/icono-enmascarable-512.png'), { ancho: 512, alto: 512 });
    assert.deepEqual(dimensionesPng('iconos/apple-touch-icon.png'), { ancho: 180, alto: 180 });
  });

  it('ningún ícono supera un tamaño razonable para una primera carga ligera', () => {
    for (const nombre of ['favicon.ico', ...fs.readdirSync(path.join(raiz, 'iconos')).map((n) => `iconos/${n}`)]) {
      assert.ok(leerBytes(nombre).length < 150 * 1024, nombre);
    }
  });
});

describe('Favicon: referencias en index.html y manifiesto', () => {
  it('index.html declara el ícono clásico, los PNG, el ícono de Apple, el manifiesto y el color del tema', () => {
    const destinos = enlacesDeIcono.map((e) => rutaSinConsulta(atributo(e, 'href'))).sort();
    assert.deepEqual(destinos, ['favicon.ico', 'iconos/apple-touch-icon.png', 'iconos/icono-192.png', 'iconos/icono-32.png']);
    assert.equal(rutaSinConsulta(atributo(enlaces.find((e) => /rel="manifest"/.test(e)), 'href')), 'manifest.webmanifest');
    assert.match(html, /<meta name="theme-color" content="#2a9d8f"\/>/);
  });

  it('todas las rutas son relativas, sin barra inicial ni dominio, para funcionar en /MediVoz/ y en /', () => {
    const manifiesto = JSON.parse(leerTexto('manifest.webmanifest'));
    const rutas = [
      ...enlacesDeIcono.map((e) => atributo(e, 'href')),
      atributo(enlaces.find((e) => /rel="manifest"/.test(e)), 'href'),
      manifiesto.start_url,
      manifiesto.scope,
      ...manifiesto.icons.map((i) => i.src)
    ];
    for (const ruta of rutas) assert.doesNotMatch(ruta, /^(\/|[a-z]+:)/i, ruta);
  });

  it('cada enlace lleva la huella de su archivo como parámetro, de modo que la caché solo se invalida cuando el ícono cambia', () => {
    const huella = (ruta) => crypto.createHash('sha256').update(leerBytes(ruta)).digest('hex').slice(0, 8);
    const manifiesto = JSON.parse(leerTexto('manifest.webmanifest'));
    const referencias = [
      ...enlacesDeIcono.map((e) => atributo(e, 'href')),
      atributo(enlaces.find((e) => /rel="manifest"/.test(e)), 'href'),
      ...manifiesto.icons.map((i) => i.src)
    ];
    for (const referencia of referencias) {
      const [ruta, consulta] = referencia.split('?');
      assert.equal(consulta, `h=${huella(ruta)}`, `${ruta} tiene una huella desactualizada`);
    }
  });

  it('el manifiesto es válido, apunta a archivos existentes y declara tamaños reales y un ícono enmascarable', () => {
    const manifiesto = JSON.parse(leerTexto('manifest.webmanifest'));
    assert.equal(manifiesto.short_name, 'MediVoz');
    assert.equal(manifiesto.theme_color, '#2a9d8f');
    assert.ok(manifiesto.icons.some((i) => i.sizes === '192x192'));
    assert.ok(manifiesto.icons.some((i) => i.sizes === '512x512' && i.purpose === 'any'));
    assert.ok(manifiesto.icons.some((i) => i.purpose === 'maskable'));
    for (const icono of manifiesto.icons) {
      const [ancho, alto] = icono.sizes.split('x').map(Number);
      assert.deepEqual(dimensionesPng(rutaSinConsulta(icono.src)), { ancho, alto });
    }
  });

  it('la CSP permite el manifiesto solo del propio sitio y mantiene el resto de restricciones', () => {
    const politica = html.match(/Content-Security-Policy" content="([^"]*)"/)[1];
    assert.match(politica, /manifest-src 'self'/);
    assert.match(politica, /img-src 'self' data:/);
    assert.match(politica, /connect-src 'self'/);
    assert.match(politica, /default-src 'none'/);
  });

  it('el diseño es el original: estetoscopio sobre degradado turquesa de la identidad visual', () => {
    const estilos = leerTexto('css/styles.css');
    assert.match(estilos, /--teal:#2a9d8f; --teal-lt:#3dbfb0/);
    assert.match(html, /<div class="brand-icon">🩺<\/div>/);
  });
});

function servidorConPrefijo(destino) {
  return new Promise((resolver) => {
    const servidor = http.createServer((peticion, respuesta) => {
      if (!peticion.url.startsWith(PREFIJO_GITHUB_PAGES)) {
        respuesta.writeHead(404);
        respuesta.end();
        return;
      }
      const url = new URL(peticion.url.slice(PREFIJO_GITHUB_PAGES.length - 1), destino);
      http.get(url, (interna) => {
        respuesta.writeHead(interna.statusCode, interna.headers);
        interna.pipe(respuesta);
      });
    });
    servidor.listen(0, '127.0.0.1', () => resolver({ servidor, url: `http://127.0.0.1:${servidor.address().port}${PREFIJO_GITHUB_PAGES}` }));
  });
}

describe('Favicon: carga real en el navegador en la raíz (Cloudflare) y en /MediVoz/ (GitHub Pages)', () => {
  let servidor;
  let conPrefijo;
  let navegador;

  before(async () => {
    servidor = await iniciarServidor();
    conPrefijo = await servidorConPrefijo(servidor.url);
    navegador = await Navegador.abrir();
    navegador.registrarRed();
  });

  after(async () => {
    await navegador.cerrar();
    servidor.servidor.close();
    conPrefijo.servidor.close();
  });

  const comprobarCarga = async (url) => {
    navegador.solicitudes.length = 0;
    await navegador.ir(url);
    const resultado = await navegador.evaluar(async () => {
      const iconos = [...document.querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"]')];
      const cargados = await Promise.all(iconos.map(async (enlace) => {
        const respuesta = await fetch(enlace.href);
        const imagen = new Image();
        imagen.src = enlace.href;
        await imagen.decode();
        return { href: enlace.href, estado: respuesta.status, tipo: respuesta.headers.get('content-type'), ancho: imagen.naturalWidth };
      }));
      const enlaceManifiesto = document.querySelector('link[rel="manifest"]');
      const respuestaManifiesto = await fetch(enlaceManifiesto.href);
      const manifiesto = await respuestaManifiesto.json();
      const iconosManifiesto = await Promise.all(manifiesto.icons.map(async (i) => (await fetch(new URL(i.src, enlaceManifiesto.href))).status));
      return { cargados, estadoManifiesto: respuestaManifiesto.status, iconosManifiesto, version: window.MEDIVOZ_CONFIG.version, firma: window.MEDIVOZ_CONFIG.firma };
    });
    assert.equal(resultado.cargados.length, 4);
    for (const icono of resultado.cargados) {
      assert.equal(icono.estado, 200, icono.href);
      assert.match(icono.tipo, /^image\//, icono.href);
      assert.ok(icono.ancho >= 16, icono.href);
    }
    assert.equal(resultado.estadoManifiesto, 200);
    assert.deepEqual(resultado.iconosManifiesto, [200, 200, 200]);
    assert.equal(resultado.version, '2.2.2');
    assert.equal(resultado.firma, 'by Chiguin');
  };

  it('en la raíz del dominio (Cloudflare Pages) los íconos y el manifiesto se cargan sin errores', async () => {
    await comprobarCarga(servidor.url);
  });

  it('bajo el prefijo /MediVoz/ (GitHub Pages) los íconos y el manifiesto se cargan sin errores', async () => {
    await comprobarCarga(conPrefijo.url);
  });

  it('el navegador no recibe violaciones de CSP por los íconos ni por el manifiesto', async () => {
    await navegador.scriptInicial('window.__violacionesCsp = []; document.addEventListener("securitypolicyviolation", (e) => window.__violacionesCsp.push(e.violatedDirective));');
    await navegador.ir(servidor.url);
    await navegador.evaluar(async () => { await fetch(document.querySelector('link[rel="manifest"]').href); });
    assert.deepEqual(await navegador.evaluar(() => window.__violacionesCsp), []);
  });
});
