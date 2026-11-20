const IDENTIFICADOR_INICIO = 1;
const IDENTIFICADOR_FIN = 2;
const CAPAS = 8;
const CABEZAS = 8;
const DIMENSION_CABEZA = 52;
const TOKENS_POR_SEGUNDO_MAXIMO = 7;
const FRECUENCIA = 16000;

function decodificarBase64(texto) {
  const binario = atob(texto);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return bytes;
}

function leerPiezas(textoTokens) {
  const piezas = [];
  textoTokens.split('\n').forEach((linea) => {
    const separador = linea.lastIndexOf(' ');
    if (separador < 0) return;
    piezas[Number(linea.slice(separador + 1))] = decodificarBase64(linea.slice(0, separador));
  });
  return piezas;
}

function indiceMaximo(valores, inicio, largo) {
  let mejor = 0;
  let valorMejor = valores[inicio];
  for (let i = 1; i < largo; i++) {
    if (valores[inicio + i] > valorMejor) {
      valorMejor = valores[inicio + i];
      mejor = i;
    }
  }
  return mejor;
}

export class MotorMoonshine {
  constructor(ort, codificador, decodificador, piezas) {
    this.ort = ort;
    this.codificador = codificador;
    this.decodificador = decodificador;
    this.piezas = piezas;
  }

  static async cargar(ort, { codificador, decodificador, tokens }, opciones = {}) {
    const crear = (bytes) => ort.InferenceSession.create(bytes, {
      executionProviders: ['wasm'],
      graphOptimizationLevel: 'all',
      enableCpuMemArena: false,
      enableMemPattern: false
    });
    const sesionCodificador = await crear(codificador);
    if (opciones.alProgresar) opciones.alProgresar(0.6);
    const sesionDecodificador = await crear(decodificador);
    return new MotorMoonshine(ort, sesionCodificador, sesionDecodificador, leerPiezas(tokens));
  }

  tensorVacio() {
    return new this.ort.Tensor('float32', new Float32Array(0), [1, CABEZAS, 0, DIMENSION_CABEZA]);
  }

  async transcribir(muestras) {
    if (muestras.length < 1600) return '';
    const { ort } = this;
    const codificado = (await this.codificador.run({
      input_values: new ort.Tensor('float32', muestras, [1, muestras.length])
    })).last_hidden_state;
    const maximo = Math.max(8, Math.ceil((muestras.length / FRECUENCIA) * TOKENS_POR_SEGUNDO_MAXIMO));
    let pasado = {};
    for (let capa = 0; capa < CAPAS; capa++) {
      ['decoder', 'encoder'].forEach((origen) => {
        ['key', 'value'].forEach((tipo) => { pasado[`past_key_values.${capa}.${origen}.${tipo}`] = this.tensorVacio(); });
      });
    }
    const generados = [];
    let ultimo = IDENTIFICADOR_INICIO;
    let usarCache = false;
    for (let paso = 0; paso < maximo; paso++) {
      const entradas = {
        input_ids: new ort.Tensor('int64', BigInt64Array.from([BigInt(ultimo)]), [1, 1]),
        encoder_hidden_states: codificado,
        use_cache_branch: new ort.Tensor('bool', [usarCache], [1]),
        ...pasado
      };
      const salida = await this.decodificador.run(entradas);
      const logits = salida.logits;
      const vocabulario = logits.dims[2];
      const siguiente = indiceMaximo(logits.data, (logits.dims[1] - 1) * vocabulario, vocabulario);
      const nuevo = {};
      for (const nombre of Object.keys(pasado)) {
        const presente = salida[nombre.replace('past_key_values', 'present')];
        const esCodificador = nombre.includes('.encoder.');
        nuevo[nombre] = esCodificador && usarCache ? pasado[nombre] : presente;
      }
      pasado = nuevo;
      if (siguiente === IDENTIFICADOR_FIN) break;
      generados.push(siguiente);
      ultimo = siguiente;
      usarCache = true;
    }
    const bytes = [];
    generados.forEach((id) => { if (id > 2 && this.piezas[id]) bytes.push(...this.piezas[id]); });
    return new TextDecoder('utf-8', { fatal: false }).decode(Uint8Array.from(bytes)).replace(/▁/g, ' ').trim();
  }

  async liberar() {
    await Promise.all([this.codificador.release(), this.decodificador.release()]);
  }
}
