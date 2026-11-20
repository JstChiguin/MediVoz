const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

let DiccionarioMedico;
let LEXICO_BASE;
let diccionario;

before(async () => {
  ({ DiccionarioMedico } = await import(pathToFileURL(path.resolve(__dirname, '../js/ia/diccionario-medico.js')).href));
  ({ LEXICO_BASE } = await import(pathToFileURL(path.resolve(__dirname, '../js/ia/lexico-base.js')).href));
  diccionario = new DiccionarioMedico(LEXICO_BASE);
});

const sugerencias = (texto) => diccionario.sugerir(texto).map((s) => [s.original, s.sugerencia]);

describe('Diccionario médico: sugerencias', () => {
  it('sugiere el nombre correcto de un fármaco mal transcrito', () => {
    assert.deepEqual(sugerencias('Levotiloxina setenta y cinco microgramos en ayunas.'), [['Levotiloxina', 'levotiroxina']]);
    assert.deepEqual(sugerencias('Clonacepan medio miligramo antes de dormir.'), [['Clonacepan', 'clonazepam']]);
  });

  it('une palabras partidas que forman un término del diccionario', () => {
    assert.deepEqual(sugerencias('Se indica para setamol cada ocho horas.'), [['para setamol', 'paracetamol']]);
  });

  it('respeta las mayúsculas del original al aplicar', () => {
    const lista = diccionario.sugerir('Levotiloxina en ayunas.');
    assert.equal(diccionario.aplicar('Levotiloxina en ayunas.', lista), 'Levotiroxina en ayunas.');
  });

  it('acepta términos propios del usuario', () => {
    const propio = new DiccionarioMedico([...LEXICO_BASE, 'tocilizumab']);
    assert.deepEqual(propio.sugerir('Se indica tocilisumab mensual.').map((s) => s.sugerencia), ['tocilizumab']);
    assert.deepEqual(diccionario.sugerir('Se indica tocilisumab mensual.'), []);
  });

  it('no sugiere nada sobre texto correcto', () => {
    const corpus = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../evaluacion/corpus.json'), 'utf8'));
    const falsas = corpus.flatMap((m) => diccionario.sugerir(m.texto).map((s) => m.id + ': ' + s.original + ' -> ' + s.sugerencia));
    assert.deepEqual(falsas, []);
  });

  it('no sugiere nada sobre prosa española común', () => {
    const prosa = fs.readFileSync(path.resolve(__dirname, '../README.md'), 'utf8');
    assert.deepEqual(diccionario.sugerir(prosa), []);
  });

  it('no trata como error las variantes de género y número de términos válidos', () => {
    assert.deepEqual(sugerencias('Se administran miligramo y plaquetas por endovenosos con respiratorio.'), []);
  });
});

describe('Diccionario médico: nunca altera cifras, dosis ni negaciones', () => {
  const textosConErrores = [
    'Sin alergias a penicilina, losartán 15 mg y levotiloxina 75 mcg, sin clonacepan.',
    'El paciente niega alergias; no tolera enalapril 20 mg ni atorvastatina 40 mg cada 12 horas.',
    'Presión 120 sobre 80, saturación 97%, glicemia 1,2 mg/dl, descarta cefalia y paracetamol 500 mg.',
    'No usar ibuprufeno; ausencia de disnea, amoxicilina 875 mg y metformina 1000 mg al día.',
    'Dosis 0,5 mg de clonacepan, nunca sobre 2 mg; sin edema ni taquicardia, control en 7 días.'
  ];

  it('conserva exactamente los números y símbolos del texto', () => {
    for (const texto of textosConErrores) {
      const corregido = diccionario.aplicar(texto, diccionario.sugerir(texto));
      const numeros = (t) => (t.match(/[\d.,/%]+/g) || []).join('|');
      assert.equal(numeros(corregido), numeros(texto), texto);
    }
  });

  it('conserva todas las negaciones y palabras de cantidad', () => {
    const protegidas = /\b(no|sin|ni|nunca|niega|descarta|ausencia|sobre|cada)\b/gi;
    for (const texto of textosConErrores) {
      const corregido = diccionario.aplicar(texto, diccionario.sugerir(texto));
      assert.deepEqual(corregido.match(protegidas), texto.match(protegidas), texto);
    }
  });

  it('solo propone cambios sobre palabras formadas por letras de al menos ocho caracteres', () => {
    for (const texto of textosConErrores) {
      for (const sugerencia of diccionario.sugerir(texto)) {
        assert.match(sugerencia.original.replace(/ /g, ''), /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]{8,}$/);
        assert.doesNotMatch(sugerencia.original, /\d/);
      }
    }
  });

  it('cada cambio aplica únicamente el texto sugerido y deja el resto intacto', () => {
    const texto = 'Se indica levotiloxina 75 mcg y clonacepan 0,5 mg, sin alergias.';
    const [primera] = diccionario.sugerir(texto);
    const resultado = diccionario.aplicar(texto, [primera]);
    assert.equal(resultado, 'Se indica levotiroxina 75 mcg y clonacepan 0,5 mg, sin alergias.');
  });
});
