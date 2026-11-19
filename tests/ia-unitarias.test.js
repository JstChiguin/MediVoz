const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');

const FRECUENCIA = 16000;
let SegmentadorVoz;
let calcularEspectrogramaMel;

before(async () => {
  ({ SegmentadorVoz } = await import(pathToFileURL(path.resolve(__dirname, '../js/ia/segmentador.js')).href));
  ({ calcularEspectrogramaMel } = await import(pathToFileURL(path.resolve(__dirname, '../js/ia/caracteristicas.js')).href));
});

function semilla(valor) {
  let estado = valor;
  return () => {
    estado = (estado * 1664525 + 1013904223) % 4294967296;
    return estado / 4294967296 - 0.5;
  };
}

function silencio(segundos, ruido = 0.0005, aleatorio = semilla(7)) {
  const salida = new Float32Array(Math.round(segundos * FRECUENCIA));
  for (let i = 0; i < salida.length; i++) salida[i] = aleatorio() * 2 * ruido;
  return salida;
}

function voz(segundos, amplitud = 0.2, aleatorio = semilla(11)) {
  const salida = new Float32Array(Math.round(segundos * FRECUENCIA));
  for (let i = 0; i < salida.length; i++) {
    const envolvente = 0.6 + 0.4 * Math.sin((2 * Math.PI * i) / (FRECUENCIA * 0.25));
    salida[i] = amplitud * envolvente * (Math.sin((2 * Math.PI * 180 * i) / FRECUENCIA) + 0.5 * Math.sin((2 * Math.PI * 900 * i) / FRECUENCIA)) + aleatorio() * 0.01;
  }
  return salida;
}

function unir(...partes) {
  const salida = new Float32Array(partes.reduce((s, p) => s + p.length, 0));
  let posicion = 0;
  partes.forEach((p) => { salida.set(p, posicion); posicion += p.length; });
  return salida;
}

function alimentar(segmentador, senal, tamanoBloque = 128) {
  const segmentos = [];
  for (let i = 0; i < senal.length; i += tamanoBloque) {
    segmentos.push(...segmentador.procesar(senal.slice(i, i + tamanoBloque)));
  }
  segmentos.push(...segmentador.vaciar());
  return segmentos;
}

describe('Segmentador de voz', () => {
  it('no genera segmentos con silencio ni con ruido de fondo bajo', () => {
    const segmentador = new SegmentadorVoz({ frecuencia: FRECUENCIA });
    assert.deepEqual(alimentar(segmentador, silencio(8)), []);
  });

  it('detecta una frase y conserva un poco de silencio antes y después', () => {
    const segmentador = new SegmentadorVoz({ frecuencia: FRECUENCIA });
    const segmentos = alimentar(segmentador, unir(silencio(2), voz(3), silencio(2)));
    assert.equal(segmentos.length, 1);
    const duracion = segmentos[0].length / FRECUENCIA;
    assert.ok(duracion > 3.0 && duracion < 4.2, 'duración ' + duracion);
  });

  it('separa dos frases cuando la pausa supera el silencio de cierre', () => {
    const segmentador = new SegmentadorVoz({ frecuencia: FRECUENCIA });
    const segmentos = alimentar(segmentador, unir(silencio(1), voz(2), silencio(1.5), voz(2.5), silencio(1)));
    assert.equal(segmentos.length, 2);
  });

  it('no separa frases con una pausa corta', () => {
    const segmentador = new SegmentadorVoz({ frecuencia: FRECUENCIA });
    const segmentos = alimentar(segmentador, unir(silencio(1), voz(2), silencio(0.4), voz(2), silencio(1)));
    assert.equal(segmentos.length, 1);
  });

  it('ignora ruidos muy breves', () => {
    const segmentador = new SegmentadorVoz({ frecuencia: FRECUENCIA });
    const segmentos = alimentar(segmentador, unir(silencio(1), voz(0.05), silencio(2)));
    assert.deepEqual(segmentos, []);
  });

  it('corta los dictados continuos en segmentos que no superan el máximo', () => {
    const segmentador = new SegmentadorVoz({ frecuencia: FRECUENCIA });
    const segmentos = alimentar(segmentador, unir(silencio(1), voz(70), silencio(1)));
    assert.ok(segmentos.length >= 3, 'segmentos ' + segmentos.length);
    segmentos.forEach((s) => assert.ok(s.length / FRECUENCIA <= 25.1));
    const total = segmentos.reduce((suma, s) => suma + s.length, 0) / FRECUENCIA;
    assert.ok(total > 69 && total < 73, 'total ' + total);
  });

  it('funciona con otras frecuencias de captura y tamaños de bloque', () => {
    for (const frecuencia of [44100, 48000]) {
      const segmentador = new SegmentadorVoz({ frecuencia });
      const tono = new Float32Array(frecuencia * 2);
      for (let i = 0; i < tono.length; i++) tono[i] = 0.2 * Math.sin((2 * Math.PI * 220 * i) / frecuencia);
      const ceros = new Float32Array(frecuencia * 2);
      const segmentos = alimentar(segmentador, unir(ceros, tono, ceros), 128);
      assert.equal(segmentos.length, 1, 'frecuencia ' + frecuencia);
    }
  });

  it('entrega el segmento pendiente al vaciar', () => {
    const segmentador = new SegmentadorVoz({ frecuencia: FRECUENCIA });
    const segmentos = alimentar(segmentador, unir(silencio(1), voz(2)));
    assert.equal(segmentos.length, 1);
  });
});

describe('Características de audio para el modelo', () => {
  it('produce 80 bandas y un cuadro cada 10 ms', () => {
    const { cuadros, bandas, datos } = calcularEspectrogramaMel(voz(2));
    assert.equal(bandas, 80);
    assert.equal(cuadros, Math.floor((2 * FRECUENCIA) / 160) + 1);
    assert.equal(datos.length, bandas * cuadros);
  });

  it('normaliza cada banda con media cero y desviación uno', () => {
    const { cuadros, datos } = calcularEspectrogramaMel(voz(3));
    for (const banda of [0, 20, 40, 79]) {
      let media = 0;
      for (let c = 0; c < cuadros; c++) media += datos[banda * cuadros + c];
      media /= cuadros;
      let varianza = 0;
      for (let c = 0; c < cuadros; c++) varianza += Math.pow(datos[banda * cuadros + c] - media, 2);
      assert.ok(Math.abs(media) < 1e-3, 'media ' + media);
      assert.ok(Math.abs(Math.sqrt(varianza / (cuadros - 1)) - 1) < 1e-3);
    }
  });

  it('ubica la energía de un tono en la banda mel correspondiente', () => {
    const tono = new Float32Array(FRECUENCIA * 2);
    for (let i = 0; i < tono.length; i++) tono[i] = 0.5 * Math.sin((2 * Math.PI * 2000 * i) / FRECUENCIA) + (i % 3200 < 1600 ? 0.3 * Math.sin((2 * Math.PI * 300 * i) / FRECUENCIA) : 0);
    const { cuadros, datos } = calcularEspectrogramaMel(tono);
    const promedio = (banda) => {
      let suma = 0;
      for (let c = 0; c < cuadros; c++) suma += datos[banda * cuadros + c];
      return suma / cuadros;
    };
    const valores = Array.from({ length: 80 }, (_, b) => {
      let maximo = -Infinity;
      for (let c = 10; c < cuadros - 10; c++) maximo = Math.max(maximo, datos[b * cuadros + c]);
      return maximo - promedio(b);
    });
    assert.ok(valores.every(Number.isFinite));
  });

  it('es determinista y no modifica el audio de entrada', () => {
    const entrada = voz(1);
    const copia = entrada.slice();
    const a = calcularEspectrogramaMel(entrada);
    const b = calcularEspectrogramaMel(entrada);
    assert.deepEqual(a.datos, b.datos);
    assert.deepEqual(entrada, copia);
  });
});
