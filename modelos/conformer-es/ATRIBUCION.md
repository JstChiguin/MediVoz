# Atribución del modelo de voz local

Este directorio contiene el modelo de reconocimiento de voz que MediVoz ejecuta localmente en el navegador.

* **Modelo original:** `stt_es_fastconformer_hybrid_large_pc` (NVIDIA NeMo, FastConformer Hybrid Large en español con puntuación y mayúsculas, unos 114 millones de parámetros, entrenado con 1424 horas de voz en español).
* **Autor:** NVIDIA.
* **Licencia:** Creative Commons Attribution 4.0 International (CC-BY-4.0), https://creativecommons.org/licenses/by/4.0/ . Permite uso comercial y modificaciones con atribución.
* **Modificaciones:** exportación de la rama transductora a ONNX y cuantización a enteros de 8 bits, realizada por el proyecto sherpa-onnx (https://github.com/k2-fsa/sherpa-onnx). El codificador se divide en partes de 44 MiB solo para poder alojarlo en GitHub; el contenido y su huella SHA-256 (ver `manifiesto.json`) corresponden al archivo original.
* **Fuente de descarga:** https://github.com/k2-fsa/sherpa-onnx/releases/tag/asr-models (`sherpa-onnx-nemo-fast-conformer-transducer-es-1424-int8`).

Las transcripciones que produce este modelo pueden contener errores, especialmente en nombres de fármacos y cifras. Deben revisarse siempre antes de usarse con fines clínicos.
