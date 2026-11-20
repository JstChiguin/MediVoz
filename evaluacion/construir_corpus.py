import json
import os

VOZ_CATALINA = 'es-CL-CatalinaNeural'
VOZ_LORENZO = 'es-CL-LorenzoNeural'


def muestra(identificador, categoria, texto, terminos, voz=VOZ_CATALINA, velocidad=0, ruido=None, pausas=False):
    return {
        'id': identificador,
        'categoria': categoria,
        'texto': texto,
        'terminos': terminos,
        'voz': voz,
        'velocidad': velocidad,
        'ruido': ruido,
        'pausas': pausas,
    }


MUESTRAS = [
    muestra('corto-01', 'corto', 'Paciente refiere cefalea de tres días de evolución.', ['cefalea', 'evolución']),
    muestra('corto-02', 'corto', 'Sin antecedentes de alergias medicamentosas.', ['alergias', 'medicamentosas'], VOZ_LORENZO),
    muestra('corto-03', 'corto', 'Se solicita electrocardiograma de control.', ['electrocardiograma']),
    muestra('corto-04', 'corto', 'Abdomen blando, depresible, sin signos de irritación peritoneal.', ['abdomen', 'depresible', 'peritoneal'], VOZ_LORENZO),
    muestra('corto-05', 'corto', 'Control en siete días con exámenes de laboratorio.', ['laboratorio']),
    muestra('corto-06', 'corto', 'Ruidos cardíacos rítmicos, sin soplos audibles.', ['cardíacos', 'rítmicos', 'soplos'], VOZ_LORENZO),
    muestra('extenso-01', 'extenso', 'Paciente de sesenta y cuatro años, con antecedentes de hipertensión arterial y diabetes mellitus tipo dos, que consulta por disnea progresiva de dos semanas de evolución, asociada a edema de extremidades inferiores y ortopnea. Al examen físico se encuentra taquicárdico, con presión arterial de ciento cuarenta sobre noventa milímetros de mercurio, saturación de oxígeno de noventa y tres por ciento ambiental. Se auscultan crépitos en ambas bases pulmonares. Se solicita radiografía de tórax, electrocardiograma, troponinas y péptido natriurético. Se plantea insuficiencia cardíaca descompensada y se inicia furosemida cuarenta miligramos endovenosos.',
             ['hipertensión', 'diabetes', 'disnea', 'edema', 'ortopnea', 'taquicárdico', 'crépitos', 'radiografía', 'electrocardiograma', 'troponinas', 'péptido', 'natriurético', 'insuficiencia', 'cardíaca', 'descompensada', 'furosemida', 'endovenosos']),
    muestra('extenso-02', 'extenso', 'Mujer de treinta y ocho años que ingresa por dolor abdominal en fosa ilíaca derecha de veinticuatro horas de evolución, con náuseas y vómitos. Presenta fiebre de treinta y ocho coma dos grados. Signo de Blumberg positivo. Los exámenes muestran leucocitosis de dieciocho mil células por microlitro y proteína C reactiva elevada. La ecografía abdominal sugiere apendicitis aguda. Se indica ayuno, hidratación parenteral y ceftriaxona un gramo cada veinticuatro horas, y se programa apendicectomía laparoscópica de urgencia.',
             ['abdominal', 'ilíaca', 'náuseas', 'Blumberg', 'leucocitosis', 'microlitro', 'proteína', 'ecografía', 'apendicitis', 'ceftriaxona', 'parenteral', 'apendicectomía', 'laparoscópica'], VOZ_LORENZO),
    muestra('extenso-03', 'extenso', 'Lactante de ocho meses, previamente sano, que presenta cuadro de tres días de tos, rinorrea y dificultad respiratoria. Al examen se observa polipnea, retracción subcostal y sibilancias espiratorias difusas. La saturación es de noventa por ciento. Se diagnostica bronquiolitis aguda probable por virus sincicial respiratorio. Se indica oxigenoterapia, salbutamol inhalado cada cuatro horas y control de signos vitales. Se educa a los padres sobre signos de alarma y se mantiene hospitalizado en observación.',
             ['lactante', 'rinorrea', 'polipnea', 'retracción', 'subcostal', 'sibilancias', 'espiratorias', 'bronquiolitis', 'sincicial', 'oxigenoterapia', 'salbutamol', 'hospitalizado']),
    muestra('extenso-04', 'extenso', 'Hombre de cincuenta y cinco años, tabáquico, que consulta por dolor torácico opresivo de inicio súbito, irradiado al brazo izquierdo, acompañado de sudoración y náuseas. El electrocardiograma muestra supradesnivel del segmento ST en derivaciones inferiores. Se activa protocolo de infarto agudo al miocardio, se administra ácido acetilsalicílico trescientos miligramos y se traslada de inmediato a la unidad de hemodinamia para angioplastía coronaria.',
             ['tabáquico', 'torácico', 'opresivo', 'electrocardiograma', 'supradesnivel', 'infarto', 'miocardio', 'ácido', 'acetilsalicílico', 'hemodinamia', 'angioplastía', 'coronaria'], VOZ_LORENZO),
    muestra('terminos-01', 'terminos', 'Diagnóstico de fibrilación auricular con respuesta ventricular rápida y antecedente de accidente cerebrovascular isquémico.', ['fibrilación', 'auricular', 'ventricular', 'cerebrovascular', 'isquémico']),
    muestra('terminos-02', 'terminos', 'Se realiza colecistectomía laparoscópica por colelitiasis sintomática, sin complicaciones intraoperatorias.', ['colecistectomía', 'laparoscópica', 'colelitiasis', 'sintomática', 'intraoperatorias'], VOZ_LORENZO),
    muestra('terminos-03', 'terminos', 'Hemoglobina glicosilada elevada compatible con diabetes mellitus mal controlada y nefropatía diabética incipiente.', ['hemoglobina', 'glicosilada', 'mellitus', 'nefropatía', 'diabética', 'incipiente']),
    muestra('terminos-04', 'terminos', 'Cuadro compatible con taquicardia supraventricular paroxística, resuelta con maniobras vagales.', ['taquicardia', 'supraventricular', 'paroxística', 'vagales'], VOZ_LORENZO),
    muestra('terminos-05', 'terminos', 'Paciente con hipotiroidismo secundario a tiroiditis de Hashimoto, en tratamiento sustitutivo.', ['hipotiroidismo', 'tiroiditis', 'Hashimoto', 'sustitutivo']),
    muestra('terminos-06', 'terminos', 'Tomografía axial computarizada de cerebro sin evidencia de hemorragia subaracnoidea ni efecto de masa.', ['tomografía', 'axial', 'computarizada', 'hemorragia', 'subaracnoidea'], VOZ_LORENZO),
    muestra('medicamentos-01', 'medicamentos', 'Se indica paracetamol quinientos miligramos cada ocho horas por tres días.', ['paracetamol', 'miligramos']),
    muestra('medicamentos-02', 'medicamentos', 'Iniciar amoxicilina con ácido clavulánico ochocientos setenta y cinco miligramos cada doce horas.', ['amoxicilina', 'clavulánico'], VOZ_LORENZO),
    muestra('medicamentos-03', 'medicamentos', 'Continuar con metformina mil miligramos al día y atorvastatina veinte miligramos en la noche.', ['metformina', 'atorvastatina']),
    muestra('medicamentos-04', 'medicamentos', 'Se suspende enalapril y se cambia a losartán cincuenta miligramos por tos persistente.', ['enalapril', 'losartán', 'persistente'], VOZ_LORENZO),
    muestra('medicamentos-05', 'medicamentos', 'Omeprazol veinte miligramos en ayunas, ketoprofeno solo si presenta dolor intenso.', ['omeprazol', 'ketoprofeno']),
    muestra('medicamentos-06', 'medicamentos', 'Levotiroxina setenta y cinco microgramos en ayunas, clonazepam medio miligramo antes de dormir.', ['levotiroxina', 'microgramos', 'clonazepam'], VOZ_LORENZO),
    muestra('numeros-01', 'numeros', 'Presión arterial ciento veinte sobre ochenta milímetros de mercurio, frecuencia cardíaca setenta y dos latidos por minuto.', ['cardíaca', 'latidos']),
    muestra('numeros-02', 'numeros', 'Temperatura treinta y siete coma cinco grados, saturación noventa y siete por ciento, frecuencia respiratoria dieciocho por minuto.', ['saturación', 'respiratoria'], VOZ_LORENZO),
    muestra('numeros-03', 'numeros', 'Glicemia en ayunas ciento cuarenta y dos miligramos por decilitro, creatinina uno coma dos miligramos por decilitro.', ['glicemia', 'ayunas', 'creatinina']),
    muestra('numeros-04', 'numeros', 'Peso setenta y ocho kilos, talla uno coma setenta y dos metros, índice de masa corporal veintiséis coma tres.', ['índice', 'masa', 'corporal'], VOZ_LORENZO),
    muestra('numeros-05', 'numeros', 'Administrar insulina glargina veinticuatro unidades subcutáneas cada noche y control de glicemia a las seis y a las veintidós horas.', ['insulina', 'glargina', 'subcutáneas', 'glicemia']),
    muestra('numeros-06', 'numeros', 'Hemoglobina once coma ocho gramos por decilitro, plaquetas ciento cincuenta mil por microlitro, leucocitos nueve mil quinientos.', ['hemoglobina', 'plaquetas', 'leucocitos'], VOZ_LORENZO),
    muestra('velocidad-lenta', 'velocidad', 'Se indica ibuprofeno cuatrocientos miligramos cada ocho horas por cinco días, con las comidas.', ['ibuprofeno'], velocidad=-30),
    muestra('velocidad-normal', 'velocidad', 'Se indica ibuprofeno cuatrocientos miligramos cada ocho horas por cinco días, con las comidas.', ['ibuprofeno']),
    muestra('velocidad-rapida', 'velocidad', 'Se indica ibuprofeno cuatrocientos miligramos cada ocho horas por cinco días, con las comidas.', ['ibuprofeno'], velocidad=35),
    muestra('pausas-01', 'pausas', 'Paciente estable. Presión arterial normal. Se indica alta médica con control ambulatorio en diez días.', ['ambulatorio'], pausas=True),
    muestra('pausas-02', 'pausas', 'Dolor torácico atípico. Electrocardiograma sin alteraciones. Se solicita prueba de esfuerzo.', ['torácico', 'atípico', 'electrocardiograma'], VOZ_LORENZO, pausas=True),
    muestra('ruido-20db', 'ruido', 'Se indica ceftriaxona un gramo endovenoso cada veinticuatro horas por siete días.', ['ceftriaxona', 'endovenoso'], ruido=20),
    muestra('ruido-10db', 'ruido', 'Se indica ceftriaxona un gramo endovenoso cada veinticuatro horas por siete días.', ['ceftriaxona', 'endovenoso'], ruido=10),
    muestra('ruido-15db-largo', 'ruido', 'Mujer de cuarenta años con migraña con aura, se inicia sumatriptán cincuenta miligramos al inicio del dolor y se solicita resonancia magnética de cerebro.', ['migraña', 'sumatriptán', 'resonancia', 'magnética'], VOZ_LORENZO, ruido=15),
]

TEXTO_ACENTO = 'Paciente con neumonía adquirida en la comunidad, se indica azitromicina quinientos miligramos al día por tres días.'
TERMINOS_ACENTO = ['neumonía', 'adquirida', 'comunidad', 'azitromicina']
for sufijo, voz in [('es-ES', 'es-ES-AlvaroNeural'), ('es-MX', 'es-MX-DaliaNeural'), ('es-AR', 'es-AR-ElenaNeural'), ('es-CO', 'es-CO-SalomeNeural')]:
    MUESTRAS.append(muestra('acento-' + sufijo, 'acentos', TEXTO_ACENTO, TERMINOS_ACENTO, voz))

if __name__ == '__main__':
    destino = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'corpus.json')
    with open(destino, 'w', encoding='utf8') as archivo:
        json.dump(MUESTRAS, archivo, ensure_ascii=False, indent=1)
    print(len(MUESTRAS), 'muestras')
