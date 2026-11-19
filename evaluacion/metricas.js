const UNIDADES = [
  ['miligramos por decilitro', 'mg/dl'],
  ['miligramo por decilitro', 'mg/dl'],
  ['gramos por decilitro', 'g/dl'],
  ['milímetros de mercurio', 'mmhg'],
  ['milimetros de mercurio', 'mmhg'],
  ['células por microlitro', 'cel/ul'],
  ['por microlitro', '/ul'],
  ['miligramos', 'mg'],
  ['miligramo', 'mg'],
  ['microgramos', 'mcg'],
  ['microgramo', 'mcg'],
  ['gramos', 'g'],
  ['gramo', 'g'],
  ['kilos', 'kg'],
  ['kilogramos', 'kg'],
  ['mililitros', 'ml'],
  ['litros', 'l'],
  ['metros', 'm'],
  ['por ciento', '%'],
  ['grados', 'grados'],
  ['unidades', 'ui']
];

const UNIDADES_SIMBOLO = ['mg/dl', 'g/dl', 'mmhg', 'mg', 'mcg', 'kg', 'ml', '%', 'g', 'l', 'm', 'ui', 'grados'];

const BASICOS = {
  cero: 0, un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9,
  diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19,
  veinte: 20, veintiuno: 21, veintiun: 21, veintiuna: 21, veintidos: 22, veintitres: 23, veinticuatro: 24, veinticinco: 25,
  veintiseis: 26, veintisiete: 27, veintiocho: 28, veintinueve: 29
};
const DECENAS = { treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90 };
const CENTENAS = {
  cien: 100, ciento: 100, doscientos: 200, doscientas: 200, trescientos: 300, trescientas: 300, cuatrocientos: 400, cuatrocientas: 400,
  quinientos: 500, quinientas: 500, seiscientos: 600, seiscientas: 600, setecientos: 700, setecientas: 700,
  ochocientos: 800, ochocientas: 800, novecientos: 900, novecientas: 900
};

function sinAcentos(texto) {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function esPalabraNumero(palabra) {
  return palabra in BASICOS || palabra in DECENAS || palabra in CENTENAS || palabra === 'mil' || palabra === 'y';
}

function valorNumero(palabras) {
  let total = 0;
  let actual = 0;
  for (const palabra of palabras) {
    if (palabra === 'y') continue;
    if (palabra in BASICOS) actual += BASICOS[palabra];
    else if (palabra in DECENAS) actual += DECENAS[palabra];
    else if (palabra in CENTENAS) actual += CENTENAS[palabra];
    else if (palabra === 'mil') {
      total += (actual || 1) * 1000;
      actual = 0;
    }
  }
  return total + actual;
}

function rangoNumero(palabra) {
  if (palabra in CENTENAS) return 3;
  if (palabra in DECENAS) return 2;
  if (palabra in BASICOS) return BASICOS[palabra] >= 10 ? 1.5 : 1;
  return 0;
}

function finDeNumero(palabras, inicio) {
  let ultimoRango = 4;
  let previa = null;
  let j = inicio;
  while (j < palabras.length) {
    const palabra = palabras[j];
    if (palabra === 'mil') {
      if (previa === 'mil') break;
      ultimoRango = 4;
      previa = 'mil';
      j++;
      continue;
    }
    if (palabra === 'y') {
      const siguiente = palabras[j + 1];
      if (previa in DECENAS && siguiente in BASICOS && BASICOS[siguiente] < 10 && BASICOS[siguiente] > 0) {
        previa = 'y';
        j++;
        continue;
      }
      break;
    }
    const rango = rangoNumero(palabra);
    if (!rango || rango >= ultimoRango) break;
    if (rango === 1 && previa in DECENAS) break;
    ultimoRango = rango === 2 ? 1.2 : rango === 3 ? 2.5 : 0;
    if (rango === 2) ultimoRango = 1.2;
    previa = palabra;
    j++;
  }
  return j;
}

function convertirNumerosEscritos(palabras) {
  const resultado = [];
  let i = 0;
  while (i < palabras.length) {
    const palabra = palabras[i];
    if (palabra === 'medio' || palabra === 'media') {
      resultado.push('0.5');
      i++;
      continue;
    }
    const fin = finDeNumero(palabras, i);
    if (fin > i) {
      let texto = String(valorNumero(palabras.slice(i, fin)));
      let siguiente = fin;
      if (palabras[siguiente] === 'coma') {
        const finDecimal = finDeNumero(palabras, siguiente + 1);
        if (finDecimal > siguiente + 1) {
          texto += '.' + String(valorNumero(palabras.slice(siguiente + 1, finDecimal)));
          siguiente = finDecimal;
        }
      }
      resultado.push(texto);
      i = siguiente;
      continue;
    }
    resultado.push(palabra);
    i++;
  }
  return resultado;
}

function normalizar(texto) {
  let t = sinAcentos(String(texto).toLowerCase());
  t = t.replace(/(\d)\.(\d{3})(?!\d)/g, '$1$2');
  t = t.replace(/(\d),(\d)/g, '$1.$2');
  t = t.replace(/(\d)\s*%/g, '$1 %');
  t = t.replace(/[^a-z0-9ñ.%/\s]/g, ' ');
  t = t.replace(/(?<!\d)\.|\.(?!\d)/g, ' ');
  t = t.replace(/\s+/g, ' ').trim();
  for (const [palabras, simbolo] of UNIDADES) {
    t = t.split(sinAcentos(palabras)).join(simbolo);
  }
  return convertirNumerosEscritos(t.split(' ').filter(Boolean)).join(' ');
}

function distanciaEdicion(a, b) {
  const filas = a.length + 1;
  const columnas = b.length + 1;
  let anterior = Array.from({ length: columnas }, (_, j) => j);
  for (let i = 1; i < filas; i++) {
    const actual = [i];
    for (let j = 1; j < columnas; j++) {
      const costo = a[i - 1] === b[j - 1] ? 0 : 1;
      actual[j] = Math.min(anterior[j] + 1, actual[j - 1] + 1, anterior[j - 1] + costo);
    }
    anterior = actual;
  }
  return anterior[columnas - 1];
}

function tasaErrorPalabras(referencia, hipotesis) {
  const r = normalizar(referencia).split(' ').filter(Boolean);
  const h = normalizar(hipotesis).split(' ').filter(Boolean);
  if (!r.length) return h.length ? 1 : 0;
  return distanciaEdicion(r, h) / r.length;
}

function tasaErrorCaracteres(referencia, hipotesis) {
  const r = [...normalizar(referencia).replace(/ /g, '')];
  const h = [...normalizar(hipotesis).replace(/ /g, '')];
  if (!r.length) return h.length ? 1 : 0;
  return distanciaEdicion(r, h) / r.length;
}

function precisionTerminos(terminos, hipotesis) {
  const palabras = new Set(normalizar(hipotesis).split(' '));
  const encontrados = terminos.filter((t) => palabras.has(normalizar(t)));
  return { total: terminos.length, correctos: encontrados.length, fallidos: terminos.filter((t) => !encontrados.includes(t)) };
}

function extraerMagnitudes(texto) {
  const fichas = normalizar(texto).split(' ');
  const numeros = fichas.filter((f) => /^\d+(\.\d+)?$/.test(f));
  const unidades = fichas.filter((f) => UNIDADES_SIMBOLO.includes(f));
  return { numeros, unidades };
}

function erroresNumerosYUnidades(referencia, hipotesis) {
  const r = extraerMagnitudes(referencia);
  const h = extraerMagnitudes(hipotesis);
  const quitar = (lista, elementos) => {
    const copia = [...lista];
    let faltantes = 0;
    elementos.forEach((e) => {
      const indice = copia.indexOf(e);
      if (indice === -1) faltantes++;
      else copia.splice(indice, 1);
    });
    return { faltantes, sobrantes: copia.length };
  };
  const numeros = quitar(h.numeros, r.numeros);
  const unidades = quitar(h.unidades, r.unidades);
  return {
    numerosEsperados: r.numeros.length,
    numerosIncorrectos: numeros.faltantes,
    unidadesEsperadas: r.unidades.length,
    unidadesIncorrectas: unidades.faltantes
  };
}

module.exports = {
  normalizar,
  tasaErrorPalabras,
  tasaErrorCaracteres,
  precisionTerminos,
  erroresNumerosYUnidades,
  distanciaEdicion
};
