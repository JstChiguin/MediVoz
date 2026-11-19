const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { Navegador, esperar } = require('./ayudas/navegador');
const { iniciarServidor } = require('./servidor-estatico');
const { SIMULACIONES_BASE } = require('./ayudas/simulaciones');

const CONTRASENA = 'Clave-Ficticia-2026!';
const REGISTROS = [
  { id: 1700000000001, doctor: 'Médico Ficticio Alfa', patient: 'Paciente Ficticio Uno', text: 'Paracetamol 500 mg cada 8 horas por 3 días.', time: '01-01-26 10:00' },
  { id: 1700000000002, doctor: 'Médico Ficticio Beta', patient: 'Paciente Ficticio Dos', text: 'Presión arterial 120/80 mmHg sin hallazgos.', time: '01-01-26 10:05' },
  { id: 1700000000003, doctor: 'Médico Ficticio Alfa', patient: 'Paciente Ficticio Tres', text: 'Sin antecedentes de alergia a penicilina.', time: '01-01-26 10:10' }
];

let servidor;
let navegador;

before(async () => {
  servidor = await iniciarServidor();
  navegador = await Navegador.abrir();
  await navegador.scriptInicial(SIMULACIONES_BASE);
});

after(async () => {
  await navegador.cerrar();
  servidor.servidor.close();
});

async function iniciar(historialPlano, ajustes) {
  await navegador.ir(servidor.url);
  await navegador.evaluar((h, a) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('mediVozMedicos', JSON.stringify(['Médico Ficticio Alfa', 'Médico Ficticio Beta']));
    if (h) localStorage.setItem('mediVozHistory', JSON.stringify(h));
    if (a) localStorage.setItem('mediVozSeguridad', JSON.stringify(a));
  }, historialPlano, ajustes);
  await navegador.recargar();
}

const almacenado = () => navegador.evaluar(() => Object.fromEntries(Object.keys(localStorage).map((k) => [k, localStorage.getItem(k)])));
const textoHistorial = () => navegador.evaluar(() => document.getElementById('historyList').innerText);
const estado = () => navegador.evaluar(() => AlmacenSeguro.estado());

async function activarCifrado(contrasena) {
  await navegador.evaluar(async (c) => {
    document.getElementById('abrirSeguridadBtn').click();
    document.getElementById('contrasenaNueva').value = c;
    document.getElementById('contrasenaRepetida').value = c;
    document.getElementById('formularioCifrado').requestSubmit();
  }, contrasena);
  await navegador.esperarCondicion(() => AlmacenSeguro.estado().cifrado, 'cifrado activado');
}

async function desbloquearDesdePanel(contrasena) {
  await navegador.evaluar((c) => {
    document.getElementById('abrirSeguridadBtn').click();
    document.getElementById('contrasenaDesbloqueo').value = c;
    document.getElementById('formularioDesbloqueo').requestSubmit();
  }, contrasena);
}

describe('Cifrado del historial', () => {
  beforeEach(async () => {
    await iniciar(REGISTROS);
  });

  it('sin cifrado el historial existente se conserva y se muestra', async () => {
    assert.deepEqual(await estado(), { cifrado: false, bloqueado: false, guardarEnDispositivo: true });
    const texto = await textoHistorial();
    assert.match(texto, /Paciente Ficticio Uno/);
    assert.match(texto, /Paciente Ficticio Tres/);
  });

  it('migra el historial plano a un paquete AES-GCM sin perder registros', async () => {
    await activarCifrado(CONTRASENA);
    const datos = await almacenado();
    assert.equal(datos.mediVozHistory, undefined);
    const paquete = JSON.parse(datos.mediVozHistorialCifrado);
    assert.equal(paquete.alg, 'AES-GCM-256');
    assert.equal(paquete.kdf, 'PBKDF2-SHA256');
    assert.ok(paquete.it >= 600000);
    assert.equal(Buffer.from(paquete.sal, 'base64').length, 16);
    assert.equal(Buffer.from(paquete.iv, 'base64').length, 12);
    assert.match(await textoHistorial(), /Paciente Ficticio Dos/);
  });

  it('el contenido guardado no deja texto clínico legible', async () => {
    await activarCifrado(CONTRASENA);
    const volcado = JSON.stringify(await almacenado());
    for (const registro of REGISTROS) {
      assert.ok(!volcado.includes(registro.patient));
      assert.ok(!volcado.includes(registro.text));
      assert.ok(!volcado.includes(Buffer.from(registro.patient).toString('base64')));
    }
  });

  it('la contraseña no se almacena en ningún lugar del navegador', async () => {
    await activarCifrado(CONTRASENA);
    const datos = JSON.stringify(await almacenado());
    const sesion = await navegador.evaluar(() => JSON.stringify(Object.fromEntries(Object.keys(sessionStorage).map((k) => [k, sessionStorage.getItem(k)]))));
    const campos = await navegador.evaluar(() => [...document.querySelectorAll('input')].map((i) => i.value).join('|'));
    assert.ok(!datos.includes(CONTRASENA));
    assert.ok(!sesion.includes(CONTRASENA));
    assert.ok(!campos.includes(CONTRASENA));
    const bases = await navegador.evaluar(async () => (indexedDB.databases ? (await indexedDB.databases()).length : 0));
    assert.equal(bases, 0);
  });

  it('tras recargar queda bloqueado y no muestra contenido', async () => {
    await activarCifrado(CONTRASENA);
    await navegador.recargar();
    assert.deepEqual(await estado(), { cifrado: true, bloqueado: true, guardarEnDispositivo: true });
    const texto = await textoHistorial();
    assert.match(texto, /bloqueado/);
    assert.doesNotMatch(texto, /Paciente Ficticio/);
    const cuerpo = await navegador.evaluar(() => document.body.innerText);
    assert.doesNotMatch(cuerpo, /Paracetamol|Paciente Ficticio/);
  });

  it('rechaza una contraseña incorrecta y mantiene el bloqueo', async () => {
    await activarCifrado(CONTRASENA);
    await navegador.recargar();
    await desbloquearDesdePanel('contrasena-equivocada');
    const mensaje = await navegador.esperarCondicion(() => document.getElementById('mensajeSeguridad').innerText.includes('incorrecta'), 'mensaje de error');
    assert.equal(mensaje, true);
    assert.equal((await estado()).bloqueado, true);
    assert.doesNotMatch(await textoHistorial(), /Paciente Ficticio/);
  });

  it('desbloquea con la contraseña correcta y recupera los registros idénticos', async () => {
    await activarCifrado(CONTRASENA);
    await navegador.recargar();
    await desbloquearDesdePanel(CONTRASENA);
    await navegador.esperarCondicion(() => !AlmacenSeguro.estado().bloqueado, 'desbloqueo');
    const recuperado = await navegador.evaluar(() => history.map((r) => r));
    assert.deepEqual(recuperado.sort((a, b) => a.id - b.id), REGISTROS);
  });

  it('cada escritura usa un vector de inicialización distinto y se descifra después de recargar', async () => {
    await activarCifrado(CONTRASENA);
    const ivUno = JSON.parse((await almacenado()).mediVozHistorialCifrado).iv;
    await navegador.evaluar(() => {
      document.getElementById('cerrarSeguridadBtn').click();
      document.getElementById('transcriptBox').textContent = 'Texto ficticio nuevo bajo cifrado';
      document.getElementById('patientInput').value = 'Paciente Ficticio Cuatro';
      document.getElementById('saveBtn').click();
    });
    await esperar(300);
    const ivDos = JSON.parse((await almacenado()).mediVozHistorialCifrado).iv;
    assert.notEqual(ivUno, ivDos);
    await navegador.recargar();
    await desbloquearDesdePanel(CONTRASENA);
    await navegador.esperarCondicion(() => !AlmacenSeguro.estado().bloqueado, 'desbloqueo');
    assert.match(await textoHistorial(), /Paciente Ficticio Cuatro/);
    assert.equal((await navegador.evaluar(() => history.length)), 4);
  });

  it('detecta datos alterados y no muestra contenido', async () => {
    await activarCifrado(CONTRASENA);
    await navegador.evaluar(() => {
      const paquete = JSON.parse(localStorage.getItem('mediVozHistorialCifrado'));
      const bytes = Uint8Array.from(atob(paquete.datos), (c) => c.charCodeAt(0));
      bytes[5] ^= 1;
      paquete.datos = btoa(String.fromCharCode(...bytes));
      localStorage.setItem('mediVozHistorialCifrado', JSON.stringify(paquete));
    });
    await navegador.recargar();
    await desbloquearDesdePanel(CONTRASENA);
    await navegador.esperarCondicion(() => document.getElementById('mensajeSeguridad').innerText.length > 0, 'mensaje');
    assert.equal((await estado()).bloqueado, true);
    assert.doesNotMatch(await textoHistorial(), /Paciente Ficticio/);
  });

  it('un paquete con parámetros manipulados se rechaza sin colgar el navegador', async () => {
    await activarCifrado(CONTRASENA);
    await navegador.evaluar(() => {
      const paquete = JSON.parse(localStorage.getItem('mediVozHistorialCifrado'));
      paquete.it = 2000000000;
      localStorage.setItem('mediVozHistorialCifrado', JSON.stringify(paquete));
    });
    await navegador.recargar();
    await desbloquearDesdePanel(CONTRASENA);
    await navegador.esperarCondicion(() => document.getElementById('mensajeSeguridad').innerText.includes('dañados'), 'rechazo de parámetros');
    assert.equal((await estado()).bloqueado, true);
  });

  it('bloquear ahora elimina el contenido de pantalla y de memoria', async () => {
    await activarCifrado(CONTRASENA);
    await navegador.evaluar(() => document.getElementById('bloquearBtn').click());
    assert.equal((await estado()).bloqueado, true);
    assert.doesNotMatch(await textoHistorial(), /Paciente Ficticio/);
    assert.equal(await navegador.evaluar(() => history.length), 0);
  });

  it('con el historial bloqueado no se puede guardar, imprimir ni exportar', async () => {
    await activarCifrado(CONTRASENA);
    await navegador.evaluar(() => document.getElementById('bloquearBtn').click());
    const antes = (await almacenado()).mediVozHistorialCifrado;
    await navegador.evaluar(() => {
      document.getElementById('cerrarSeguridadBtn').click();
      document.getElementById('transcriptBox').textContent = 'Texto ficticio sin permiso';
      document.getElementById('saveBtn').click();
      document.getElementById('printHistoryBtn').click();
    });
    assert.equal((await almacenado()).mediVozHistorialCifrado, antes);
    assert.equal(await navegador.evaluar(() => window.__ventanas.length), 0);
    assert.equal(await navegador.evaluar(() => document.getElementById('exportarHistorialBtn').disabled), true);
  });

  it('el bloqueo por inactividad se activa y no interrumpe una grabación', async () => {
    await activarCifrado(CONTRASENA);
    await navegador.evaluar(() => {
      const ahora = Date.now.bind(Date);
      window.__adelanto = 0;
      Date.now = () => ahora() + window.__adelanto;
      document.getElementById('cerrarSeguridadBtn').click();
      document.getElementById('micBtn').click();
      window.__adelanto = 11 * 60000;
    });
    await esperar(5600);
    assert.equal((await estado()).bloqueado, false);
    await navegador.evaluar(() => { document.getElementById('micBtn').click(); window.__adelanto += 11 * 60000; });
    await navegador.esperarCondicion(() => AlmacenSeguro.estado().bloqueado, 'bloqueo por inactividad');
  });

  it('quitar el cifrado restaura el historial plano exacto', async () => {
    await activarCifrado(CONTRASENA);
    await navegador.evaluar((c) => {
      document.getElementById('contrasenaDesactivar').value = c;
      document.getElementById('formularioDesactivar').requestSubmit();
    }, CONTRASENA);
    await navegador.esperarCondicion(() => !AlmacenSeguro.estado().cifrado, 'cifrado quitado');
    const datos = await almacenado();
    assert.equal(datos.mediVozHistorialCifrado, undefined);
    assert.deepEqual(JSON.parse(datos.mediVozHistory).sort((a, b) => a.id - b.id), REGISTROS);
  });

  it('quitar el cifrado con contraseña incorrecta no cambia nada', async () => {
    await activarCifrado(CONTRASENA);
    const antes = await almacenado();
    await navegador.evaluar(() => {
      document.getElementById('contrasenaDesactivar').value = 'otra-contrasena';
      document.getElementById('formularioDesactivar').requestSubmit();
    });
    await navegador.esperarCondicion(() => document.getElementById('mensajeSeguridad').innerText.includes('incorrecta'), 'error');
    assert.deepEqual(await almacenado(), antes);
  });

  it('una contraseña corta o distinta no activa el cifrado y el historial plano queda intacto', async () => {
    await navegador.evaluar(() => {
      document.getElementById('abrirSeguridadBtn').click();
      document.getElementById('contrasenaNueva').value = 'corta';
      document.getElementById('contrasenaRepetida').value = 'corta';
      document.getElementById('formularioCifrado').requestSubmit();
    });
    await navegador.esperarCondicion(() => document.getElementById('mensajeSeguridad').innerText.includes('al menos'), 'aviso de contraseña corta');
    await navegador.evaluar(() => {
      document.getElementById('contrasenaNueva').value = 'Contraseña-larga-1';
      document.getElementById('contrasenaRepetida').value = 'Contraseña-larga-2';
      document.getElementById('formularioCifrado').requestSubmit();
    });
    await navegador.esperarCondicion(() => document.getElementById('mensajeSeguridad').innerText.includes('no coinciden'), 'aviso de no coincidencia');
    const datos = await almacenado();
    assert.deepEqual(JSON.parse(datos.mediVozHistory), REGISTROS);
    assert.equal(datos.mediVozHistorialCifrado, undefined);
  });

  it('si el cifrado falla durante la migración el historial plano no se destruye', async () => {
    await navegador.evaluar(() => {
      crypto.subtle.encrypt = () => Promise.reject(new Error('fallo simulado'));
      document.getElementById('abrirSeguridadBtn').click();
      document.getElementById('contrasenaNueva').value = 'Contraseña-larga-1';
      document.getElementById('contrasenaRepetida').value = 'Contraseña-larga-1';
      document.getElementById('formularioCifrado').requestSubmit();
    });
    await navegador.esperarCondicion(() => document.getElementById('mensajeSeguridad').innerText.includes('No se pudo'), 'error de migración');
    const datos = await almacenado();
    assert.deepEqual(JSON.parse(datos.mediVozHistory), REGISTROS);
    assert.equal(datos.mediVozHistorialCifrado, undefined);
    assert.equal((await estado()).cifrado, false);
  });

  it('con el guardado desactivado las transcripciones nuevas no se escriben en el dispositivo', async () => {
    await navegador.evaluar(() => {
      document.getElementById('abrirSeguridadBtn').click();
      const casilla = document.getElementById('guardarEnDispositivo');
      casilla.checked = false;
      casilla.dispatchEvent(new Event('change'));
      document.getElementById('cerrarSeguridadBtn').click();
      document.getElementById('transcriptBox').textContent = 'Texto ficticio efímero';
      document.getElementById('patientInput').value = 'Paciente Efímero';
      document.getElementById('saveBtn').click();
    });
    const datos = await almacenado();
    assert.ok(!JSON.stringify(datos).includes('Paciente Efímero'));
    assert.match(await textoHistorial(), /Paciente Efímero/);
    await navegador.recargar();
    assert.doesNotMatch(await textoHistorial(), /Paciente Efímero/);
    assert.match(await textoHistorial(), /Paciente Ficticio Uno/);
  });

  it('exporta una copia JSON solo a pedido del usuario', async () => {
    await navegador.evaluar(() => {
      document.getElementById('abrirSeguridadBtn').click();
      document.getElementById('exportarHistorialBtn').click();
    });
    const descarga = await navegador.evaluar(async () => {
      const { nombre, url } = window.__descargas[0];
      return { nombre, contenido: JSON.parse(await window.__blobs[url].text()) };
    });
    assert.equal(descarga.nombre, 'MediVoz_historial.json');
    assert.equal(descarga.contenido.registros.length, 3);
    assert.equal(await navegador.evaluar(() => window.__descargas.length), 1);
  });

  it('borrar el historial bloqueado permite recuperarse de una contraseña perdida', async () => {
    await activarCifrado(CONTRASENA);
    await navegador.recargar();
    await navegador.evaluar(() => document.getElementById('clearHistoryBtn').click());
    const datos = await almacenado();
    assert.equal(datos.mediVozHistorialCifrado, undefined);
    assert.equal(datos.mediVozHistory, undefined);
    assert.deepEqual(await estado(), { cifrado: false, bloqueado: false, guardarEnDispositivo: true });
  });

  it('la sal es distinta entre activaciones', async () => {
    await activarCifrado(CONTRASENA);
    const salUno = JSON.parse((await almacenado()).mediVozHistorialCifrado).sal;
    await navegador.evaluar((c) => {
      document.getElementById('contrasenaDesactivar').value = c;
      document.getElementById('formularioDesactivar').requestSubmit();
    }, CONTRASENA);
    await navegador.esperarCondicion(() => !AlmacenSeguro.estado().cifrado, 'cifrado quitado');
    await activarCifrado(CONTRASENA);
    const salDos = JSON.parse((await almacenado()).mediVozHistorialCifrado).sal;
    assert.notEqual(salUno, salDos);
  });
});

describe('Migración de datos heredados', () => {
  it('descarta registros con forma inválida sin ejecutar su contenido', async () => {
    const mezclados = [
      REGISTROS[0],
      { id: '1);window.__ejecutado=1;//', doctor: 'x', patient: 'y', text: 'z', time: 't' },
      { id: -5, doctor: 'x' },
      null,
      'texto',
      { id: REGISTROS[0].id, doctor: 'duplicado', patient: '', text: '', time: '' },
      { id: 1700000000009, doctor: 'Médico <img src=x onerror="window.__ejecutado=2">', patient: 'P', text: 'T', time: '<b>t</b>' }
    ];
    await iniciar(mezclados);
    assert.equal(await navegador.evaluar(() => window.__ejecutado), undefined);
    const ids = await navegador.evaluar(() => history.map((r) => r.id));
    assert.deepEqual(ids, [REGISTROS[0].id, 1700000000009]);
    assert.equal(await navegador.evaluar(() => document.querySelectorAll('#historyList img, #historyList b').length), 0);
  });

  it('un historial con JSON dañado no rompe la aplicación', async () => {
    await navegador.ir(servidor.url);
    await navegador.evaluar(() => { localStorage.clear(); localStorage.setItem('mediVozHistory', '{no es json'); });
    await navegador.recargar();
    assert.deepEqual(await navegador.evaluar(() => history), []);
    assert.match(await textoHistorial(), /Aún no hay transcripciones/);
  });

  it('el historial plano heredado se conserva hasta que el usuario activa el cifrado', async () => {
    await iniciar(REGISTROS);
    await navegador.recargar();
    assert.deepEqual(JSON.parse((await almacenado()).mediVozHistory), REGISTROS);
  });
});
