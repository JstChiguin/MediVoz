const http = require('http');
const fs = require('fs');
const path = require('path');

const raiz = path.resolve(__dirname, '..');
const modelos = process.env.MEDIVOZ_MODELOS || path.join(__dirname, 'modelos');
const tipos = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.wav': 'audio/wav'
};
const rutas = [
  ['/modelos/', modelos],
  ['/audios/', path.join(__dirname, 'audios')],
  ['/js/', path.join(raiz, 'js')],
  ['/banco/', path.join(__dirname, 'banco')]
];

function iniciarServidorBanco(puerto = 0) {
  const servidor = http.createServer((peticion, respuesta) => {
    const ruta = decodeURIComponent(new URL(peticion.url, 'http://localhost').pathname);
    const destino = rutas.find(([prefijo]) => ruta.startsWith(prefijo));
    if (!destino) {
      respuesta.writeHead(404);
      respuesta.end();
      return;
    }
    const archivo = path.join(destino[1], ruta.slice(destino[0].length));
    if (!archivo.startsWith(path.resolve(destino[1])) || !fs.existsSync(archivo) || fs.statSync(archivo).isDirectory()) {
      respuesta.writeHead(404);
      respuesta.end();
      return;
    }
    respuesta.writeHead(200, {
      'Content-Type': tipos[path.extname(archivo)] || 'application/octet-stream',
      'Content-Length': fs.statSync(archivo).size
    });
    fs.createReadStream(archivo).pipe(respuesta);
  });
  return new Promise((resolver) => {
    servidor.listen(puerto, '127.0.0.1', () => resolver({ servidor, url: `http://127.0.0.1:${servidor.address().port}/` }));
  });
}

module.exports = { iniciarServidorBanco };
