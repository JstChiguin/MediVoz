const PALABRAS_PROTEGIDAS = new Set([
  'no', 'sin', 'ni', 'nunca', 'jamas', 'tampoco', 'niega', 'descarta', 'ausencia', 'negativo', 'negativa',
  'mas', 'menos', 'mayor', 'menor', 'cada', 'por', 'sobre', 'bajo', 'antes', 'despues',
  'si', 'solo', 'hasta', 'desde', 'entre', 'durante'
]);

const LARGO_MINIMO_PALABRA = 8;
const LARGO_MINIMO_TERMINO = 8;

export function quitarAcentos(texto) {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function distancia(a, b, limite) {
  if (Math.abs(a.length - b.length) > limite) return limite + 1;
  let anterior = Array.from({ length: b.length + 1 }, (_, j) => j);
  let anteriorPrevia = null;
  for (let i = 1; i <= a.length; i++) {
    const actual = [i];
    for (let j = 1; j <= b.length; j++) {
      const costo = a[i - 1] === b[j - 1] ? 0 : 1;
      let valor = Math.min(anterior[j] + 1, actual[j - 1] + 1, anterior[j - 1] + costo);
      if (anteriorPrevia && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        valor = Math.min(valor, anteriorPrevia[j - 2] + 1);
      }
      actual[j] = valor;
    }
    anteriorPrevia = anterior;
    anterior = actual;
  }
  return anterior[b.length];
}

function limitePorLargo(largo) {
  return largo >= 10 ? 2 : 1;
}

function raizSinFlexion(clave) {
  return clave.replace(/(os|as|es|s)$/, '').replace(/[aeo]$/, '');
}

export class DiccionarioMedico {
  constructor(terminos) {
    this.actualizar(terminos);
  }

  actualizar(terminos) {
    const unicos = new Map();
    terminos.forEach((termino) => {
      const limpio = String(termino).replace(/\s+/g, ' ').trim();
      if (limpio) unicos.set(quitarAcentos(limpio), limpio);
    });
    this.porClave = unicos;
    this.raices = new Set([...unicos.keys()].map(raizSinFlexion));
    this.palabras = [...unicos.entries()].filter(([clave]) => !clave.includes(' '));
  }

  contiene(palabra) {
    return this.porClave.has(quitarAcentos(palabra));
  }

  esConocida(palabra) {
    const clave = quitarAcentos(palabra);
    return this.porClave.has(clave) || this.raices.has(raizSinFlexion(clave));
  }

  mejorCandidato(clave) {
    let mejor = null;
    for (const [candidata, original] of this.palabras) {
      if (candidata.length < LARGO_MINIMO_TERMINO || candidata[0] !== clave[0]) continue;
      const limite = limitePorLargo(Math.max(clave.length, candidata.length));
      const d = distancia(clave, candidata, limite);
      if (raizSinFlexion(clave) === raizSinFlexion(candidata)) continue;
      if (d <= limite && d > 0 && (!mejor || d < mejor.distancia)) mejor = { sugerencia: original, distancia: d };
    }
    return mejor;
  }

  sugerir(texto) {
    const sugerencias = [];
    const patron = /[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+/g;
    const palabras = [];
    let coincidencia;
    while ((coincidencia = patron.exec(texto)) !== null) {
      palabras.push({ texto: coincidencia[0], inicio: coincidencia.index, fin: coincidencia.index + coincidencia[0].length });
    }
    const ocupadas = new Set();
    for (let i = 0; i < palabras.length - 1; i++) {
      const a = palabras[i];
      const b = palabras[i + 1];
      if (texto.slice(a.fin, b.inicio).trim() !== '') continue;
      if (/\d/.test(texto.slice(a.fin, b.inicio))) continue;
      const unida = quitarAcentos(a.texto + b.texto);
      if (a.texto.length < 3 || b.texto.length < 3) continue;
      if (unida.length < LARGO_MINIMO_TERMINO + 2 || this.esConocida(a.texto) || this.esConocida(b.texto)) continue;
      const candidato = this.mejorCandidato(unida);
      if (candidato && !PALABRAS_PROTEGIDAS.has(quitarAcentos(a.texto)) && !PALABRAS_PROTEGIDAS.has(quitarAcentos(b.texto))) {
        sugerencias.push({ inicio: a.inicio, fin: b.fin, original: texto.slice(a.inicio, b.fin), sugerencia: candidato.sugerencia, distancia: candidato.distancia });
        ocupadas.add(i);
        ocupadas.add(i + 1);
        i++;
      }
    }
    palabras.forEach((palabra, indice) => {
      if (ocupadas.has(indice)) return;
      const clave = quitarAcentos(palabra.texto);
      if (clave.length < LARGO_MINIMO_PALABRA || PALABRAS_PROTEGIDAS.has(clave) || this.contiene(palabra.texto)) return;
      const candidato = this.mejorCandidato(clave);
      if (candidato) {
        sugerencias.push({ inicio: palabra.inicio, fin: palabra.fin, original: palabra.texto, sugerencia: candidato.sugerencia, distancia: candidato.distancia });
      }
    });
    return sugerencias.sort((x, y) => x.inicio - y.inicio);
  }

  aplicar(texto, sugerencias) {
    let resultado = texto;
    [...sugerencias].sort((x, y) => y.inicio - x.inicio).forEach((s) => {
      const original = s.original;
      const aplicada = original[0] === original[0].toUpperCase() && original[0] !== original[0].toLowerCase()
        ? s.sugerencia[0].toUpperCase() + s.sugerencia.slice(1)
        : s.sugerencia;
      resultado = resultado.slice(0, s.inicio) + aplicada + resultado.slice(s.fin);
    });
    return resultado;
  }
}
