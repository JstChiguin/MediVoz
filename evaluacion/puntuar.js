const fs = require('fs');
const path = require('path');
const {
  normalizar,
  distanciaEdicion,
  precisionTerminos,
  erroresNumerosYUnidades
} = require('./metricas');

const carpetaResultados = path.join(__dirname, 'resultados');
const corpus = JSON.parse(fs.readFileSync(path.join(__dirname, 'corpus.json'), 'utf8'));
const porId = Object.fromEntries(corpus.map((m) => [m.id, m]));

function sumar(acumulado, valor) {
  Object.keys(valor).forEach((k) => { acumulado[k] = (acumulado[k] || 0) + valor[k]; });
}

function puntuarArchivo(datos) {
  const global = {};
  const categorias = {};
  const detalle = {};
  for (const [id, resultado] of Object.entries(datos.resultados)) {
    const muestra = porId[id];
    if (!muestra) continue;
    const r = normalizar(muestra.texto).split(' ').filter(Boolean);
    const h = normalizar(resultado.texto || '').split(' ').filter(Boolean);
    const rc = [...r.join('')];
    const hc = [...h.join('')];
    const terminos = precisionTerminos(muestra.terminos, resultado.texto || '');
    const magnitudes = erroresNumerosYUnidades(muestra.texto, resultado.texto || '');
    const valores = {
      palabras: r.length,
      erroresPalabras: distanciaEdicion(r, h),
      caracteres: rc.length,
      erroresCaracteres: distanciaEdicion(rc, hc),
      terminos: terminos.total,
      terminosCorrectos: terminos.correctos,
      numeros: magnitudes.numerosEsperados,
      numerosIncorrectos: magnitudes.numerosIncorrectos,
      unidades: magnitudes.unidadesEsperadas,
      unidadesIncorrectas: magnitudes.unidadesIncorrectas,
      audioSegundos: resultado.duracion_s,
      decodificacionSegundos: resultado.tiempo_s
    };
    sumar(global, valores);
    categorias[muestra.categoria] = categorias[muestra.categoria] || {};
    sumar(categorias[muestra.categoria], valores);
    detalle[id] = { wer: valores.erroresPalabras / valores.palabras, hipotesis: resultado.texto, fallidos: terminos.fallidos };
  }
  return { global, categorias, detalle };
}

function resumen(v) {
  return {
    wer: v.erroresPalabras / v.palabras,
    cer: v.erroresCaracteres / v.caracteres,
    terminosPrecision: v.terminosCorrectos / v.terminos,
    numerosErrores: v.numerosIncorrectos,
    numerosTotal: v.numeros,
    unidadesErrores: v.unidadesIncorrectas,
    unidadesTotal: v.unidades,
    rtf: v.decodificacionSegundos / v.audioSegundos,
    audioSegundos: Math.round(v.audioSegundos),
    decodificacionSegundos: Math.round(v.decodificacionSegundos * 10) / 10
  };
}

function ejecutar() {
  const archivos = fs.readdirSync(carpetaResultados).filter((a) => /^hipotesis-.*\.json$/.test(a)).sort();
  const filas = [];
  for (const archivo of archivos) {
    const datos = JSON.parse(fs.readFileSync(path.join(carpetaResultados, archivo), 'utf8'));
    const puntuacion = puntuarArchivo(datos);
    const total = resumen(puntuacion.global);
    const porCategoria = Object.fromEntries(Object.entries(puntuacion.categorias).map(([c, v]) => [c, Math.round((v.erroresPalabras / v.palabras) * 1000) / 10]));
    filas.push({
      motor: datos.motor,
      entorno: datos.entorno,
      carga_s: datos.carga_s,
      memoria_pico_mb: datos.memoria_pico_mb,
      memoria_base_mb: datos.memoria_base_mb,
      ...total,
      werPorCategoria: porCategoria,
      detalle: puntuacion.detalle
    });
  }
  filas.sort((a, b) => a.wer - b.wer);
  fs.writeFileSync(path.join(carpetaResultados, 'resumen.json'), JSON.stringify(filas, null, 1));
  const pct = (x) => (x * 100).toFixed(1) + '%';
  const lineas = [
    '| Motor | Entorno | WER | CER | Términos | Números mal | Unidades mal | RTF | Carga | Memoria pico |',
    '|---|---|---|---|---|---|---|---|---|---|'
  ];
  filas.forEach((f) => lineas.push(`| ${f.motor} | ${f.entorno} | ${pct(f.wer)} | ${pct(f.cer)} | ${pct(f.terminosPrecision)} | ${f.numerosErrores}/${f.numerosTotal} | ${f.unidadesErrores}/${f.unidadesTotal} | ${f.rtf.toFixed(2)} | ${f.carga_s}s | ${f.memoria_pico_mb} MB |`));
  const categorias = [...new Set(corpus.map((m) => m.categoria))];
  lineas.push('', '| Motor | ' + categorias.join(' | ') + ' |', '|---|' + categorias.map(() => '---').join('|') + '|');
  filas.forEach((f) => lineas.push(`| ${f.motor} (${f.entorno.split(' ')[0]}) | ` + categorias.map((c) => (f.werPorCategoria[c] ?? '-') + '%').join(' | ') + ' |'));
  fs.writeFileSync(path.join(carpetaResultados, 'resumen.md'), lineas.join('\n') + '\n');
  console.log(lineas.join('\n'));
}

if (require.main === module) ejecutar();

module.exports = { puntuarArchivo, resumen };
