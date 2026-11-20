const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { normalizar, tasaErrorPalabras, precisionTerminos } = require('./metricas');

const corpus = JSON.parse(fs.readFileSync(path.join(__dirname, 'corpus.json'), 'utf8'));
const porId = Object.fromEntries(corpus.map((m) => [m.id, m]));
const carpeta = path.join(__dirname, 'resultados');

async function principal() {
  const { DiccionarioMedico, quitarAcentos } = await import(pathToFileURL(path.resolve(__dirname, '../js/ia/diccionario-medico.js')).href);
  const { LEXICO_BASE } = await import(pathToFileURL(path.resolve(__dirname, '../js/ia/lexico-base.js')).href);
  const diccionario = new DiccionarioMedico(LEXICO_BASE);
  const palabrasReferencia = (id) => new Set(porId[id].texto.split(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+/).filter(Boolean).map(quitarAcentos));

  const control = corpus.map((m) => diccionario.sugerir(m.texto)).flat();
  const salida = { control: { sugerenciasEnTextoCorrecto: control.length, ejemplos: control.slice(0, 5) }, motores: [] };

  const archivos = fs.readdirSync(carpeta).filter((a) => /^hipotesis-(conformer|moonshine|conformer-transductor-es|moonshine-base-es|parakeet-v3|whisper-small).*\.json$/.test(a) && !/cpu4x/.test(a));
  for (const archivo of archivos) {
    const datos = JSON.parse(fs.readFileSync(path.join(carpeta, archivo), 'utf8'));
    let palabras = 0;
    let erroresAntes = 0;
    let erroresDespues = 0;
    let sugerencias = 0;
    let acertadas = 0;
    let falsas = 0;
    let terminosAntes = 0;
    let terminosDespues = 0;
    let terminosTotal = 0;
    const falsasEjemplos = [];
    for (const [id, resultado] of Object.entries(datos.resultados)) {
      const muestra = porId[id];
      if (!muestra) continue;
      const lista = diccionario.sugerir(resultado.texto);
      const corregido = diccionario.aplicar(resultado.texto, lista);
      const referencia = palabrasReferencia(id);
      const n = normalizar(muestra.texto).split(' ').length;
      palabras += n;
      erroresAntes += tasaErrorPalabras(muestra.texto, resultado.texto) * n;
      erroresDespues += tasaErrorPalabras(muestra.texto, corregido) * n;
      const antes = precisionTerminos(muestra.terminos, resultado.texto);
      const despues = precisionTerminos(muestra.terminos, corregido);
      terminosTotal += antes.total;
      terminosAntes += antes.correctos;
      terminosDespues += despues.correctos;
      lista.forEach((s) => {
        sugerencias++;
        const sugeridas = quitarAcentos(s.sugerencia).split(' ');
        const originales = quitarAcentos(s.original).split(/[^a-zñ]+/).filter(Boolean);
        const originalCorrecto = originales.every((p) => referencia.has(p));
        if (originalCorrecto) {
          falsas++;
          falsasEjemplos.push(`${s.original} -> ${s.sugerencia} (${id})`);
        } else if (sugeridas.every((p) => referencia.has(p))) {
          acertadas++;
        } else {
          falsas++;
          falsasEjemplos.push(`${s.original} -> ${s.sugerencia} (${id})`);
        }
      });
    }
    salida.motores.push({
      archivo,
      werAntes: Math.round((erroresAntes / palabras) * 1000) / 10,
      werDespues: Math.round((erroresDespues / palabras) * 1000) / 10,
      terminosAntes: `${terminosAntes}/${terminosTotal}`,
      terminosDespues: `${terminosDespues}/${terminosTotal}`,
      sugerencias,
      acertadas,
      incorrectas: falsas,
      incorrectasEjemplos: falsasEjemplos.slice(0, 8)
    });
  }
  fs.writeFileSync(path.join(carpeta, 'diccionario.json'), JSON.stringify(salida, null, 1));
  console.log(JSON.stringify(salida, null, 1));
}

principal();
