const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { Navegador } = require('./ayudas/navegador');
const { iniciarServidor } = require('./servidor-estatico');
const { SIMULACIONES_BASE } = require('./ayudas/simulaciones');

let servidor;
let navegador;

before(async () => {
  servidor = await iniciarServidor();
  navegador = await Navegador.abrir();
  await navegador.scriptInicial(SIMULACIONES_BASE);
  navegador.registrarRed();
});

after(async () => {
  await navegador.cerrar();
  servidor.servidor.close();
});

beforeEach(async () => {
  await navegador.ir(servidor.url);
  await navegador.evaluar(() => {
    localStorage.clear();
    localStorage.setItem('mediVozMedicos', JSON.stringify(['Médico Ficticio Alfa']));
  });
  await navegador.recargar();
});

async function escribirYRevisar(texto) {
  await navegador.evaluar((t) => {
    document.getElementById('transcriptBox').textContent = t;
    document.getElementById('revisarBtn').click();
  }, texto);
}

const filas = () => navegador.evaluar(() => [...document.querySelectorAll('#sugerencias .sugerencia-fila')].map((f) => ({
  original: f.querySelector('.sugerencia-original').textContent,
  sugerencia: f.querySelector('strong').textContent
})));
const texto = () => navegador.evaluar(() => document.getElementById('transcriptBox').innerText.trim());

describe('Diccionario médico en la interfaz', () => {
  it('no muestra sugerencias cuando el texto es correcto', async () => {
    await escribirYRevisar('Se indica paracetamol 500 mg cada 8 horas.');
    await navegador.evaluar(() => new Promise((r) => setTimeout(r, 300)));
    assert.equal(await navegador.evaluar(() => document.getElementById('sugerencias').hidden), true);
  });

  it('muestra posibles errores, aplica solo el elegido y deja cifras y negaciones intactas', async () => {
    const original = 'Sin alergias, levotiloxina 75 mcg en ayunas y clonacepan 0,5 mg.';
    await escribirYRevisar(original);
    await navegador.esperarCondicion(() => document.querySelectorAll('#sugerencias .sugerencia-fila').length === 2, 'dos sugerencias');
    assert.deepEqual(await filas(), [{ original: 'levotiloxina', sugerencia: 'levotiroxina' }, { original: 'clonacepan', sugerencia: 'clonazepam' }]);
    assert.equal(await texto(), original);
    await navegador.evaluar(() => document.querySelector('#sugerencias .sugerencia-fila button').click());
    await navegador.esperarCondicion(() => document.querySelectorAll('#sugerencias .sugerencia-fila').length === 1, 'una sugerencia restante');
    assert.equal(await texto(), 'Sin alergias, levotiroxina 75 mcg en ayunas y clonacepan 0,5 mg.');
  });

  it('permite ignorar una sugerencia y no vuelve a mostrarla en la misma revisión', async () => {
    await escribirYRevisar('Se indica levotiloxina diaria.');
    await navegador.esperarCondicion(() => document.querySelectorAll('#sugerencias .sugerencia-fila').length === 1, 'sugerencia');
    await navegador.evaluar(() => document.querySelectorAll('#sugerencias .sugerencia-fila button')[1].click());
    await navegador.esperarCondicion(() => document.getElementById('sugerencias').hidden, 'sugerencias ocultas');
    await navegador.evaluar(() => document.getElementById('revisarBtn').click());
    await navegador.evaluar(() => new Promise((r) => setTimeout(r, 300)));
    assert.equal(await navegador.evaluar(() => document.getElementById('sugerencias').hidden), true);
    assert.equal(await texto(), 'Se indica levotiloxina diaria.');
  });

  it('no aplica una sugerencia si el texto cambió mientras tanto', async () => {
    await escribirYRevisar('Se indica levotiloxina diaria.');
    await navegador.esperarCondicion(() => document.querySelectorAll('#sugerencias .sugerencia-fila').length === 1, 'sugerencia');
    await navegador.evaluar(() => {
      document.getElementById('transcriptBox').textContent = 'Nota nueva escrita antes: Se indica levotiloxina diaria.';
      document.querySelector('#sugerencias .sugerencia-fila button').click();
    });
    await navegador.esperarCondicion(() => document.querySelector('#sugerencias .sugerencia-fila strong') !== null, 'revisión nueva');
    assert.equal(await texto(), 'Nota nueva escrita antes: Se indica levotiloxina diaria.');
  });

  it('el editor agrega y elimina términos propios y estos generan sugerencias', async () => {
    await navegador.evaluar(() => {
      document.getElementById('abrirDiccionarioBtn').click();
      document.getElementById('terminoDiccionarioInput').value = 'tocilizumab';
      document.getElementById('formularioDiccionario').requestSubmit();
    });
    assert.deepEqual(JSON.parse(await navegador.evaluar(() => localStorage.getItem('mediVozDiccionario'))), ['tocilizumab']);
    await navegador.evaluar(() => document.getElementById('cerrarDiccionarioBtn').click());
    await escribirYRevisar('Se indica tocilisumab mensual.');
    await navegador.esperarCondicion(() => document.querySelectorAll('#sugerencias .sugerencia-fila').length === 1, 'sugerencia propia');
    await navegador.evaluar(() => {
      document.getElementById('abrirDiccionarioBtn').click();
      document.querySelector('#listaDiccionario button').click();
    });
    assert.deepEqual(JSON.parse(await navegador.evaluar(() => localStorage.getItem('mediVozDiccionario'))), []);
  });

  it('rechaza términos con números o repetidos y limita el largo', async () => {
    await navegador.evaluar(() => {
      document.getElementById('abrirDiccionarioBtn').click();
      document.getElementById('terminoDiccionarioInput').value = 'vitamina 12';
      document.getElementById('formularioDiccionario').requestSubmit();
    });
    assert.match(await navegador.evaluar(() => document.getElementById('errorDiccionario').innerText), /números/);
    await navegador.evaluar(() => {
      const campo = document.getElementById('terminoDiccionarioInput');
      campo.value = 'tocilizumab';
      document.getElementById('formularioDiccionario').requestSubmit();
      campo.value = 'Tocilizumab';
      document.getElementById('formularioDiccionario').requestSubmit();
    });
    assert.match(await navegador.evaluar(() => document.getElementById('errorDiccionario').innerText), /ya está/);
    assert.equal(await navegador.evaluar(() => document.getElementById('terminoDiccionarioInput').maxLength), 60);
  });

  it('muestra como texto un término con HTML y no ejecuta nada', async () => {
    await navegador.evaluar(() => {
      localStorage.setItem('mediVozDiccionario', JSON.stringify(['<img src=x onerror="window.__ejecutado=1">']));
      document.getElementById('abrirDiccionarioBtn').click();
    });
    const resultado = await navegador.evaluar(() => ({
      imagenes: document.querySelectorAll('#listaDiccionario img').length,
      texto: document.querySelector('#listaDiccionario .medicos-nombre').textContent,
      ejecutado: window.__ejecutado
    }));
    assert.equal(resultado.imagenes, 0);
    assert.match(resultado.texto, /<img/);
    assert.equal(resultado.ejecutado, undefined);
  });

  it('una sugerencia con HTML en el texto dictado se muestra como texto', async () => {
    await escribirYRevisar('<img src=x onerror="window.__ejecutado=2"> levotiloxina');
    await navegador.esperarCondicion(() => document.querySelectorAll('#sugerencias .sugerencia-fila').length === 1, 'sugerencia');
    assert.equal(await navegador.evaluar(() => window.__ejecutado), undefined);
    assert.equal(await navegador.evaluar(() => document.querySelectorAll('#sugerencias img').length), 0);
  });

  it('Borrar limpia las sugerencias y no se usa la red', async () => {
    await escribirYRevisar('Se indica levotiloxina diaria.');
    await navegador.esperarCondicion(() => document.querySelectorAll('#sugerencias .sugerencia-fila').length === 1, 'sugerencia');
    await navegador.evaluar(() => document.getElementById('clearBtn').click());
    assert.equal(await navegador.evaluar(() => document.getElementById('sugerencias').hidden), true);
    const origen = new URL(servidor.url).origin;
    assert.deepEqual(navegador.solicitudes.filter((s) => !s.url.startsWith(origen) && !/^(data|blob):/.test(s.url)), []);
    assert.deepEqual(await navegador.evaluar(() => window.__violacionesCsp), []);
  });
});
