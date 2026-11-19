import json
import os
import sys
import time
import wave

import numpy as np
import psutil

CARPETA = os.path.dirname(os.path.abspath(__file__))
MODELOS = os.environ.get('MEDIVOZ_MODELOS', os.path.join(CARPETA, 'modelos'))
HILOS = int(os.environ.get('MEDIVOZ_HILOS', '1'))


def ruta(*partes):
    return os.path.join(MODELOS, *partes)


def primero(carpeta, *candidatos):
    for nombre in candidatos:
        archivo = ruta(carpeta, nombre)
        if os.path.exists(archivo):
            return archivo
    raise FileNotFoundError(carpeta + ' ' + ','.join(candidatos))


def construir(motor):
    import sherpa_onnx as s
    OR = s.OfflineRecognizer
    if motor == 'conformer-ctc-es':
        c = 'sherpa-onnx-nemo-fast-conformer-ctc-es-1424-int8'
        return OR.from_nemo_ctc(model=ruta(c, 'model.int8.onnx'), tokens=ruta(c, 'tokens.txt'), num_threads=HILOS)
    if motor == 'conformer-transductor-es':
        c = 'sherpa-onnx-nemo-fast-conformer-transducer-es-1424-int8'
        return OR.from_transducer(encoder=ruta(c, 'encoder.int8.onnx'), decoder=ruta(c, 'decoder.int8.onnx'), joiner=ruta(c, 'joiner.int8.onnx'), tokens=ruta(c, 'tokens.txt'), model_type='nemo_transducer', num_threads=HILOS)
    if motor == 'canary-180m':
        c = 'sherpa-onnx-nemo-canary-180m-flash-en-es-de-fr-int8'
        return OR.from_nemo_canary(encoder=ruta(c, 'encoder.int8.onnx'), decoder=ruta(c, 'decoder.int8.onnx'), tokens=ruta(c, 'tokens.txt'), src_lang='es', tgt_lang='es', num_threads=HILOS)
    if motor == 'moonshine-base-es':
        c = 'sherpa-onnx-moonshine-base-es-quantized-2026-02-27'
        return OR.from_moonshine_v2(encoder=ruta(c, 'encoder_model.ort'), decoder=ruta(c, 'decoder_model_merged.ort'), tokens=ruta(c, 'tokens.txt'), num_threads=HILOS)
    if motor.startswith('whisper-'):
        nombre = motor.split('-')[1]
        c = 'sherpa-onnx-whisper-' + nombre
        encoder = primero(c, nombre + '-encoder.int8.onnx', nombre + '-encoder.onnx')
        decoder = primero(c, nombre + '-decoder.int8.onnx', nombre + '-decoder.onnx')
        return OR.from_whisper(encoder=encoder, decoder=decoder, tokens=primero(c, nombre + '-tokens.txt'), language='es', task='transcribe', num_threads=HILOS)
    if motor == 'parakeet-v3':
        c = 'sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8'
        return OR.from_transducer(encoder=ruta(c, 'encoder.int8.onnx'), decoder=ruta(c, 'decoder.int8.onnx'), joiner=ruta(c, 'joiner.int8.onnx'), tokens=ruta(c, 'tokens.txt'), model_type='nemo_transducer', num_threads=HILOS)
    raise ValueError(motor)


def leer_wav(archivo):
    with wave.open(archivo, 'rb') as w:
        datos = np.frombuffer(w.readframes(w.getnframes()), dtype='<i2').astype(np.float32) / 32768.0
        return datos, w.getframerate()


def transcribir_sherpa(reconocedor, muestras, frecuencia):
    flujo = reconocedor.create_stream()
    flujo.accept_waveform(frecuencia, muestras)
    reconocedor.decode_stream(flujo)
    return flujo.result.text


def transcribir_vosk(modelo, muestras, frecuencia):
    import vosk
    reconocedor = vosk.KaldiRecognizer(modelo, frecuencia)
    datos = (muestras * 32767).astype('<i2').tobytes()
    for inicio in range(0, len(datos), 8000):
        reconocedor.AcceptWaveform(datos[inicio:inicio + 8000])
    return json.loads(reconocedor.FinalResult()).get('text', '')


def principal(motor):
    proceso = psutil.Process()
    corpus = json.load(open(os.path.join(CARPETA, 'corpus.json'), encoding='utf8'))
    base = proceso.memory_info().rss
    t0 = time.perf_counter()
    if motor == 'vosk-small-es':
        import vosk
        vosk.SetLogLevel(-1)
        modelo = vosk.Model(ruta('vosk-model-small-es-0.42'))
        decodificar = lambda m, f: transcribir_vosk(modelo, m, f)
    else:
        reconocedor = construir(motor)
        decodificar = lambda m, f: transcribir_sherpa(reconocedor, m, f)
    carga_s = time.perf_counter() - t0
    tras_carga = proceso.memory_info().rss
    muestras, frecuencia = leer_wav(os.path.join(CARPETA, 'audios', corpus[0]['id'] + '.wav'))
    decodificar(muestras[:frecuencia * 2], frecuencia)
    resultados = {}
    for item in corpus:
        muestras, frecuencia = leer_wav(os.path.join(CARPETA, 'audios', item['id'] + '.wav'))
        t = time.perf_counter()
        texto = decodificar(muestras, frecuencia)
        tiempo = time.perf_counter() - t
        resultados[item['id']] = {'texto': texto, 'tiempo_s': round(tiempo, 3), 'duracion_s': round(len(muestras) / frecuencia, 2)}
    try:
        pico = proceso.memory_info().peak_wset
    except AttributeError:
        pico = proceso.memory_info().rss
    salida = {
        'motor': motor,
        'entorno': 'nativo (Python, CPU, %d hilo%s)' % (HILOS, '' if HILOS == 1 else 's'),
        'carga_s': round(carga_s, 2),
        'memoria_base_mb': round(base / 1e6),
        'memoria_tras_carga_mb': round(tras_carga / 1e6),
        'memoria_pico_mb': round(pico / 1e6),
        'resultados': resultados,
    }
    destino = os.path.join(CARPETA, 'resultados', 'hipotesis-%s-h%d.json' % (motor, HILOS))
    os.makedirs(os.path.dirname(destino), exist_ok=True)
    json.dump(salida, open(destino, 'w', encoding='utf8'), ensure_ascii=False, indent=1)
    total_audio = sum(r['duracion_s'] for r in resultados.values())
    total_tiempo = sum(r['tiempo_s'] for r in resultados.values())
    print('%s listo: carga %.1fs, audio %.0fs, decodificado en %.1fs (RTF %.2f), pico %d MB' % (motor, carga_s, total_audio, total_tiempo, total_tiempo / total_audio, pico / 1e6), flush=True)


if __name__ == '__main__':
    principal(sys.argv[1])
