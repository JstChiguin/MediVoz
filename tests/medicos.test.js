const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { Navegador } = require('./ayudas/navegador');
const { iniciarServidor } = require('./servidor-estatico');

const CLAVE_MEDICOS = 'mediVozMedicos';
const CLAVE_HISTORIAL = 'mediVozHistory';

let servidor;
let navegador;

before(async () => {
  servidor = await iniciarServidor();
  navegador = await Navegador.abrir();
  await navegador.configurarVista({ ancho: 1366, alto: 768, movil: false });
  await navegador.bloquearUrls(['*fonts.googleapis.com*', '*fonts.gstatic.com*', '*unpkg.com*']);
  await navegador.scriptInicial('window.__confirmar = true; window.confirm = () => window.__confirmar;');
});

after(async () => {
  await navegador.cerrar();
  servidor.servidor.close();
});

async function iniciarLimpio(medicos, historial) {
  await navegador.configurarVista({ ancho: 1366, alto: 768, movil: false });
  await navegador.ir(servidor.url);
  await navegador.evaluar((m, h, cm, ch) => {
    localStorage.clear();
    if (m) localStorage.setItem(cm, JSON.stringify(m));
    if (h) localStorage.setItem(ch, JSON.stringify(h));
  }, medicos || null, historial || null, CLAVE_MEDICOS, CLAVE_HISTORIAL);
  await navegador.recargar();
}

const abrirPanel = () => navegador.evaluar(() => document.getElementById('manageDoctorsBtn').click());
const medicosGuardados = () => navegador.evaluar((c) => JSON.parse(localStorage.getItem(c)), CLAVE_MEDICOS);
const historialGuardado = () => navegador.evaluar((c) => localStorage.getItem(c), CLAVE_HISTORIAL);
const opcionesSelector = () => navegador.evaluar(() => [...document.querySelectorAll('#doctorSelect option')].map((o) => o.textContent));
const nombresEnLista = () => navegador.evaluar(() => [...document.querySelectorAll('#listaMedicos .medicos-nombre')].map((n) => n.textContent));
const errorVisible = () => navegador.evaluar(() => document.getElementById('errorMedicos').textContent);

async function agregarMedico(nombre) {
  await navegador.evaluar((n) => {
    document.getElementById('nombreMedicoInput').value = n;
    document.getElementById('formularioMedico').requestSubmit();
  }, nombre);
}

const pulsarEnLista = (titulo) => navegador.evaluar((t) => {
  document.querySelector(`#listaMedicos [title="${t}"]`).click();
}, titulo);

async function renombrar(actual, nuevo) {
  await pulsarEnLista('Editar ' + actual);
  await navegador.evaluar((n) => {
    const campo = document.querySelector('#listaMedicos .medicos-campo-edicion');
    campo.value = n;
    campo.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  }, nuevo);
}

describe('Sin lista predeterminada', () => {
  it('no hay nombres de médicos escritos en el código fuente', () => {
    const raiz = path.resolve(__dirname, '..');
    for (const archivo of ['index.html', 'js/script.js', 'js/medicos.js', 'js/config.js']) {
      const contenido = fs.readFileSync(path.join(raiz, archivo), 'utf8');
      assert.ok(!/\bDra?\.\s+[A-ZÁÉÍÓÚÑ]/.test(contenido), `${archivo} contiene nombres de médicos`);
    }
    assert.equal((fs.readFileSync(path.join(raiz, 'index.html'), 'utf8').match(/<option/g) || []).length, 1);
  });

  it('muestra el aviso para agregar el primer médico cuando la lista está vacía', async () => {
    await iniciarLimpio();
    assert.deepEqual(await opcionesSelector(), ['— Sin médicos registrados —']);
    assert.equal(await navegador.evaluar(() => document.getElementById('avisoMedicos').hidden), false);
    await abrirPanel();
    assert.match(await navegador.evaluar(() => document.getElementById('listaMedicos').innerText), /Aún no hay médicos registrados/);
  });
});

describe('Administrador de médicos', () => {
  beforeEach(async () => iniciarLimpio(['Médico Ficticio Alfa', 'Médico Ficticio Beta']));

  it('tiene un botón discreto junto al selector que abre y cierra el panel', async () => {
    const info = await navegador.evaluar(() => {
      const boton = document.getElementById('manageDoctorsBtn');
      const selector = document.getElementById('doctorSelect');
      const a = boton.getBoundingClientRect();
      const b = selector.getBoundingClientRect();
      return { ancho: a.width, opacidad: Number(getComputedStyle(boton).opacity), mismaFila: Math.abs(a.top + a.height / 2 - (b.top + b.height / 2)) < 12, derechaDelSelector: a.left >= b.right - 1 };
    });
    assert.ok(info.ancho <= 44 && info.opacidad < 1);
    assert.equal(info.mismaFila, true);
    assert.equal(info.derechaDelSelector, true);
    assert.equal(await navegador.evaluar(() => document.getElementById('panelMedicos').hidden), true);
    await abrirPanel();
    assert.equal(await navegador.evaluar(() => document.getElementById('panelMedicos').hidden), false);
    await navegador.evaluar(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
    assert.equal(await navegador.evaluar(() => document.getElementById('panelMedicos').hidden), true);
  });

  it('muestra los médicos registrados en orden alfabético', async () => {
    await abrirPanel();
    assert.deepEqual(await nombresEnLista(), ['Médico Ficticio Alfa', 'Médico Ficticio Beta']);
    assert.deepEqual(await opcionesSelector(), ['— Seleccionar médico —', 'Médico Ficticio Alfa', 'Médico Ficticio Beta']);
  });

  it('agrega médicos, los ordena alfabéticamente y los guarda', async () => {
    await abrirPanel();
    await agregarMedico('  Médico   Ficticio  Zeta ');
    await agregarMedico('Árbol Ficticio Gamma');
    await agregarMedico('Médico Ficticio Delta');
    const esperado = ['Árbol Ficticio Gamma', 'Médico Ficticio Alfa', 'Médico Ficticio Beta', 'Médico Ficticio Delta', 'Médico Ficticio Zeta'];
    assert.deepEqual(await nombresEnLista(), esperado);
    assert.deepEqual((await opcionesSelector()).slice(1), esperado);
    assert.deepEqual(await medicosGuardados(), esperado);
  });

  it('rechaza nombres vacíos y duplicados', async () => {
    await abrirPanel();
    await agregarMedico('   ');
    assert.equal(await errorVisible(), 'El nombre no puede estar vacío.');
    await agregarMedico('médico ficticio ALFA');
    assert.equal(await errorVisible(), 'Ese médico ya está registrado.');
    await agregarMedico('Medico Ficticio Beta');
    assert.equal(await errorVisible(), 'Ese médico ya está registrado.');
    assert.deepEqual(await medicosGuardados(), ['Médico Ficticio Alfa', 'Médico Ficticio Beta']);
  });

  it('edita un nombre, mantiene el orden y conserva la selección', async () => {
    await navegador.evaluar(() => { document.getElementById('doctorSelect').value = 'Médico Ficticio Alfa'; });
    await abrirPanel();
    await renombrar('Médico Ficticio Alfa', 'Médico Ficticio Omega');
    assert.deepEqual(await nombresEnLista(), ['Médico Ficticio Beta', 'Médico Ficticio Omega']);
    assert.deepEqual(await medicosGuardados(), ['Médico Ficticio Beta', 'Médico Ficticio Omega']);
    assert.equal(await navegador.evaluar(() => document.getElementById('doctorSelect').value), 'Médico Ficticio Omega');
  });

  it('no permite renombrar a un nombre vacío o repetido', async () => {
    await abrirPanel();
    await renombrar('Médico Ficticio Alfa', '  ');
    assert.equal(await errorVisible(), 'El nombre no puede estar vacío.');
    await pulsarEnLista('Cancelar edición');
    await renombrar('Médico Ficticio Alfa', 'Médico Ficticio Beta');
    assert.equal(await errorVisible(), 'Ese médico ya está registrado.');
    assert.deepEqual(await medicosGuardados(), ['Médico Ficticio Alfa', 'Médico Ficticio Beta']);
  });

  it('elimina solo después de la confirmación', async () => {
    await abrirPanel();
    await navegador.evaluar(() => { window.__confirmar = false; });
    await pulsarEnLista('Eliminar Médico Ficticio Alfa');
    assert.deepEqual(await medicosGuardados(), ['Médico Ficticio Alfa', 'Médico Ficticio Beta']);
    await navegador.evaluar(() => { window.__confirmar = true; });
    await navegador.evaluar(() => { document.getElementById('doctorSelect').value = 'Médico Ficticio Alfa'; });
    await pulsarEnLista('Eliminar Médico Ficticio Alfa');
    assert.deepEqual(await medicosGuardados(), ['Médico Ficticio Beta']);
    assert.deepEqual(await nombresEnLista(), ['Médico Ficticio Beta']);
    assert.equal(await navegador.evaluar(() => document.getElementById('doctorSelect').value), '');
  });

  it('permite seleccionar un médico para la transcripción y guardarlo en el registro', async () => {
    await navegador.evaluar(() => {
      document.getElementById('doctorSelect').value = 'Médico Ficticio Beta';
      document.getElementById('transcriptBox').innerText = 'Texto ficticio de prueba';
      document.getElementById('saveBtn').click();
    });
    const [registro] = JSON.parse(await historialGuardado());
    assert.equal(registro.doctor, 'Médico Ficticio Beta');
  });

  it('muestra los nombres como texto y no como código HTML', async () => {
    await abrirPanel();
    await agregarMedico('<img src=x onerror="window.__inyectado=1">');
    assert.equal(await navegador.evaluar(() => window.__inyectado === 1 || document.querySelectorAll('#listaMedicos img').length > 0), false);
    assert.ok((await nombresEnLista()).includes('<img src=x onerror="window.__inyectado=1">'));
  });

  it('conserva la lista después de recargar la página', async () => {
    await abrirPanel();
    await agregarMedico('Médico Ficticio Gamma');
    await renombrar('Médico Ficticio Beta', 'Médico Ficticio Épsilon');
    await navegador.recargar();
    const esperado = ['Médico Ficticio Alfa', 'Médico Ficticio Épsilon', 'Médico Ficticio Gamma'];
    assert.deepEqual((await opcionesSelector()).slice(1), esperado);
    assert.deepEqual(await medicosGuardados(), esperado);
  });
});

describe('Protección de los registros históricos', () => {
  const registros = [
    { id: 3001, doctor: 'Médico Ficticio Alfa', patient: 'Paciente Ficticio Uno', text: 'Texto ficticio uno', time: '01-01-26 10:00' },
    { id: 3002, doctor: 'Médico Ficticio Beta', patient: 'Paciente Ficticio Dos', text: 'Texto ficticio dos', time: '01-01-26 10:01' }
  ];

  it('renombrar o eliminar médicos no altera el historial guardado ni su visualización', async () => {
    await iniciarLimpio(['Médico Ficticio Alfa', 'Médico Ficticio Beta'], registros);
    const antes = await historialGuardado();
    await abrirPanel();
    await renombrar('Médico Ficticio Alfa', 'Médico Ficticio Renombrado');
    await pulsarEnLista('Eliminar Médico Ficticio Beta');
    assert.equal(await historialGuardado(), antes);
    await navegador.recargar();
    assert.equal(await historialGuardado(), antes);
    const texto = await navegador.evaluar(() => document.getElementById('historyList').innerText);
    assert.match(texto, /Médico Ficticio Alfa/);
    assert.match(texto, /Médico Ficticio Beta/);
    assert.doesNotMatch(texto, /Renombrado/);
  });

  it('al editar un registro cuyo médico ya no está en la lista conserva su nombre original', async () => {
    await iniciarLimpio(['Médico Ficticio Alfa'], registros);
    await navegador.evaluar(() => document.querySelectorAll('.history-item')[1].querySelector('[title="Editar"]').click());
    assert.equal(await navegador.evaluar(() => document.getElementById('doctorSelect').value), 'Médico Ficticio Beta');
    assert.deepEqual(await medicosGuardados(), ['Médico Ficticio Alfa']);
    await navegador.evaluar(() => document.getElementById('saveBtn').click());
    const guardados = JSON.parse(await historialGuardado());
    assert.equal(guardados.find((r) => r.patient === 'Paciente Ficticio Dos').doctor, 'Médico Ficticio Beta');
    assert.deepEqual(await medicosGuardados(), ['Médico Ficticio Alfa']);
  });

  it('migra los médicos de registros existentes sin alterar el historial cuando no hay lista guardada', async () => {
    const conSinEspecificar = [...registros, { id: 3003, doctor: 'Médico sin especificar', patient: 'Paciente Ficticio Tres', text: 'Texto ficticio tres', time: '01-01-26 10:02' }];
    await iniciarLimpio(null, conSinEspecificar);
    assert.deepEqual(await medicosGuardados(), ['Médico Ficticio Alfa', 'Médico Ficticio Beta']);
    assert.deepEqual(JSON.parse(await historialGuardado()), conSinEspecificar);
    assert.deepEqual((await opcionesSelector()).slice(1), ['Médico Ficticio Alfa', 'Médico Ficticio Beta']);
  });

  it('no vuelve a migrar después de que el usuario vacía la lista', async () => {
    await iniciarLimpio(null, registros);
    await abrirPanel();
    await pulsarEnLista('Eliminar Médico Ficticio Alfa');
    await pulsarEnLista('Eliminar Médico Ficticio Beta');
    await navegador.recargar();
    assert.deepEqual(await medicosGuardados(), []);
    assert.deepEqual(await opcionesSelector(), ['— Sin médicos registrados —']);
  });
});

for (const { ancho, alto } of [{ ancho: 320, alto: 568 }, { ancho: 390, alto: 844 }]) {
  describe(`Administrador de médicos en móvil ${ancho}x${alto}`, () => {
    it('cabe en pantalla, se desplaza con muchos médicos y no queda bajo la firma', async () => {
      const nombres = Array.from({ length: 25 }, (_, i) => 'Médico Ficticio ' + String(i).padStart(2, '0'));
      await iniciarLimpio(nombres);
      await navegador.configurarVista({ ancho, alto, movil: true });
      await navegador.recargar();
      await abrirPanel();
      const medida = await navegador.evaluar(() => {
        const panel = document.querySelector('.medicos-panel').getBoundingClientRect();
        const lista = document.getElementById('listaMedicos');
        const firma = document.querySelector('firma-medivoz').getBoundingClientRect();
        const reserva = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--reserva-firma'));
        const formulario = document.getElementById('formularioMedico').getBoundingClientRect();
        lista.scrollTop = lista.scrollHeight;
        const ultimo = [...lista.querySelectorAll('.medicos-item')].pop().getBoundingClientRect();
        const botones = [...document.querySelectorAll('#panelMedicos .medicos-panel button, #panelMedicos .medicos-panel input')].map((el) => el.getBoundingClientRect());
        return {
          dentroDePantalla: panel.left >= 0 && panel.right <= window.innerWidth && panel.top >= 0 && panel.bottom <= window.innerHeight,
          sobreLaFranja: panel.bottom <= window.innerHeight - reserva + 1,
          sinCruzarFirma: !(panel.right > firma.left && panel.bottom > firma.top),
          listaDesplazable: lista.scrollHeight > lista.clientHeight,
          ultimoAccesible: ultimo.bottom <= panel.bottom + 1,
          formularioVisible: formulario.top >= panel.top && formulario.bottom <= panel.bottom,
          controlesDentro: botones.every((r) => r.left >= panel.left - 0.5 && r.right <= panel.right + 0.5)
        };
      });
      assert.deepEqual(medida, {
        dentroDePantalla: true,
        sobreLaFranja: true,
        sinCruzarFirma: true,
        listaDesplazable: true,
        ultimoAccesible: true,
        formularioVisible: true,
        controlesDentro: true
      });
    });
  });
}
