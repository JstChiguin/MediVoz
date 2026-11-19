import * as ort from '../vendor/ort/ort.wasm.min.mjs';
import { MotorConformer } from './motor-conformer.js';
import { leerManifiesto, obtenerArchivo } from './gestor-modelo.js';

ort.env.wasm.wasmPaths = new URL('../vendor/ort/', import.meta.url).href;
ort.env.wasm.numThreads = 1;
ort.env.wasm.proxy = false;

let motor = null;
let cola = Promise.resolve();

function informar(mensaje) {
  self.postMessage(mensaje);
}

async function preparar(base) {
  if (motor) {
    informar({ tipo: 'listo' });
    return;
  }
  const manifiesto = await leerManifiesto(base);
  const total = manifiesto.archivos.reduce((suma, a) => suma + a.tamano, 0);
  let acumulado = 0;
  const alBytes = (n) => {
    acumulado += n;
    informar({ tipo: 'progreso', fraccion: Math.min(acumulado / total, 1) * 0.9 });
  };
  const bytes = {};
  for (const archivo of manifiesto.archivos) {
    bytes[archivo.nombre] = await obtenerArchivo(base, archivo, alBytes);
  }
  informar({ tipo: 'progreso', fraccion: 0.92 });
  const tokens = new TextDecoder().decode(bytes['tokens.txt']);
  motor = await MotorConformer.cargar(ort, {
    codificador: bytes['encoder.int8.onnx'],
    decodificador: bytes['decoder.int8.onnx'],
    unidor: bytes['joiner.int8.onnx'],
    tokens
  });
  Object.keys(bytes).forEach((k) => { delete bytes[k]; });
  informar({ tipo: 'listo' });
}

async function transcribir(identificador, muestras) {
  const inicio = performance.now();
  const texto = await motor.transcribir(muestras);
  informar({ tipo: 'texto', identificador, texto, milisegundos: Math.round(performance.now() - inicio) });
}

async function liberar() {
  if (motor) await motor.liberar();
  motor = null;
  informar({ tipo: 'liberado' });
}

self.onmessage = (evento) => {
  const mensaje = evento.data;
  cola = cola.then(async () => {
    try {
      if (mensaje.tipo === 'preparar') await preparar(mensaje.base);
      else if (mensaje.tipo === 'transcribir') {
        if (!motor) throw new Error('motor-no-preparado');
        await transcribir(mensaje.identificador, mensaje.muestras);
      } else if (mensaje.tipo === 'liberar') await liberar();
    } catch (error) {
      informar({ tipo: 'error', identificador: mensaje.identificador, codigo: String((error && error.message) || 'error-desconocido').slice(0, 60) });
    }
  });
};
