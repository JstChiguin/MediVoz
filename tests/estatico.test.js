const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const raiz = path.resolve(__dirname, '..');
const HASH_DOCX_SHA384 = 'e316888acb8b132da5a361e40760b8ac47fbbfc8db4dbda4ba8817e9392e12df5f79358a0521523b3b2a34d6d5fac2a1';

const leer = (ruta) => fs.readFileSync(path.join(raiz, ruta), 'utf8');
const archivosJs = fs.readdirSync(path.join(raiz, 'js')).filter((n) => n.endsWith('.js')).map((n) => 'js/' + n);
const archivosRastreados = () => execFileSync('git', ['ls-files'], { cwd: raiz, encoding: 'utf8' }).split('\n').filter(Boolean);

describe('Auditoría estática del código propio', () => {
  const patronesProhibidos = [
    ['eval(', /\beval\s*\(/],
    ['new Function', /new\s+Function\b/],
    ['setTimeout/setInterval con texto', /set(?:Timeout|Interval)\s*\(\s*['"`]/],
    ['innerHTML', /\.innerHTML\b/],
    ['outerHTML', /\.outerHTML\b/],
    ['insertAdjacentHTML', /insertAdjacentHTML/],
    ['fetch', /\bfetch\s*\(/],
    ['XMLHttpRequest', /XMLHttpRequest/],
    ['sendBeacon', /sendBeacon/],
    ['WebSocket', /WebSocket/],
    ['EventSource', /EventSource/],
    ['importScripts', /importScripts/],
    ['controlador en línea', /\bon[a-z]+\s*=\s*["']/i],
    ['console con datos', /console\.(log|info|debug)\s*\([^)]*(text|transcript|frase|patient|doctor)/i]
  ];

  for (const archivo of archivosJs) {
    it(`${archivo} no usa construcciones peligrosas`, () => {
      const codigo = leer(archivo);
      const hallazgos = patronesProhibidos.filter(([, patron]) => patron.test(codigo)).map(([nombre]) => nombre);
      assert.deepEqual(hallazgos, []);
    });

    it(`${archivo} no contiene comentarios`, () => {
      const lineas = leer(archivo).split('\n');
      const conComentario = lineas.filter((l) => /^\s*\/\//.test(l) || /\/\*/.test(l));
      assert.deepEqual(conComentario, []);
    });
  }

  it('document.write solo se usa en la ventana de impresión con contenido escapado', () => {
    const usos = archivosJs.flatMap((a) => leer(a).split('\n').filter((l) => /document\.write/.test(l)).map(() => a));
    assert.deepEqual(usos, ['js/script.js']);
    const codigo = leer('js/script.js');
    const bloque = codigo.slice(codigo.indexOf('function abrirVentanaImpresion'), codigo.indexOf('function printEntry'));
    assert.match(bloque, /escHTML\(titulo\)/);
    assert.match(bloque, /escHTML\(hoja\)/);
    const generadores = codigo.slice(codigo.indexOf('function printEntry'), codigo.indexOf('function copyEntry'));
    const concatenaciones = generadores.match(/entry\.\w+/g) || [];
    const escapadas = generadores.match(/escHTML\(entry\.\w+\)/g) || [];
    assert.equal(concatenaciones.length, escapadas.length);
  });

  it('el historial de impresión escapa cada campo', () => {
    const codigo = leer('js/script.js');
    const bloque = codigo.slice(codigo.indexOf("getElementById('printHistoryBtn')"));
    const crudos = (bloque.match(/\be\.(doctor|patient|time|text)\b/g) || []).length;
    const escapados = (bloque.match(/escHTML\(e\.(doctor|patient|time|text)\)/g) || []).length;
    assert.equal(crudos, escapados);
  });
});

describe('Política de seguridad de contenido en index.html', () => {
  const html = leer('index.html');
  const csp = (html.match(/http-equiv="Content-Security-Policy"\s+content="([^"]+)"/) || [])[1] || '';
  const directivas = Object.fromEntries(csp.split(';').map((d) => d.trim()).filter(Boolean).map((d) => {
    const [nombre, ...valores] = d.split(/\s+/);
    return [nombre, valores];
  }));

  it('declara una política restrictiva', () => {
    assert.deepEqual(directivas['default-src'], ["'none'"]);
    assert.deepEqual(directivas['script-src'], ["'self'"]);
    assert.deepEqual(directivas['style-src'], ["'self'"]);
    assert.deepEqual(directivas['connect-src'], ["'none'"]);
    assert.deepEqual(directivas['object-src'], ["'none'"]);
    assert.deepEqual(directivas['base-uri'], ["'none'"]);
    assert.deepEqual(directivas['form-action'], ["'none'"]);
  });

  it('no relaja la política con unsafe-inline, unsafe-eval ni comodines', () => {
    assert.doesNotMatch(csp, /unsafe-|\*|https?:/);
  });

  it('la política es la primera etiqueta de la cabecera después del juego de caracteres', () => {
    const cabecera = html.slice(html.indexOf('<head>'), html.indexOf('<link'));
    assert.ok(cabecera.indexOf('Content-Security-Policy') > -1);
    assert.ok(cabecera.indexOf('<script') === -1);
  });

  it('no carga recursos externos ni usa estilos o scripts en línea', () => {
    assert.doesNotMatch(html, /(?:src|href)=["']https?:/i);
    assert.doesNotMatch(html, /\sstyle=/i);
    assert.doesNotMatch(html, /<style/i);
    assert.equal((html.match(/<script(?![^>]*\ssrc=)[^>]*>/g) || []).length, 0);
    assert.doesNotMatch(html, /\son[a-z]+=/i);
  });

  it('las hojas de estilo locales no importan recursos externos', () => {
    for (const hoja of ['css/styles.css', 'css/fuentes.css', 'css/impresion.css']) {
      assert.doesNotMatch(leer(hoja), /@import|url\(\s*["']?https?:/i);
    }
  });
});

describe('Dependencias y cadena de suministro', () => {
  it('docx está incluido localmente y coincide con el hash fijado', () => {
    const contenido = fs.readFileSync(path.join(raiz, 'js/vendor/docx-8.5.0.umd.js'));
    assert.equal(crypto.createHash('sha384').update(contenido).digest('hex'), HASH_DOCX_SHA384);
  });

  it('no hay dependencias de ejecución declaradas', () => {
    const paquete = JSON.parse(leer('package.json'));
    assert.equal(paquete.dependencies, undefined);
  });

  it('no se agregan servicios de seguimiento ni analítica', () => {
    const todo = ['index.html', ...archivosJs].map(leer).join('\n');
    assert.doesNotMatch(todo, /google-analytics|googletagmanager|gtag\(|hotjar|mixpanel|segment\.com|facebook\.net|doubleclick/i);
  });

  it('el flujo de trabajo usa permisos mínimos y acciones fijadas por commit', () => {
    const flujo = leer('.github/workflows/pruebas.yml');
    assert.match(flujo, /permissions:\s*\n\s+contents:\s*read/);
    const usos = flujo.match(/uses:\s*\S+/g) || [];
    assert.ok(usos.length > 0);
    for (const uso of usos) assert.match(uso, /@[0-9a-f]{40}/, uso);
  });
});

describe('Higiene del repositorio', () => {
  const archivos = archivosRastreados();
  const textuales = archivos.filter((a) => !/\.(woff2|png|jpg|ico)$/.test(a) && !a.startsWith('js/vendor/'));

  it('no hay archivos de credenciales, audio ni exportaciones clínicas', () => {
    const sospechosos = archivos.filter((a) => /(^|\/)\.env|\.pem$|\.key$|id_rsa|credentials|\.(wav|mp3|m4a|ogg|webm|flac)$|historial.*\.json$|MediVoz_historial/i.test(a));
    assert.deepEqual(sospechosos, []);
  });

  it('ningún archivo rastreado contiene credenciales o claves privadas', () => {
    const patrones = [
      /gh[pousr]_[A-Za-z0-9]{30,}/,
      /AKIA[0-9A-Z]{16}/,
      /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
      /AIza[0-9A-Za-z_-]{35}/,
      /xox[baprs]-[0-9A-Za-z-]{10,}/,
      /(?:api[_-]?key|secret|token|password)\s*[:=]\s*['"][^'"\s]{12,}['"]/i
    ];
    const hallazgos = [];
    for (const archivo of textuales) {
      const contenido = fs.readFileSync(path.join(raiz, archivo), 'utf8');
      patrones.forEach((p) => { if (p.test(contenido)) hallazgos.push(archivo + ' ' + p); });
    }
    assert.deepEqual(hallazgos, []);
  });

  it('el código no contiene contraseñas ni claves de cifrado fijas', () => {
    const codigo = archivosJs.map(leer).join('\n');
    assert.doesNotMatch(codigo, /importKey\(\s*['"]raw['"]\s*,\s*(?:new TextEncoder\(\)\.encode\()?['"]/);
    assert.doesNotMatch(codigo, /localStorage\.setItem\([^)]*contrasena/i);
  });

  it('las carpetas de resultados y modelos no se versionan', () => {
    const ignorados = leer('.gitignore');
    assert.match(ignorados, /node_modules/);
    assert.match(ignorados, /test-results/);
  });
});
