import hashlib
import json
import os
import shutil
import sys

ORIGEN = sys.argv[1]
DESTINO = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'modelos', 'conformer-es')
TAMANO_PARTE = 20 * 1024 * 1024  # Cloudflare Pages admite 25 MiB por archivo; ver herramientas/dividir-modelo.js
ARCHIVOS = ['encoder.int8.onnx', 'decoder.int8.onnx', 'joiner.int8.onnx', 'tokens.txt']


def huella(datos):
    return hashlib.sha256(datos).hexdigest()


def principal():
    os.makedirs(DESTINO, exist_ok=True)
    manifiesto = {
        'modelo': 'stt_es_fastconformer_hybrid_large_pc (transductor, int8)',
        'licencia': 'CC-BY-4.0',
        'archivos': [],
    }
    for nombre in ARCHIVOS:
        with open(os.path.join(ORIGEN, nombre), 'rb') as archivo:
            datos = archivo.read()
        partes = []
        if len(datos) > TAMANO_PARTE:
            for indice, inicio in enumerate(range(0, len(datos), TAMANO_PARTE)):
                nombre_parte = '%s.parte%d' % (nombre, indice)
                with open(os.path.join(DESTINO, nombre_parte), 'wb') as salida:
                    salida.write(datos[inicio:inicio + TAMANO_PARTE])
                partes.append(nombre_parte)
        else:
            shutil.copyfile(os.path.join(ORIGEN, nombre), os.path.join(DESTINO, nombre))
            partes.append(nombre)
        manifiesto['archivos'].append({'nombre': nombre, 'tamano': len(datos), 'sha256': huella(datos), 'partes': partes})
    with open(os.path.join(DESTINO, 'manifiesto.json'), 'w', encoding='utf8') as salida:
        json.dump(manifiesto, salida, indent=1)
    print(json.dumps(manifiesto, indent=1))


principal()
