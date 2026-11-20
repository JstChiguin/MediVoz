const http = require('http');
const fs = require('fs');
const path = require('path');

const raiz = path.resolve(__dirname, '..');
const tipos = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8'
};

// Lee el archivo _headers (formato de Cloudflare Pages): una línea sin sangría con la
// ruta (admite *) seguida de líneas con sangría "Nombre: valor".
function leerCabeceras(texto) {
  const reglas = [];
  let actual = null;
  for (const linea of texto.split(/\r?\n/)) {
    if (!linea.trim() || linea.trim().startsWith('#')) continue;
    if (/^\S/.test(linea)) {
      actual = { patron: linea.trim(), cabeceras: [] };
      reglas.push(actual);
    } else if (actual) {
      const indice = linea.indexOf(':');
      actual.cabeceras.push([linea.slice(0, indice).trim(), linea.slice(indice + 1).trim()]);
    }
  }
  return reglas;
}

function cabecerasPara(reglas, ruta) {
  const resultado = {};
  for (const regla of reglas) {
    const trozos = regla.patron.split('*').map((t) => t.replace(/[.+?^${}()|[\]\\]/g, '\\$&'));
    if (new RegExp('^' + trozos.join('.*') + '$').test(ruta)) {
      regla.cabeceras.forEach(([nombre, valor]) => { resultado[nombre] = valor; });
    }
  }
  return resultado;
}

// Todas las pruebas con navegador sirven el sitio con las cabeceras reales de _headers.
const rutaCabeceras = path.join(raiz, '_headers');
const reglasCabeceras = fs.existsSync(rutaCabeceras) ? leerCabeceras(fs.readFileSync(rutaCabeceras, 'utf8')) : [];

function iniciarServidor(puerto = 0) {
  const servidor = http.createServer((peticion, respuesta) => {
    const ruta = decodeURIComponent(new URL(peticion.url, 'http://localhost').pathname);
    const archivo = path.join(raiz, ruta === '/' ? 'index.html' : ruta);
    if (!archivo.startsWith(raiz) || !fs.existsSync(archivo) || fs.statSync(archivo).isDirectory()) {
      respuesta.writeHead(404);
      respuesta.end('No encontrado');
      return;
    }
    respuesta.writeHead(200, { ...cabecerasPara(reglasCabeceras, ruta), 'Content-Type': tipos[path.extname(archivo)] || 'application/octet-stream' });
    fs.createReadStream(archivo).pipe(respuesta);
  });
  return new Promise((resolver) => {
    servidor.listen(puerto, '127.0.0.1', () => {
      resolver({ servidor, url: `http://127.0.0.1:${servidor.address().port}/` });
    });
  });
}

module.exports = { iniciarServidor, leerCabeceras, cabecerasPara };
