const FRECUENCIA = 16000;
const TAMANO_FFT = 512;
const LARGO_VENTANA = 400;
const SALTO = 160;
const BANDAS_MEL = 80;
const PREENFASIS = 0.97;
const PISO_LOGARITMICO = Math.pow(2, -24);
const CONSTANTE_NORMALIZACION = 1e-5;

function hercioAMel(hercios) {
  const escalon = 200 / 3;
  const piso = 1000;
  const melPiso = piso / escalon;
  const paso = Math.log(6.4) / 27;
  return hercios >= piso ? melPiso + Math.log(hercios / piso) / paso : hercios / escalon;
}

function melAHercio(mel) {
  const escalon = 200 / 3;
  const piso = 1000;
  const melPiso = piso / escalon;
  const paso = Math.log(6.4) / 27;
  return mel >= melPiso ? piso * Math.exp(paso * (mel - melPiso)) : mel * escalon;
}

function construirBancoMel() {
  const bins = TAMANO_FFT / 2 + 1;
  const melMaximo = hercioAMel(FRECUENCIA / 2);
  const puntos = Array.from({ length: BANDAS_MEL + 2 }, (_, i) => melAHercio((melMaximo * i) / (BANDAS_MEL + 1)));
  const frecuencias = Array.from({ length: bins }, (_, i) => (FRECUENCIA / 2) * (i / (bins - 1)));
  const banco = [];
  for (let m = 0; m < BANDAS_MEL; m++) {
    const fila = new Float32Array(bins);
    const normalizacion = 2 / (puntos[m + 2] - puntos[m]);
    for (let k = 0; k < bins; k++) {
      const subida = (frecuencias[k] - puntos[m]) / (puntos[m + 1] - puntos[m]);
      const bajada = (puntos[m + 2] - frecuencias[k]) / (puntos[m + 2] - puntos[m + 1]);
      fila[k] = Math.max(0, Math.min(subida, bajada)) * normalizacion;
    }
    banco.push(fila);
  }
  return banco;
}

function construirVentana() {
  const ventana = new Float32Array(TAMANO_FFT);
  const desplazamiento = (TAMANO_FFT - LARGO_VENTANA) / 2;
  for (let i = 0; i < LARGO_VENTANA; i++) {
    ventana[desplazamiento + i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / LARGO_VENTANA);
  }
  return ventana;
}

function construirTablaFft() {
  const coseno = new Float32Array(TAMANO_FFT / 2);
  const seno = new Float32Array(TAMANO_FFT / 2);
  for (let i = 0; i < TAMANO_FFT / 2; i++) {
    coseno[i] = Math.cos((2 * Math.PI * i) / TAMANO_FFT);
    seno[i] = -Math.sin((2 * Math.PI * i) / TAMANO_FFT);
  }
  const inversion = new Uint16Array(TAMANO_FFT);
  const bits = Math.log2(TAMANO_FFT);
  for (let i = 0; i < TAMANO_FFT; i++) {
    let r = 0;
    for (let b = 0; b < bits; b++) if (i & (1 << b)) r |= 1 << (bits - 1 - b);
    inversion[i] = r;
  }
  return { coseno, seno, inversion };
}

const BANCO_MEL = construirBancoMel();
const VENTANA = construirVentana();
const TABLA = construirTablaFft();

function transformadaRapida(real, imaginaria) {
  const { coseno, seno, inversion } = TABLA;
  for (let i = 0; i < TAMANO_FFT; i++) {
    const j = inversion[i];
    if (j > i) {
      const r = real[i];
      real[i] = real[j];
      real[j] = r;
      const m = imaginaria[i];
      imaginaria[i] = imaginaria[j];
      imaginaria[j] = m;
    }
  }
  for (let largo = 2; largo <= TAMANO_FFT; largo <<= 1) {
    const mitad = largo >> 1;
    const paso = TAMANO_FFT / largo;
    for (let inicio = 0; inicio < TAMANO_FFT; inicio += largo) {
      for (let k = 0; k < mitad; k++) {
        const c = coseno[k * paso];
        const s = seno[k * paso];
        const a = inicio + k;
        const b = a + mitad;
        const tr = real[b] * c - imaginaria[b] * s;
        const ti = real[b] * s + imaginaria[b] * c;
        real[b] = real[a] - tr;
        imaginaria[b] = imaginaria[a] - ti;
        real[a] += tr;
        imaginaria[a] += ti;
      }
    }
  }
}

export function calcularEspectrogramaMel(muestras) {
  const total = muestras.length;
  const enfatizadas = new Float32Array(total);
  if (total) enfatizadas[0] = muestras[0];
  for (let i = 1; i < total; i++) enfatizadas[i] = muestras[i] - PREENFASIS * muestras[i - 1];
  const cuadros = Math.floor(total / SALTO) + 1;
  const bins = TAMANO_FFT / 2 + 1;
  const mel = new Float32Array(BANDAS_MEL * cuadros);
  const real = new Float32Array(TAMANO_FFT);
  const imaginaria = new Float32Array(TAMANO_FFT);
  const potencia = new Float32Array(bins);
  const reflejo = TAMANO_FFT / 2;
  for (let c = 0; c < cuadros; c++) {
    const inicio = c * SALTO - reflejo;
    for (let i = 0; i < TAMANO_FFT; i++) {
      const posicion = inicio + i;
      real[i] = posicion >= 0 && posicion < total ? enfatizadas[posicion] * VENTANA[i] : 0;
      imaginaria[i] = 0;
    }
    transformadaRapida(real, imaginaria);
    for (let k = 0; k < bins; k++) potencia[k] = real[k] * real[k] + imaginaria[k] * imaginaria[k];
    for (let m = 0; m < BANDAS_MEL; m++) {
      const fila = BANCO_MEL[m];
      let suma = 0;
      for (let k = 0; k < bins; k++) suma += fila[k] * potencia[k];
      mel[m * cuadros + c] = Math.log(suma + PISO_LOGARITMICO);
    }
  }
  for (let m = 0; m < BANDAS_MEL; m++) {
    const base = m * cuadros;
    let media = 0;
    for (let c = 0; c < cuadros; c++) media += mel[base + c];
    media /= cuadros;
    let varianza = 0;
    for (let c = 0; c < cuadros; c++) varianza += (mel[base + c] - media) * (mel[base + c] - media);
    const desviacion = Math.sqrt(varianza / Math.max(cuadros - 1, 1)) + CONSTANTE_NORMALIZACION;
    for (let c = 0; c < cuadros; c++) mel[base + c] = (mel[base + c] - media) / desviacion;
  }
  return { datos: mel, cuadros, bandas: BANDAS_MEL };
}

export const PARAMETROS_AUDIO = { FRECUENCIA, TAMANO_FFT, LARGO_VENTANA, SALTO, BANDAS_MEL };
