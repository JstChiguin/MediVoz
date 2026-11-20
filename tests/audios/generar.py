import asyncio
import json
import os
import subprocess
import wave

import edge_tts
import imageio_ffmpeg
import numpy as np

CARPETA = os.path.dirname(os.path.abspath(__file__))
FRECUENCIA = 16000
PAUSA_S = 2.5


async def sintetizar(texto, voz, destino):
    await edge_tts.Communicate(texto, voz).save(destino)


def decodificar(mp3):
    resultado = subprocess.run(
        [imageio_ffmpeg.get_ffmpeg_exe(), '-v', 'error', '-i', mp3, '-f', 'f32le', '-ac', '1', '-ar', str(FRECUENCIA), '-'],
        capture_output=True, check=True)
    return np.frombuffer(resultado.stdout, dtype=np.float32).copy()


async def principal():
    with open(os.path.join(CARPETA, 'referencias.json'), encoding='utf8') as archivo:
        clips = json.load(archivo)
    for clip in clips:
        partes = [np.zeros(int(0.6 * FRECUENCIA), dtype=np.float32)]
        frases = clip['frases']
        for indice, frase in enumerate(frases):
            mp3 = os.path.join(CARPETA, 'tmp-%s-%d.mp3' % (clip['id'], indice))
            await sintetizar(frase, clip['voz'], mp3)
            partes.append(decodificar(mp3))
            os.remove(mp3)
            if indice < len(frases) - 1:
                partes.append(np.zeros(int(PAUSA_S * FRECUENCIA), dtype=np.float32))
        partes.append(np.zeros(int(0.8 * FRECUENCIA), dtype=np.float32))
        senal = np.concatenate(partes)
        senal = senal * (0.8 / (float(np.max(np.abs(senal))) or 1.0))
        with wave.open(os.path.join(CARPETA, clip['id'] + '.wav'), 'wb') as salida:
            salida.setnchannels(1)
            salida.setsampwidth(2)
            salida.setframerate(FRECUENCIA)
            salida.writeframes((np.clip(senal, -1, 1) * 32767).astype('<i2').tobytes())
        print('OK', clip['id'], round(len(senal) / FRECUENCIA, 1), 's')


asyncio.run(principal())
