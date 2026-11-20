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

function iniciarServidor(puerto = 0) {
  const servidor = http.createServer((peticion, respuesta) => {
    const ruta = decodeURIComponent(new URL(peticion.url, 'http://localhost').pathname);
    const archivo = path.join(raiz, ruta === '/' ? 'index.html' : ruta);
    if (!archivo.startsWith(raiz) || !fs.existsSync(archivo) || fs.statSync(archivo).isDirectory()) {
      respuesta.writeHead(404);
      respuesta.end('No encontrado');
      return;
    }
    respuesta.writeHead(200, { 'Content-Type': tipos[path.extname(archivo)] || 'application/octet-stream' });
    fs.createReadStream(archivo).pipe(respuesta);
  });
  return new Promise((resolver) => {
    servidor.listen(puerto, '127.0.0.1', () => {
      resolver({ servidor, url: `http://127.0.0.1:${servidor.address().port}/` });
    });
  });
}

module.exports = { iniciarServidor };
