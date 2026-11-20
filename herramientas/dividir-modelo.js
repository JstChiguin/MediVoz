// Divide los archivos del modelo en fragmentos de como máximo 20 MiB (límite de
// Cloudflare Pages: 25 MiB por archivo) y regenera el manifiesto con las huellas
// SHA-256 del archivo completo y de cada fragmento.
//
// Uso: node herramientas/dividir-modelo.js [carpeta-del-modelo]
// Es idempotente: reconstruye cada archivo desde sus fragmentos actuales, comprueba
// su huella contra el manifiesto y solo entonces vuelve a dividirlo.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const TAMANO_MAXIMO_PARTE = 20 * 1024 * 1024;

function sha256(datos) {
  return crypto.createHash('sha256').update(datos).digest('hex');
}

function dividir(datos, tamanoMaximo = TAMANO_MAXIMO_PARTE) {
  const partes = [];
  for (let inicio = 0; inicio < datos.length; inicio += tamanoMaximo) {
    partes.push(datos.subarray(inicio, Math.min(inicio + tamanoMaximo, datos.length)));
  }
  return partes;
}

function reconstruir(carpeta, archivo) {
  const datos = Buffer.concat(archivo.partes.map((parte) => fs.readFileSync(path.join(carpeta, parte))));
  if (datos.length !== archivo.tamano || sha256(datos) !== archivo.sha256) {
    throw new Error('El archivo ' + archivo.nombre + ' no coincide con el manifiesto actual; se aborta sin modificar nada.');
  }
  return datos;
}

function procesar(carpeta, tamanoMaximo = TAMANO_MAXIMO_PARTE) {
  const rutaManifiesto = path.join(carpeta, 'manifiesto.json');
  const manifiesto = JSON.parse(fs.readFileSync(rutaManifiesto, 'utf8'));
  // Primero se lee y verifica todo en memoria; solo después se escribe en disco.
  const completos = manifiesto.archivos.map((archivo) => ({ archivo, datos: reconstruir(carpeta, archivo) }));
  const nuevo = { ...manifiesto, tamano_maximo_parte: tamanoMaximo, archivos: [] };
  const antiguas = new Set(manifiesto.archivos.flatMap((a) => a.partes));
  const escritas = new Set();
  for (const { archivo, datos } of completos) {
    let nombres;
    let trozos;
    if (datos.length > tamanoMaximo) {
      trozos = dividir(datos, tamanoMaximo);
      nombres = trozos.map((_, i) => archivo.nombre + '.parte' + i);
    } else {
      trozos = [datos];
      nombres = [archivo.nombre];
    }
    trozos.forEach((trozo, i) => {
      fs.writeFileSync(path.join(carpeta, nombres[i]), trozo);
      escritas.add(nombres[i]);
    });
    nuevo.archivos.push({
      nombre: archivo.nombre,
      tamano: datos.length,
      sha256: sha256(datos),
      partes: nombres,
      huellas_partes: trozos.map(sha256)
    });
  }
  fs.writeFileSync(rutaManifiesto, JSON.stringify(nuevo, null, 1) + '\n');
  for (const vieja of antiguas) {
    if (!escritas.has(vieja)) fs.rmSync(path.join(carpeta, vieja), { force: true });
  }
  return nuevo;
}

module.exports = { TAMANO_MAXIMO_PARTE, sha256, dividir, procesar };

if (require.main === module) {
  const carpeta = path.resolve(process.argv[2] || path.join(__dirname, '..', 'modelos', 'conformer-es'));
  const resultado = procesar(carpeta);
  for (const a of resultado.archivos) console.log(a.nombre, a.tamano, a.partes.length + ' parte(s)', a.sha256);
}
