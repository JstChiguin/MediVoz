import * as ort from '/js/vendor/ort/ort.wasm.min.mjs';
import { MotorConformer } from '/js/ia/motor-conformer.js';
import { MotorMoonshine } from '/js/ia/motor-moonshine.js';

ort.env.wasm.wasmPaths = '/js/vendor/ort/';
ort.env.wasm.numThreads = 1;
ort.env.wasm.proxy = false;

const CARPETAS = {
  conformer: 'sherpa-onnx-nemo-fast-conformer-transducer-es-1424-int8',
  moonshine: 'sherpa-onnx-moonshine-base-es-quantized-2026-02-27'
};

async function bytes(url) {
  return new Uint8Array(await (await fetch(url)).arrayBuffer());
}

async function texto(url) {
  return (await fetch(url)).text();
}

function leerWav(buffer) {
  const datos = new Int16Array(buffer, 44);
  const muestras = new Float32Array(datos.length);
  for (let i = 0; i < datos.length; i++) muestras[i] = datos[i] / 32768;
  return muestras;
}

let motor = null;

window.banco = {
  async cargar(nombre) {
    const carpeta = '/modelos/' + CARPETAS[nombre] + '/';
    const inicio = performance.now();
    if (nombre === 'conformer') {
      motor = await MotorConformer.cargar(ort, {
        codificador: await bytes(carpeta + 'encoder.int8.onnx'),
        decodificador: await bytes(carpeta + 'decoder.int8.onnx'),
        unidor: await bytes(carpeta + 'joiner.int8.onnx'),
        tokens: await texto(carpeta + 'tokens.txt')
      });
    } else {
      motor = await MotorMoonshine.cargar(ort, {
        codificador: await bytes(carpeta + 'encoder_model.ort'),
        decodificador: await bytes(carpeta + 'decoder_model_merged.ort'),
        tokens: await texto(carpeta + 'tokens.txt')
      });
    }
    return Math.round(performance.now() - inicio) / 1000;
  },
  async transcribir(id) {
    const muestras = leerWav(await (await fetch('/audios/' + id + '.wav')).arrayBuffer());
    const inicio = performance.now();
    const resultado = await motor.transcribir(muestras);
    return {
      texto: resultado,
      tiempo_s: Math.round(performance.now() - inicio) / 1000,
      duracion_s: Math.round((muestras.length / 16000) * 100) / 100
    };
  },
  listo: true
};
