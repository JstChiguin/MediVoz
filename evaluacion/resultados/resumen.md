| Motor | Entorno | WER | CER | Términos | Números mal | Unidades mal | RTF | Carga | Memoria pico |
|---|---|---|---|---|---|---|---|---|---|
| parakeet-v3 | nativo (Python, CPU, 1 hilo) | 6.5% | 1.6% | 82.2% | 2/75 | 2/34 | 0.12 | 1.69s | 1572 MB |
| moonshine-base-es | nativo (Python, CPU, 1 hilo) | 7.9% | 3.4% | 82.2% | 5/75 | 2/34 | 0.26 | 0.58s | 969 MB |
| moonshine | Chrome real, WASM 1 hilo, CPU 4x más lenta (emulada) | 7.9% | 3.4% | 82.2% | 5/75 | 2/34 | 1.58 | 2.434s | 1037 MB |
| moonshine | Chrome real, WASM 1 hilo | 7.9% | 3.4% | 82.2% | 5/75 | 2/34 | 0.32 | 0.694s | 1085 MB |
| canary-180m | nativo (Python, CPU, 1 hilo) | 10.9% | 2.6% | 76.4% | 1/75 | 3/34 | 0.24 | 0.9s | 879 MB |
| conformer-transductor-es | nativo (Python, CPU, 1 hilo) | 12.1% | 2.9% | 75.8% | 7/75 | 3/34 | 0.03 | 0.77s | 622 MB |
| conformer | Chrome real, WASM 1 hilo, CPU 4x más lenta (emulada) | 12.4% | 3.3% | 73.9% | 7/75 | 3/34 | 0.32 | 4.049s | 1254 MB |
| conformer | Chrome real, WASM 1 hilo | 12.4% | 3.3% | 73.9% | 7/75 | 3/34 | 0.06 | 0.969s | 1247 MB |
| conformer-ctc-es | nativo (Python, CPU, 1 hilo) | 14.3% | 3.4% | 69.4% | 6/75 | 4/34 | 0.03 | 0.79s | 615 MB |
| whisper-small | nativo (Python, CPU, 1 hilo) | 18.5% | 8.5% | 66.9% | 7/75 | 5/34 | 0.35 | 1.26s | 1315 MB |
| vosk-small-es | nativo (Python, CPU, 1 hilo) | 26.9% | 7.6% | 53.5% | 0/75 | 8/34 | 0.05 | 0.37s | 208 MB |
| whisper-base | nativo (Python, CPU, 1 hilo) | 29.2% | 10.9% | 43.3% | 7/75 | 6/34 | 0.12 | 0.53s | 732 MB |
| whisper-tiny | nativo (Python, CPU, 1 hilo) | 44.4% | 19.9% | 29.9% | 14/75 | 14/34 | 0.06 | 0.37s | 504 MB |

| Motor | corto | extenso | terminos | medicamentos | numeros | velocidad | pausas | ruido | acentos |
|---|---|---|---|---|---|---|---|---|---|
| parakeet-v3 (nativo) | 0% | 2.8% | 2.8% | 22.9% | 12.9% | 0% | 0% | 12.5% | 8.8% |
| moonshine-base-es (nativo) | 5% | 8.2% | 1.4% | 18.6% | 2.9% | 9.5% | 0% | 14.6% | 7.4% |
| moonshine (Chrome) | 5% | 8.2% | 1.4% | 18.6% | 2.9% | 9.5% | 0% | 14.6% | 7.4% |
| moonshine (Chrome) | 5% | 8.2% | 1.4% | 18.6% | 2.9% | 9.5% | 0% | 14.6% | 7.4% |
| canary-180m (nativo) | 10% | 9.2% | 6.9% | 20% | 15.7% | 4.8% | 3.8% | 20.8% | 7.4% |
| conformer-transductor-es (nativo) | 7.5% | 6.7% | 9.7% | 20% | 37.1% | 9.5% | 7.7% | 16.7% | 5.9% |
| conformer (Chrome) | 5% | 8.2% | 5.6% | 20% | 37.1% | 9.5% | 15.4% | 16.7% | 5.9% |
| conformer (Chrome) | 5% | 8.2% | 5.6% | 20% | 37.1% | 9.5% | 15.4% | 16.7% | 5.9% |
| conformer-ctc-es (nativo) | 5% | 11.7% | 12.5% | 22.9% | 31.4% | 14.3% | 11.5% | 16.7% | 5.9% |
| whisper-small (nativo) | 5% | 22.7% | 13.9% | 35.7% | 21.4% | 0% | 11.5% | 18.8% | 7.4% |
| vosk-small-es (nativo) | 12.5% | 27% | 41.7% | 45.7% | 34.3% | 0% | 7.7% | 27.1% | 16.2% |
| whisper-base (nativo) | 20% | 35.5% | 40.3% | 38.6% | 21.4% | 19% | 3.8% | 22.9% | 16.2% |
| whisper-tiny (nativo) | 35% | 48.6% | 58.3% | 57.1% | 50% | 23.8% | 23.1% | 33.3% | 27.9% |
