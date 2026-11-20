const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizar,
  tasaErrorPalabras,
  tasaErrorCaracteres,
  precisionTerminos,
  erroresNumerosYUnidades
} = require('../evaluacion/metricas');

describe('Normalización para medir transcripciones médicas', () => {
  it('convierte números escritos en cifras', () => {
    assert.equal(normalizar('ochocientos setenta y cinco'), '875');
    assert.equal(normalizar('mil quinientos'), '1500');
    assert.equal(normalizar('ciento cuarenta y dos'), '142');
    assert.equal(normalizar('treinta y siete coma cinco grados'), '37.5 grados');
    assert.equal(normalizar('un gramo'), '1 g');
    assert.equal(normalizar('dieciocho mil'), '18000');
  });

  it('trata igual cifras, palabras y unidades abreviadas', () => {
    assert.equal(normalizar('Quinientos miligramos'), normalizar('500 mg'));
    assert.equal(normalizar('noventa y siete por ciento'), normalizar('97%'));
    assert.equal(normalizar('uno coma dos miligramos por decilitro'), normalizar('1,2 mg/dl'));
    assert.equal(normalizar('ciento veinte sobre ochenta milímetros de mercurio'), normalizar('120 sobre 80 mmHg'));
  });

  it('ignora acentos, mayúsculas y puntuación', () => {
    assert.equal(normalizar('¡Hipertensión, Arterial!'), 'hipertension arterial');
  });
});

describe('Métricas de error', () => {
  it('WER es cero con textos equivalentes y mide sustituciones', () => {
    assert.equal(tasaErrorPalabras('Se indica paracetamol 500 mg', 'se indica paracetamol quinientos miligramos'), 0);
    assert.equal(tasaErrorPalabras('uno dos tres cuatro', 'uno dos tres cinco'), 0.25);
  });

  it('WER cuenta inserciones y borrados', () => {
    assert.equal(tasaErrorPalabras('paciente estable', 'el paciente estable hoy'), 1);
    assert.equal(tasaErrorPalabras('paciente estable hoy', 'paciente'), 2 / 3);
  });

  it('CER mide errores por carácter', () => {
    assert.equal(tasaErrorCaracteres('losartan', 'losartan'), 0);
    assert.ok(Math.abs(tasaErrorCaracteres('losartan', 'losartal') - 1 / 8) < 1e-9);
  });

  it('mide la precisión de términos médicos sin depender de acentos', () => {
    const resultado = precisionTerminos(['losartán', 'enalapril', 'hipertensión'], 'se cambia enalapril por losartan por hipertencion');
    assert.deepEqual(resultado, { total: 3, correctos: 2, fallidos: ['hipertensión'] });
  });

  it('detecta errores en números, dosis y unidades', () => {
    const correcto = erroresNumerosYUnidades('ciento veinte sobre ochenta milímetros de mercurio', '120 sobre 80 mmHg');
    assert.deepEqual(correcto, { numerosEsperados: 2, numerosIncorrectos: 0, unidadesEsperadas: 1, unidadesIncorrectas: 0 });
    const dosis = erroresNumerosYUnidades('cincuenta miligramos', '15 miligramos');
    assert.equal(dosis.numerosIncorrectos, 1);
    const unidad = erroresNumerosYUnidades('cincuenta miligramos', '50 microgramos');
    assert.equal(unidad.unidadesIncorrectas, 1);
  });
});
