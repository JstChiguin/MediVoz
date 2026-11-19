import asyncio
import json
import os
import subprocess
import sys
import wave

import edge_tts
import imageio_ffmpeg
import numpy as np

CARPETA = os.path.dirname(os.path.abspath(__file__))
SALIDA = os.path.join(CARPETA, 'audios')
TEMPORAL = os.path.join(SALIDA, 'tmp')
FRECUENCIA = 16000
SEMILLA = 20261119
SILENCIO_INICIAL_S = 0.6
PAUSA_ENTRE_FRASES_S = 2.5


def porcentaje(velocidad):
    return ('+' if velocidad >= 0 else '') + str(velocidad) + '%'


async def sintetizar(texto, voz, velocidad, destino_mp3):
    comunicador = edge_tts.Communicate(texto, voz, rate=porcentaje(velocidad))
    await comunicador.save(destino_mp3)


def decodificar(mp3):
    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    resultado = subprocess.run(
        [ffmpeg, '-v', 'error', '-i', mp3, '-f', 'f32le', '-ac', '1', '-ar', str(FRECUENCIA), '-'],
        capture_output=True, check=True)
    return np.frombuffer(resultado.stdout, dtype=np.float32).copy()


def silencio(segundos):
    return np.zeros(int(segundos * FRECUENCIA), dtype=np.float32)


def agregar_ruido(senal, snr_db, generador):
    potencia_senal = float(np.mean(senal ** 2)) or 1e-9
    potencia_ruido = potencia_senal / (10 ** (snr_db / 10))
    blanco = generador.standard_normal(len(senal)).astype(np.float32)
    espectro = np.fft.rfft(blanco)
    frecuencias = np.fft.rfftfreq(len(blanco), 1 / FRECUENCIA)
    frecuencias[0] = frecuencias[1]
    rosa = np.fft.irfft(espectro / np.sqrt(frecuencias), n=len(blanco)).astype(np.float32)
    rosa *= np.sqrt(potencia_ruido / (float(np.mean(rosa ** 2)) or 1e-9))
    return senal + rosa


def normalizar_pico(senal):
    pico = float(np.max(np.abs(senal))) or 1.0
    return (senal * (0.8 / pico)).astype(np.float32)


def guardar_wav(ruta, senal):
    datos = (np.clip(senal, -1, 1) * 32767).astype('<i2')
    with wave.open(ruta, 'wb') as archivo:
        archivo.setnchannels(1)
        archivo.setsampwidth(2)
        archivo.setframerate(FRECUENCIA)
        archivo.writeframes(datos.tobytes())


async def generar(muestra, generador):
    ruta_wav = os.path.join(SALIDA, muestra['id'] + '.wav')
    if os.path.exists(ruta_wav):
        return
    if muestra['pausas']:
        frases = [f.strip() + '.' for f in muestra['texto'].split('.') if f.strip()]
    else:
        frases = [muestra['texto']]
    partes = [silencio(SILENCIO_INICIAL_S)]
    for indice, frase in enumerate(frases):
        mp3 = os.path.join(TEMPORAL, '%s-%d.mp3' % (muestra['id'], indice))
        await sintetizar(frase, muestra['voz'], muestra['velocidad'], mp3)
        partes.append(decodificar(mp3))
        if indice < len(frases) - 1:
            partes.append(silencio(PAUSA_ENTRE_FRASES_S))
    partes.append(silencio(0.6))
    senal = np.concatenate(partes)
    if muestra['ruido']:
        senal = agregar_ruido(senal, muestra['ruido'], generador)
    guardar_wav(ruta_wav, normalizar_pico(senal))
    print('OK', muestra['id'], round(len(senal) / FRECUENCIA, 1), 's', flush=True)


async def principal():
    os.makedirs(TEMPORAL, exist_ok=True)
    with open(os.path.join(CARPETA, 'corpus.json'), encoding='utf8') as archivo:
        muestras = json.load(archivo)
    generador = np.random.default_rng(SEMILLA)
    for muestra in muestras:
        for intento in range(3):
            try:
                await generar(muestra, generador)
                break
            except Exception as error:
                print('REINTENTO', muestra['id'], str(error)[:80], file=sys.stderr, flush=True)
                await asyncio.sleep(2)


if __name__ == '__main__':
    asyncio.run(principal())
