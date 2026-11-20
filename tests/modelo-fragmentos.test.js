const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const { iniciarServidor } = require('./servidor-estatico');
const { dividir, procesar, sha256, TAMANO_MAXIMO_PARTE } = require('../herramientas/dividir-modelo');

const raiz = path.resolve(__dirname, '..');
const carpetaModelo = path.join(raiz, 'modelos', 'conformer-es');
const manifiesto = JSON.parse(fs.readFileSync(path.join(carpetaModelo, 'manifiesto.json'), 'utf8'));
const MIB = 1024 * 1024;

// Huellas del modelo original (anteriores a la división en fragmentos de 20 MiB).
// Si alguna cambia, el modelo ya no es el mismo y la IA podría comportarse distinto.
const HUELLAS_ORIGINALES = {
  'encoder.int8.onnx': { tamano: 131113475, sha256: '17bde3c5005f7a9d0614336ea13db7d2c3c1c4efcacfa380e962b36d768b907e' },
  'decoder.int8.onnx': { tamano: 3955863, sha256: 'e759e0c04faa31526c34a96927bd8c69574e9b5e83360559b4f924be98f89f0e' },
  'joiner.int8.onnx': { tamano: 1408182, sha256: '78f941bcda8d7e3d43b89a8fd805a8e77e99d06bde4c6ceedc9ec423ee4d04bd' },
  'tokens.txt': { tamano: 10871, sha256: '6191b4853e3654f053c42f6fd184ca53b402987aefdd6ff6baa68034d803ee85' }
};

const archivo = (nombre) => manifiesto.archivos.find((a) => a.nombre === nombre);

describe('Modelo dividido: integridad de los fragmentos', () => {
  it('el modelo reconstruido es idéntico byte a byte al original (misma huella y tamaño por archivo)', () => {
    assert.deepEqual(manifiesto.archivos.map((a) => a.nombre).sort(), Object.keys(HUELLAS_ORIGINALES).sort());
    for (const [nombre, esperado] of Object.entries(HUELLAS_ORIGINALES)) {
      const a = archivo(nombre);
      const unido = Buffer.concat(a.partes.map((p) => fs.readFileSync(path.join(carpetaModelo, p))));
      assert.equal(a.tamano, esperado.tamano, nombre);
      assert.equal(a.sha256, esperado.sha256, nombre);
      assert.equal(unido.length, esperado.tamano, nombre);
      assert.equal(sha256(unido), esperado.sha256, nombre);
    }
  });

  it('cada fragmento coincide con su huella SHA-256 y ninguno supera 20 MiB', () => {
    for (const a of manifiesto.archivos) {
      assert.equal(a.huellas_partes.length, a.partes.length, a.nombre);
      a.partes.forEach((parte, i) => {
        const bytes = fs.readFileSync(path.join(carpetaModelo, parte));
        assert.ok(bytes.length <= 20 * MIB && bytes.length > 0, parte);
        assert.equal(sha256(bytes), a.huellas_partes[i], parte);
      });
    }
  });

  it('el encoder (131 MB) se reparte en 7 fragmentos: seis de 20 MiB exactos y un resto, en orden consecutivo', () => {
    const encoder = archivo('encoder.int8.onnx');
    assert.deepEqual(encoder.partes, [0, 1, 2, 3, 4, 5, 6].map((i) => `encoder.int8.onnx.parte${i}`));
    const tamanos = encoder.partes.map((p) => fs.statSync(path.join(carpetaModelo, p)).size);
    assert.deepEqual(tamanos.slice(0, 6), Array(6).fill(20 * MIB));
    assert.equal(tamanos.reduce((a, b) => a + b, 0), encoder.tamano);
  });

  it('no quedan fragmentos antiguos ni archivos sin declarar en la carpeta del modelo', () => {
    const declarados = new Set(['manifiesto.json', 'ATRIBUCION.md', ...manifiesto.archivos.flatMap((a) => a.partes)]);
    assert.deepEqual(fs.readdirSync(carpetaModelo).filter((n) => !declarados.has(n)), []);
  });

  it('la licencia y la atribución del modelo se conservan', () => {
    assert.equal(manifiesto.licencia, 'CC-BY-4.0');
    assert.match(fs.readFileSync(path.join(carpetaModelo, 'ATRIBUCION.md'), 'utf8'), /CC-BY-4\.0/);
  });
});

describe('Herramienta de división del modelo', () => {
  let carpeta;
  before(() => { carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'medivoz-modelo-')); });
  after(() => { fs.rmSync(carpeta, { recursive: true, force: true }); });

  it('divide en fragmentos del tamaño máximo y la unión reproduce los datos exactos (incluidos límites)', () => {
    for (const largo of [0, 1, 99, 100, 101, 299, 300, 301]) {
      const datos = crypto.randomBytes(largo);
      const partes = dividir(datos, 100);
      assert.equal(partes.length, Math.ceil(largo / 100), 'largo ' + largo);
      partes.forEach((p) => assert.ok(p.length <= 100));
      assert.ok(Buffer.concat(partes).equals(datos));
    }
    assert.equal(TAMANO_MAXIMO_PARTE, 20 * MIB);
  });

  it('procesa una carpeta, regenera el manifiesto y es idempotente', () => {
    const grande = crypto.randomBytes(2500);
    const pequeno = crypto.randomBytes(40);
    fs.writeFileSync(path.join(carpeta, 'grande.bin.parte0'), grande.subarray(0, 1500));
    fs.writeFileSync(path.join(carpeta, 'grande.bin.parte1'), grande.subarray(1500));
    fs.writeFileSync(path.join(carpeta, 'pequeno.txt'), pequeno);
    fs.writeFileSync(path.join(carpeta, 'manifiesto.json'), JSON.stringify({
      modelo: 'prueba', licencia: 'CC-BY-4.0',
      archivos: [
        { nombre: 'grande.bin', tamano: 2500, sha256: sha256(grande), partes: ['grande.bin.parte0', 'grande.bin.parte1'] },
        { nombre: 'pequeno.txt', tamano: 40, sha256: sha256(pequeno), partes: ['pequeno.txt'] }
      ]
    }));
    const primero = procesar(carpeta, 1000);
    const g = primero.archivos[0];
    assert.deepEqual(g.partes, ['grande.bin.parte0', 'grande.bin.parte1', 'grande.bin.parte2']);
    assert.equal(g.sha256, sha256(grande));
    assert.ok(Buffer.concat(g.partes.map((p) => fs.readFileSync(path.join(carpeta, p)))).equals(grande));
    g.partes.forEach((p, i) => assert.equal(sha256(fs.readFileSync(path.join(carpeta, p))), g.huellas_partes[i]));
    assert.deepEqual(primero.archivos[1].partes, ['pequeno.txt']);
    assert.deepEqual(procesar(carpeta, 1000), primero);
  });

  it('se niega a modificar nada si un fragmento no coincide con el manifiesto', () => {
    const rutaParte = path.join(carpeta, 'grande.bin.parte1');
    const original = fs.readFileSync(rutaParte);
    const antes = fs.readFileSync(path.join(carpeta, 'manifiesto.json'), 'utf8');
    fs.writeFileSync(rutaParte, Buffer.concat([original.subarray(0, original.length - 1), Buffer.from([original[original.length - 1] ^ 1])]));
    assert.throws(() => procesar(carpeta, 500), /no coincide con el manifiesto/);
    assert.equal(fs.readFileSync(path.join(carpeta, 'manifiesto.json'), 'utf8'), antes);
    assert.ok(!fs.existsSync(path.join(carpeta, 'grande.bin.parte4')));
  });
});

describe('Descarga del modelo por fragmentos (gestor-modelo.js)', () => {
  let servidor;
  let gestor;
  let base;
  before(async () => {
    servidor = await iniciarServidor();
    base = servidor.url + 'modelos/conformer-es/';
    gestor = await import(pathToFileURL(path.join(raiz, 'js/ia/gestor-modelo.js')).href);
  });
  after(() => { servidor.servidor.close(); });

  const clon = (a) => JSON.parse(JSON.stringify(a));

  it('descarga el encoder en 7 fragmentos, informa el progreso y entrega el archivo original completo', async () => {
    let recibido = 0;
    const bytes = await gestor.obtenerArchivo(base, archivo('encoder.int8.onnx'), (n) => { recibido += n; });
    assert.equal(bytes.length, HUELLAS_ORIGINALES['encoder.int8.onnx'].tamano);
    assert.equal(recibido, bytes.length);
    assert.equal(sha256(Buffer.from(bytes)), HUELLAS_ORIGINALES['encoder.int8.onnx'].sha256);
  });

  it('rechaza un fragmento alterado antes de unirlo', async () => {
    const a = clon(archivo('encoder.int8.onnx'));
    a.huellas_partes[3] = '0'.repeat(64);
    await assert.rejects(gestor.obtenerArchivo(base, a, () => {}), /integridad-invalida/);
  });

  it('rechaza fragmentos en orden distinto o repetidos', async () => {
    const a = clon(archivo('encoder.int8.onnx'));
    [a.partes[1], a.partes[2]] = [a.partes[2], a.partes[1]];
    await assert.rejects(gestor.obtenerArchivo(base, a, () => {}), /integridad-invalida/);
    const b = clon(archivo('encoder.int8.onnx'));
    b.partes[2] = b.partes[1];
    await assert.rejects(gestor.obtenerArchivo(base, b, () => {}), /integridad-invalida/);
  });

  it('detecta un fragmento faltante o de más por el tamaño total', async () => {
    const falta = clon(archivo('encoder.int8.onnx'));
    falta.partes.pop();
    falta.huellas_partes.pop();
    await assert.rejects(gestor.obtenerArchivo(base, falta, () => {}), /tamano-invalido/);
    const sobra = clon(archivo('encoder.int8.onnx'));
    sobra.partes.push('tokens.txt');
    sobra.huellas_partes.push(archivo('tokens.txt').sha256);
    await assert.rejects(gestor.obtenerArchivo(base, sobra, () => {}), /tamano-invalido/);
  });

  it('falla con aviso claro si un fragmento no existe en el servidor', async () => {
    const a = clon(archivo('joiner.int8.onnx'));
    a.partes = ['no-existe.parte0'];
    await assert.rejects(gestor.obtenerArchivo(base, a, () => {}), /descarga-fallida/);
  });

  it('un manifiesto sin huellas por fragmento sigue funcionando y verifica la huella completa', async () => {
    const a = clon(archivo('decoder.int8.onnx'));
    delete a.huellas_partes;
    assert.equal((await gestor.obtenerArchivo(base, a, () => {})).length, a.tamano);
    a.sha256 = 'f'.repeat(64);
    await assert.rejects(gestor.obtenerArchivo(base, a, () => {}), /integridad-invalida/);
  });
});
