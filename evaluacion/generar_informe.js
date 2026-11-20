const fs = require('fs');
const path = require('path');

const carpeta = path.join(__dirname, 'resultados');
const resumen = JSON.parse(fs.readFileSync(path.join(carpeta, 'resumen.json'), 'utf8'));
const diccionario = JSON.parse(fs.readFileSync(path.join(carpeta, 'diccionario.json'), 'utf8'));
const corpus = JSON.parse(fs.readFileSync(path.join(__dirname, 'corpus.json'), 'utf8'));

const LICENCIAS = {
  'conformer-transductor-es': 'CC-BY-4.0',
  'conformer-ctc-es': 'CC-BY-4.0',
  conformer: 'CC-BY-4.0',
  'canary-180m': 'CC-BY-4.0',
  'moonshine-base-es': 'Moonshine Community License (no comercial; gratis bajo US$1 M de ingresos)',
  moonshine: 'Moonshine Community License (no comercial; gratis bajo US$1 M de ingresos)',
  'parakeet-v3': 'CC-BY-4.0',
  'whisper-tiny': 'MIT',
  'whisper-base': 'MIT',
  'whisper-small': 'MIT',
  'vosk-small-es': 'Apache-2.0'
};
const TAMANOS = {
  'conformer-transductor-es': '136 MB',
  'conformer-ctc-es': '132 MB',
  conformer: '136 MB',
  'canary-180m': '123 MB',
  'moonshine-base-es': '64 MB',
  moonshine: '64 MB',
  'parakeet-v3': '487 MB',
  'whisper-tiny': '116 MB',
  'whisper-base': '208 MB',
  'whisper-small': '639 MB',
  'vosk-small-es': '39 MB'
};

const pct = (x) => (x * 100).toFixed(1) + '%';
const fila = (f) => `| ${f.motor} | ${f.entorno} | ${TAMANOS[f.motor] || '-'} | ${pct(f.wer)} | ${pct(f.cer)} | ${pct(f.terminosPrecision)} | ${f.numerosErrores}/${f.numerosTotal} | ${f.unidadesErrores}/${f.unidadesTotal} | ${f.rtf.toFixed(2)} | ${f.carga_s} s | ${f.memoria_pico_mb} MB${f.entorno.startsWith('Chrome') ? ` (base ${f.memoria_base_mb} MB)` : ''} |`;
const encabezado = ['| Motor | Entorno | Tamaño | WER | CER | Términos médicos | Números mal | Unidades mal | RTF | Carga | Memoria pico |', '|---|---|---|---|---|---|---|---|---|---|---|'];

const nativos = resumen.filter((f) => f.entorno.startsWith('nativo'));
const navegador = resumen.filter((f) => f.entorno.startsWith('Chrome'));
const categorias = [...new Set(corpus.map((m) => m.categoria))];
const filaCategorias = (f) => `| ${f.motor} (${f.entorno.startsWith('Chrome') ? 'Chrome' : 'nativo'}${/CPU \d+x/.test(f.entorno) ? ' CPU 4x' : ''}) | ` + categorias.map((c) => (f.werPorCategoria[c] ?? '-') + '%').join(' | ') + ' |';

const lineas = [
  '# Informe comparativo de motores de transcripción local',
  '',
  'Generado automáticamente por `evaluacion/generar_informe.js` a partir de `evaluacion/resultados/`. Cada cifra proviene de una ejecución real; ninguna está estimada.',
  '',
  '## Qué se midió y con qué',
  '',
  `* **Corpus:** ${corpus.length} audios con contenido médico **ficticio** (${Math.round(resumen[0].audioSegundos)} s en total), generados con voces neuronales sintéticas (es-CL Catalina y Lorenzo, y es-ES, es-MX, es-AR y es-CO para acentos). Categorías: ${categorias.join(', ')}. Se reproducen con \`python evaluacion/construir_corpus.py\` y \`python evaluacion/generar_audios.py\`.`,
  '* **Limitación importante:** el audio es sintético, limpio y bien pronunciado. Un dictado real con micrófono, ruido ambiental, voces cansadas o acentos marcados tendrá peores resultados. Estas cifras sirven para **comparar motores entre sí**, no para prometer una precisión absoluta.',
  '* **WER/CER:** tras normalizar mayúsculas, acentos y puntuación, y convertir números y unidades a una forma común (`quinientos miligramos` = `500 mg`).',
  '* **Términos médicos:** fracción de los términos clave de cada muestra que aparecen exactos en la salida.',
  '* **Números y unidades mal:** cifras y unidades de la referencia que no aparecen en la salida.',
  '* **RTF:** tiempo de decodificación dividido entre la duración del audio (menor es más rápido; 1,0 equivale a tiempo real).',
  '* **Memoria pico (navegador):** memoria de trabajo sumada de todos los procesos de Chrome, incluida la base de un Chrome vacío (unos 520 MB). No es solo lo que usa el modelo.',
  '',
  '## Resultados nativos (Python, onnxruntime en CPU, 1 hilo)',
  '',
  'Mismos pesos que en el navegador. Sirven para medir precisión y para comparar candidatos que no tienen runtime de navegador.',
  '',
  ...encabezado,
  ...nativos.map(fila),
  '',
  '## Resultados en Chrome real (WebAssembly, 1 hilo)',
  '',
  'Es la configuración realista para GitHub Pages: sin cabeceras `COOP/COEP` no hay WebAssembly con varios hilos. Los motores se ejecutan con el código de producción de `js/ia/`.',
  '',
  ...encabezado,
  ...navegador.map(fila),
  '',
  '## WER por categoría (%)',
  '',
  '| Motor | ' + categorias.join(' | ') + ' |',
  '|---|' + categorias.map(() => '---').join('|') + '|',
  ...[...nativos, ...navegador].map(filaCategorias),
  '',
  '## Diccionario médico (sugerencias para revisión)',
  '',
  `Prueba de control: ${diccionario.control.sugerenciasEnTextoCorrecto} sugerencias sobre los ${corpus.length} textos de referencia correctos. Además, 0 sugerencias sobre 2181 palabras de prosa española ajena al corpus (README del proyecto).`,
  '',
  '| Archivo | WER antes | WER si se aplican todas | Términos antes | Términos después | Sugerencias | Correctas | Incorrectas |',
  '|---|---|---|---|---|---|---|---|',
  ...diccionario.motores.map((m) => `| ${m.archivo} | ${m.werAntes}% | ${m.werDespues}% | ${m.terminosAntes} | ${m.terminosDespues} | ${m.sugerencias} | ${m.acertadas} | ${m.incorrectas} |`),
  '',
  '**Advertencia metodológica:** el léxico es general, pero contiene términos comunes que también aparecen en el corpus, y los umbrales de longitud se ajustaron tras observar falsos positivos en este mismo corpus. El beneficio real con otros dictados será menor. En la aplicación las correcciones solo se **sugieren**; el usuario decide cada una.',
  '',
  '## Licencias',
  '',
  '| Motor | Licencia de los pesos |',
  '|---|---|',
  ...Object.entries(LICENCIAS).filter(([m]) => resumen.some((f) => f.motor === m)).map(([m, l]) => `| ${m} | ${l} |`),
  ''
];

fs.writeFileSync(path.join(__dirname, 'INFORME.md'), lineas.join('\n'));
console.log('INFORME.md generado con', resumen.length, 'ejecuciones');
