# Informe comparativo de motores de transcripción local

Generado automáticamente por `evaluacion/generar_informe.js` a partir de `evaluacion/resultados/`. Cada cifra proviene de una ejecución real; ninguna está estimada.

## Qué se midió y con qué

* **Corpus:** 40 audios con contenido médico **ficticio** (419 s en total), generados con voces neuronales sintéticas (es-CL Catalina y Lorenzo, y es-ES, es-MX, es-AR y es-CO para acentos). Categorías: corto, extenso, terminos, medicamentos, numeros, velocidad, pausas, ruido, acentos. Se reproducen con `python evaluacion/construir_corpus.py` y `python evaluacion/generar_audios.py`.
* **Limitación importante:** el audio es sintético, limpio y bien pronunciado. Un dictado real con micrófono, ruido ambiental, voces cansadas o acentos marcados tendrá peores resultados. Estas cifras sirven para **comparar motores entre sí**, no para prometer una precisión absoluta.
* **WER/CER:** tras normalizar mayúsculas, acentos y puntuación, y convertir números y unidades a una forma común (`quinientos miligramos` = `500 mg`).
* **Términos médicos:** fracción de los términos clave de cada muestra que aparecen exactos en la salida.
* **Números y unidades mal:** cifras y unidades de la referencia que no aparecen en la salida.
* **RTF:** tiempo de decodificación dividido entre la duración del audio (menor es más rápido; 1,0 equivale a tiempo real).
* **Memoria pico (navegador):** memoria de trabajo sumada de todos los procesos de Chrome, incluida la base de un Chrome vacío (unos 520 MB). No es solo lo que usa el modelo.

## Resultados nativos (Python, onnxruntime en CPU, 1 hilo)

Mismos pesos que en el navegador. Sirven para medir precisión y para comparar candidatos que no tienen runtime de navegador.

| Motor | Entorno | Tamaño | WER | CER | Términos médicos | Números mal | Unidades mal | RTF | Carga | Memoria pico |
|---|---|---|---|---|---|---|---|---|---|---|
| parakeet-v3 | nativo (Python, CPU, 1 hilo) | 487 MB | 6.5% | 1.6% | 82.2% | 2/75 | 2/34 | 0.12 | 1.69 s | 1572 MB |
| moonshine-base-es | nativo (Python, CPU, 1 hilo) | 64 MB | 7.9% | 3.4% | 82.2% | 5/75 | 2/34 | 0.26 | 0.58 s | 969 MB |
| canary-180m | nativo (Python, CPU, 1 hilo) | 123 MB | 10.9% | 2.6% | 76.4% | 1/75 | 3/34 | 0.24 | 0.9 s | 879 MB |
| conformer-transductor-es | nativo (Python, CPU, 1 hilo) | 136 MB | 12.1% | 2.9% | 75.8% | 7/75 | 3/34 | 0.03 | 0.77 s | 622 MB |
| conformer-ctc-es | nativo (Python, CPU, 1 hilo) | 132 MB | 14.3% | 3.4% | 69.4% | 6/75 | 4/34 | 0.03 | 0.79 s | 615 MB |
| whisper-small | nativo (Python, CPU, 1 hilo) | 639 MB | 18.5% | 8.5% | 66.9% | 7/75 | 5/34 | 0.35 | 1.26 s | 1315 MB |
| vosk-small-es | nativo (Python, CPU, 1 hilo) | 39 MB | 26.9% | 7.6% | 53.5% | 0/75 | 8/34 | 0.05 | 0.37 s | 208 MB |
| whisper-base | nativo (Python, CPU, 1 hilo) | 208 MB | 29.2% | 10.9% | 43.3% | 7/75 | 6/34 | 0.12 | 0.53 s | 732 MB |
| whisper-tiny | nativo (Python, CPU, 1 hilo) | 116 MB | 44.4% | 19.9% | 29.9% | 14/75 | 14/34 | 0.06 | 0.37 s | 504 MB |

## Resultados en Chrome real (WebAssembly, 1 hilo)

Es la configuración realista para GitHub Pages: sin cabeceras `COOP/COEP` no hay WebAssembly con varios hilos. Los motores se ejecutan con el código de producción de `js/ia/`.

| Motor | Entorno | Tamaño | WER | CER | Términos médicos | Números mal | Unidades mal | RTF | Carga | Memoria pico |
|---|---|---|---|---|---|---|---|---|---|---|
| moonshine | Chrome real, WASM 1 hilo, CPU 4x más lenta (emulada) | 64 MB | 7.9% | 3.4% | 82.2% | 5/75 | 2/34 | 1.58 | 2.434 s | 1037 MB (base 513 MB) |
| moonshine | Chrome real, WASM 1 hilo | 64 MB | 7.9% | 3.4% | 82.2% | 5/75 | 2/34 | 0.32 | 0.694 s | 1085 MB (base 509 MB) |
| conformer | Chrome real, WASM 1 hilo, CPU 4x más lenta (emulada) | 136 MB | 12.4% | 3.3% | 73.9% | 7/75 | 3/34 | 0.32 | 4.049 s | 1254 MB (base 518 MB) |
| conformer | Chrome real, WASM 1 hilo | 136 MB | 12.4% | 3.3% | 73.9% | 7/75 | 3/34 | 0.06 | 0.969 s | 1247 MB (base 521 MB) |

## WER por categoría (%)

| Motor | corto | extenso | terminos | medicamentos | numeros | velocidad | pausas | ruido | acentos |
|---|---|---|---|---|---|---|---|---|---|
| parakeet-v3 (nativo) | 0% | 2.8% | 2.8% | 22.9% | 12.9% | 0% | 0% | 12.5% | 8.8% |
| moonshine-base-es (nativo) | 5% | 8.2% | 1.4% | 18.6% | 2.9% | 9.5% | 0% | 14.6% | 7.4% |
| canary-180m (nativo) | 10% | 9.2% | 6.9% | 20% | 15.7% | 4.8% | 3.8% | 20.8% | 7.4% |
| conformer-transductor-es (nativo) | 7.5% | 6.7% | 9.7% | 20% | 37.1% | 9.5% | 7.7% | 16.7% | 5.9% |
| conformer-ctc-es (nativo) | 5% | 11.7% | 12.5% | 22.9% | 31.4% | 14.3% | 11.5% | 16.7% | 5.9% |
| whisper-small (nativo) | 5% | 22.7% | 13.9% | 35.7% | 21.4% | 0% | 11.5% | 18.8% | 7.4% |
| vosk-small-es (nativo) | 12.5% | 27% | 41.7% | 45.7% | 34.3% | 0% | 7.7% | 27.1% | 16.2% |
| whisper-base (nativo) | 20% | 35.5% | 40.3% | 38.6% | 21.4% | 19% | 3.8% | 22.9% | 16.2% |
| whisper-tiny (nativo) | 35% | 48.6% | 58.3% | 57.1% | 50% | 23.8% | 23.1% | 33.3% | 27.9% |
| moonshine (Chrome CPU 4x) | 5% | 8.2% | 1.4% | 18.6% | 2.9% | 9.5% | 0% | 14.6% | 7.4% |
| moonshine (Chrome) | 5% | 8.2% | 1.4% | 18.6% | 2.9% | 9.5% | 0% | 14.6% | 7.4% |
| conformer (Chrome CPU 4x) | 5% | 8.2% | 5.6% | 20% | 37.1% | 9.5% | 15.4% | 16.7% | 5.9% |
| conformer (Chrome) | 5% | 8.2% | 5.6% | 20% | 37.1% | 9.5% | 15.4% | 16.7% | 5.9% |

## Diccionario médico (sugerencias para revisión)

Prueba de control: 0 sugerencias sobre los 40 textos de referencia correctos. Además, 0 sugerencias sobre 2181 palabras de prosa española ajena al corpus (README del proyecto).

| Archivo | WER antes | WER si se aplican todas | Términos antes | Términos después | Sugerencias | Correctas | Incorrectas |
|---|---|---|---|---|---|---|---|
| hipotesis-conformer-ctc-es-h1.json | 14.3% | 10.7% | 109/157 | 125/157 | 19 | 19 | 0 |
| hipotesis-conformer-navegador.json | 12.4% | 9.9% | 116/157 | 127/157 | 13 | 13 | 0 |
| hipotesis-conformer-transductor-es-h1.json | 12.1% | 10.4% | 119/157 | 127/157 | 9 | 9 | 0 |
| hipotesis-moonshine-base-es-h1.json | 7.9% | 7.1% | 129/157 | 134/157 | 5 | 5 | 0 |
| hipotesis-moonshine-navegador.json | 7.9% | 7.1% | 129/157 | 134/157 | 5 | 5 | 0 |
| hipotesis-parakeet-v3-h1.json | 6.5% | 5.8% | 129/157 | 134/157 | 5 | 5 | 0 |
| hipotesis-whisper-small-h1.json | 18.5% | 17% | 105/157 | 115/157 | 12 | 12 | 0 |

**Advertencia metodológica:** el léxico es general, pero contiene términos comunes que también aparecen en el corpus, y los umbrales de longitud se ajustaron tras observar falsos positivos en este mismo corpus. El beneficio real con otros dictados será menor. En la aplicación las correcciones solo se **sugieren**; el usuario decide cada una.

## Licencias

| Motor | Licencia de los pesos |
|---|---|
| conformer-transductor-es | CC-BY-4.0 |
| conformer-ctc-es | CC-BY-4.0 |
| conformer | CC-BY-4.0 |
| canary-180m | CC-BY-4.0 |
| moonshine-base-es | Moonshine Community License (no comercial; gratis bajo US$1 M de ingresos) |
| moonshine | Moonshine Community License (no comercial; gratis bajo US$1 M de ingresos) |
| parakeet-v3 | CC-BY-4.0 |
| whisper-tiny | MIT |
| whisper-base | MIT |
| whisper-small | MIT |
| vosk-small-es | Apache-2.0 |
