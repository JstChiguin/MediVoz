import { calcularEspectrogramaMel } from './caracteristicas.js';

const IDENTIFICADOR_BLANCO = 1024;
const MAXIMO_SIMBOLOS_POR_CUADRO = 8;
const DIMENSION_PREDICTOR = 640;
const DIMENSION_CODIFICADOR = 512;

function leerPiezas(textoTokens) {
  const piezas = [];
  textoTokens.split('\n').forEach((linea) => {
    const separador = linea.lastIndexOf(' ');
    if (separador < 0) return;
    piezas[Number(linea.slice(separador + 1))] = linea.slice(0, separador);
  });
  return piezas;
}

function indiceMaximo(valores, inicio, largo) {
  let mejor = inicio;
  let valorMejor = valores[inicio];
  for (let i = 1; i < largo; i++) {
    if (valores[inicio + i] > valorMejor) {
      valorMejor = valores[inicio + i];
      mejor = inicio + i;
    }
  }
  return mejor - inicio;
}

export class MotorConformer {
  constructor(ort, sesiones, piezas) {
    this.ort = ort;
    this.codificador = sesiones.codificador;
    this.decodificador = sesiones.decodificador;
    this.unidor = sesiones.unidor;
    this.piezas = piezas;
  }

  static async cargar(ort, { codificador, decodificador, unidor, tokens }, opciones = {}) {
    const crear = (bytes) => ort.InferenceSession.create(bytes, {
      executionProviders: ['wasm'],
      graphOptimizationLevel: 'all',
      enableCpuMemArena: false,
      enableMemPattern: false
    });
    const sesiones = {};
    sesiones.codificador = await crear(codificador);
    if (opciones.alProgresar) opciones.alProgresar(0.8);
    sesiones.decodificador = await crear(decodificador);
    sesiones.unidor = await crear(unidor);
    return new MotorConformer(ort, sesiones, leerPiezas(tokens));
  }

  async codificar(muestras) {
    const { datos, cuadros, bandas } = calcularEspectrogramaMel(muestras);
    const entrada = new this.ort.Tensor('float32', datos, [1, bandas, cuadros]);
    const longitud = new this.ort.Tensor('int64', BigInt64Array.from([BigInt(cuadros)]), [1]);
    const salida = await this.codificador.run({ audio_signal: entrada, length: longitud });
    return { codificado: salida.outputs, largo: Number(salida.encoded_lengths.data[0]) };
  }

  async ejecutarDecodificador(token, estados) {
    const salida = await this.decodificador.run({
      targets: new this.ort.Tensor('int32', Int32Array.from([token]), [1, 1]),
      target_length: new this.ort.Tensor('int32', Int32Array.from([1]), [1]),
      'states.1': estados.uno,
      'onnx::LSTM_3': estados.dos
    });
    return { salida: salida.outputs, estados: { uno: salida.states, dos: salida['74'] } };
  }

  async transcribir(muestras) {
    if (muestras.length < 1600) return '';
    const { codificado, largo } = await this.codificar(muestras);
    const total = codificado.dims[2];
    const datosCodificador = codificado.data;
    const vacio = () => new this.ort.Tensor('float32', new Float32Array(DIMENSION_PREDICTOR), [1, 1, DIMENSION_PREDICTOR]);
    let estados = { uno: vacio(), dos: vacio() };
    let predictor = await this.ejecutarDecodificador(IDENTIFICADOR_BLANCO, estados);
    estados = predictor.estados;
    let salidaPredictor = predictor.salida;
    const emitidos = [];
    const cuadro = new Float32Array(DIMENSION_CODIFICADOR);
    for (let t = 0; t < Math.min(largo, total); t++) {
      for (let k = 0; k < DIMENSION_CODIFICADOR; k++) cuadro[k] = datosCodificador[k * total + t];
      const tensorCuadro = new this.ort.Tensor('float32', cuadro.slice(), [1, DIMENSION_CODIFICADOR, 1]);
      for (let simbolo = 0; simbolo < MAXIMO_SIMBOLOS_POR_CUADRO; simbolo++) {
        const logits = (await this.unidor.run({ encoder_outputs: tensorCuadro, decoder_outputs: salidaPredictor })).outputs.data;
        const token = indiceMaximo(logits, 0, logits.length);
        if (token === IDENTIFICADOR_BLANCO) break;
        emitidos.push(token);
        predictor = await this.ejecutarDecodificador(token, estados);
        estados = predictor.estados;
        salidaPredictor = predictor.salida;
      }
    }
    return emitidos.map((t) => this.piezas[t] || '').join('').replace(/▁/g, ' ').trim();
  }

  async liberar() {
    await Promise.all([this.codificador.release(), this.decodificador.release(), this.unidor.release()]);
  }
}
