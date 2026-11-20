const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { execFileSync } = require('child_process');
const { iniciarServidor, leerCabeceras, cabecerasPara } = require('./servidor-estatico');

const raiz = path.resolve(__dirname, '..');
const leer = (ruta) => fs.readFileSync(path.join(raiz, ruta), 'utf8');
const MIB = 1024 * 1024;

const reglas = leerCabeceras(leer('_headers'));
const cabeceras = cabecerasPara(reglas, '/index.html');
const archivosRastreados = () => execFileSync('git', ['ls-files'], { cwd: raiz, encoding: 'utf8' }).split('\n').filter(Boolean);

function directivas(politica) {
  return Object.fromEntries(politica.split(';').map((d) => d.trim()).filter(Boolean).map((d) => {
    const [nombre, ...valores] = d.split(/\s+/);
    return [nombre, valores];
  }));
}

describe('Cabeceras HTTP de seguridad para Cloudflare Pages (_headers)', () => {
  it('respeta el formato y los límites de Cloudflare Pages (100 reglas, 2000 caracteres por línea)', () => {
    const texto = leer('_headers');
    assert.ok(reglas.length >= 1 && reglas.length <= 100);
    for (const linea of texto.split(/\r?\n/)) assert.ok(linea.length <= 2000);
    for (const regla of reglas) {
      assert.match(regla.patron, /^\//, 'cada regla empieza por una ruta');
      assert.ok(regla.cabeceras.length > 0);
      for (const [nombre, valor] of regla.cabeceras) {
        assert.match(nombre, /^[A-Za-z][A-Za-z0-9-]*$/);
        assert.ok(valor.length > 0, nombre);
      }
    }
  });

  it('la CSP de la cabecera coincide con la de la etiqueta <meta> y solo añade frame-ancestors', () => {
    const meta = leer('index.html').match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
    const deMeta = directivas(meta);
    const deCabecera = directivas(cabeceras['Content-Security-Policy']);
    assert.deepEqual(deCabecera['frame-ancestors'], ["'none'"]);
    delete deCabecera['frame-ancestors'];
    assert.deepEqual(deCabecera, deMeta);
  });

  it('la CSP es estricta: sin unsafe-inline, unsafe-eval, comodines ni orígenes externos', () => {
    const politica = cabeceras['Content-Security-Policy'];
    assert.doesNotMatch(politica, /'unsafe-inline'|'unsafe-eval'|\*|https?:/);
    const d = directivas(politica);
    assert.deepEqual(d['default-src'], ["'none'"]);
    assert.deepEqual(d['script-src'], ["'self'", "'wasm-unsafe-eval'"]);
    assert.deepEqual(d['connect-src'], ["'self'"]);
    assert.deepEqual(d['object-src'], ["'none'"]);
    assert.deepEqual(d['base-uri'], ["'none'"]);
    assert.deepEqual(d['form-action'], ["'none'"]);
  });

  it('conserva lo imprescindible para la IA local: WebAssembly, Web Worker y descarga del modelo en el mismo origen', () => {
    const d = directivas(cabeceras['Content-Security-Policy']);
    assert.ok(d['script-src'].includes("'wasm-unsafe-eval'"), 'ONNX Runtime necesita compilar WebAssembly');
    assert.deepEqual(d['worker-src'], ["'self'"]);
    assert.ok(d['connect-src'].includes("'self'"), 'el modelo se descarga con fetch del propio sitio');
    assert.ok(d['img-src'].includes('data:'));
  });

  it('impide la incrustación, el sniffing de tipos, el envío de referrer y el uso de sensores innecesarios', () => {
    assert.equal(cabeceras['X-Frame-Options'], 'DENY');
    assert.equal(cabeceras['X-Content-Type-Options'], 'nosniff');
    assert.equal(cabeceras['Referrer-Policy'], 'no-referrer');
    assert.equal(cabeceras['Cross-Origin-Resource-Policy'], 'same-origin');
    assert.match(cabeceras['Strict-Transport-Security'], /^max-age=(\d+)/);
    assert.ok(Number(cabeceras['Strict-Transport-Security'].match(/max-age=(\d+)/)[1]) >= 31536000);
  });

  it('el micrófono sigue permitido solo para el propio sitio y el resto de permisos queda denegado', () => {
    const permisos = Object.fromEntries(cabeceras['Permissions-Policy'].split(',').map((p) => p.trim().split('=')));
    assert.equal(permisos.microphone, '(self)');
    for (const nombre of ['camera', 'geolocation', 'payment', 'usb', 'display-capture']) assert.equal(permisos[nombre], '()', nombre);
  });

  it('la política de apertura cruzada mantiene la ventana de impresión (window.open) sin exponer el origen', () => {
    assert.equal(cabeceras['Cross-Origin-Opener-Policy'], 'same-origin-allow-popups');
    assert.match(leer('js/script.js'), /window\.open\(/);
  });

  it('no usa COEP ni subprocesos compartidos: la IA corre con un hilo y no necesita aislamiento de origen cruzado', () => {
    assert.equal(cabeceras['Cross-Origin-Embedder-Policy'], undefined);
    assert.match(leer('js/ia/trabajador.js'), /numThreads = 1/);
    assert.doesNotMatch(leer('js/ia/trabajador.js'), /SharedArrayBuffer/);
  });

  it('el analizador de pruebas aplica las reglas por ruta, incluidos los comodines', () => {
    const r = leerCabeceras('/*\n  A: 1\n/js/*\n  B: 2\n/exacta.html\n  C: 3\n');
    assert.deepEqual(cabecerasPara(r, '/js/x.js'), { A: '1', B: '2' });
    assert.deepEqual(cabecerasPara(r, '/exacta.html'), { A: '1', C: '3' });
    assert.deepEqual(cabecerasPara(r, '/otra'), { A: '1' });
  });
});

describe('Cabeceras entregadas por el servidor de pruebas (misma configuración que Cloudflare Pages)', () => {
  let servidor;
  after(() => { if (servidor) servidor.servidor.close(); });

  function pedir(url) {
    return new Promise((resolver, rechazar) => {
      (url.startsWith('https:') ? https : http).get(url, (respuesta) => { respuesta.resume(); respuesta.on('end', () => resolver(respuesta)); }).on('error', rechazar);
    });
  }

  it('cada tipo de recurso (página, script, worker, wasm, modelo, 404) lleva las cabeceras de seguridad', async () => {
    servidor = await iniciarServidor();
    const rutas = ['', 'js/script.js', 'js/ia/trabajador.js', 'js/vendor/ort/ort-wasm-simd-threaded.wasm', 'modelos/conformer-es/manifiesto.json', 'css/styles.css'];
    for (const ruta of rutas) {
      const respuesta = await pedir(servidor.url + ruta);
      assert.equal(respuesta.statusCode, 200, ruta);
      for (const nombre of ['content-security-policy', 'x-content-type-options', 'permissions-policy', 'x-frame-options', 'referrer-policy']) {
        assert.ok(respuesta.headers[nombre], `${ruta} sin ${nombre}`);
      }
    }
    assert.match((await pedir(servidor.url + 'js/vendor/ort/ort-wasm-simd-threaded.wasm')).headers['content-type'], /application\/wasm/);
    assert.match((await pedir(servidor.url + 'js/vendor/ort/ort.wasm.min.mjs')).headers['content-type'], /(text|application)\/javascript/);
    assert.match((await pedir(servidor.url + 'js/ia/trabajador.js')).headers['content-type'], /(text|application)\/javascript/);
    const index = (await pedir(servidor.url)).headers;
    for (const [nombre, valor] of Object.entries(cabeceras)) assert.equal(index[nombre.toLowerCase()], valor, nombre);
  });
});

describe('Requisitos de despliegue en Cloudflare Pages (plan gratuito)', () => {
  it('ningún archivo del sitio supera 25 MiB y el modelo se divide en fragmentos de 20 MiB como máximo', () => {
    for (const archivo of archivosRastreados()) {
      assert.ok(fs.statSync(path.join(raiz, archivo)).size < 25 * MIB, archivo);
    }
    const manifiesto = JSON.parse(leer('modelos/conformer-es/manifiesto.json'));
    assert.equal(manifiesto.tamano_maximo_parte, 20 * MIB);
    for (const parte of manifiesto.archivos.flatMap((a) => a.partes)) {
      assert.ok(fs.statSync(path.join(raiz, 'modelos/conformer-es', parte)).size <= 20 * MIB, parte);
    }
  });

  it('el sitio tiene muchos menos de 20 000 archivos', () => {
    assert.ok(archivosRastreados().length < 1000);
  });

  it('_headers está en la raíz publicada y el índice y la firma "by Chiguin" siguen intactos', () => {
    assert.ok(fs.existsSync(path.join(raiz, '_headers')));
    assert.match(leer('js/config.js'), /firma: 'by Chiguin'/);
    assert.match(leer('js/config.js'), /version: '2\.1\.0'/);
    assert.equal(JSON.parse(leer('package.json')).version, undefined);
  });
});
