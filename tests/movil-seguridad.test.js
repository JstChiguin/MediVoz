const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { Navegador } = require('./ayudas/navegador');
const { iniciarServidor } = require('./servidor-estatico');
const { SIMULACIONES_BASE } = require('./ayudas/simulaciones');

const VISTAS = [
  { ancho: 320, alto: 568 },
  { ancho: 390, alto: 844 },
  { ancho: 412, alto: 915 }
];
const FACTOR_CPU = 4;
const LIMITE_CARGA_MS = 5000;
const LIMITE_CIFRADO_MS = 8000;
const LIMITE_DESBLOQUEO_MS = 8000;

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

for (const vista of VISTAS) {
  describe(`Seguridad en vista móvil emulada ${vista.ancho}x${vista.alto}`, () => {
    it('el panel cabe en pantalla, no queda bajo la firma y la firma exacta permanece intacta', async () => {
      await navegador.configurarVista({ ancho: vista.ancho, alto: vista.alto, movil: true });
      await navegador.ir(servidor.url);
      await navegador.evaluar(() => document.getElementById('abrirSeguridadBtn').click());
      const medida = await navegador.evaluar(() => {
        const panel = document.querySelector('#panelSeguridad .medicos-panel').getBoundingClientRect();
        const firma = document.querySelector('firma-medivoz');
        const caja = firma.getBoundingClientRect();
        const controles = [...document.querySelectorAll('#panelSeguridad button:not([hidden]), #panelSeguridad input:not([hidden])')]
          .filter((el) => el.offsetParent !== null)
          .map((el) => el.getBoundingClientRect());
        const cuerpo = document.querySelector('.seguridad-cuerpo');
        cuerpo.scrollTop = cuerpo.scrollHeight;
        return {
          dentroDePantalla: panel.left >= 0 && panel.right <= window.innerWidth && panel.top >= 0 && panel.bottom <= window.innerHeight,
          sinCruzarFirma: !(panel.right > caja.left && panel.bottom > caja.top),
          controlesDentro: controles.every((r) => r.left >= panel.left - 0.5 && r.right <= panel.right + 0.5),
          sinDesbordeHorizontal: document.scrollingElement.scrollWidth <= window.innerWidth,
          textoFirma: firma.querySelector('.firma-medivoz__autor').textContent,
          versionFirma: firma.querySelector('.firma-medivoz__version').textContent,
          firmaVisible: caja.left >= 0 && caja.right <= window.innerWidth && caja.bottom <= window.innerHeight && caja.top >= 0
        };
      });
      assert.deepEqual(medida, {
        dentroDePantalla: true,
        sinCruzarFirma: true,
        controlesDentro: true,
        sinDesbordeHorizontal: true,
        textoFirma: 'by Chiguin',
        versionFirma: 'v2.2.0',
        firmaVisible: true
      });
    });

    it(`con CPU ${FACTOR_CPU} veces más lenta (emulación) carga, cifra y desbloquea en tiempos razonables`, async () => {
      await navegador.configurarVista({ ancho: vista.ancho, alto: vista.alto, movil: true });
      await navegador.cliente.enviar('Emulation.setCPUThrottlingRate', { rate: FACTOR_CPU });
      try {
        const largo = 'Texto ficticio de dictado extenso con terminología clínica. '.repeat(90);
        const registros = Array.from({ length: 20 }, (_, i) => ({ id: 1700000000000 + i + 1, doctor: 'Médico Ficticio', patient: 'Paciente Ficticio ' + i, text: largo, time: '01-01-26 10:00' }));
        await navegador.ir(servidor.url);
        await navegador.evaluar((r) => { localStorage.clear(); localStorage.setItem('mediVozHistory', JSON.stringify(r)); }, registros);
        const inicio = Date.now();
        await navegador.recargar();
        const cargaMs = Date.now() - inicio;
        const medidas = await navegador.evaluar(async (c) => {
          document.getElementById('abrirSeguridadBtn').click();
          document.getElementById('contrasenaNueva').value = c;
          document.getElementById('contrasenaRepetida').value = c;
          const t0 = performance.now();
          document.getElementById('formularioCifrado').requestSubmit();
          while (!AlmacenSeguro.estado().cifrado) await new Promise((r) => setTimeout(r, 20));
          const cifradoMs = performance.now() - t0;
          document.getElementById('bloquearBtn').click();
          document.getElementById('contrasenaDesbloqueo').value = c;
          const t1 = performance.now();
          document.getElementById('formularioDesbloqueo').requestSubmit();
          while (AlmacenSeguro.estado().bloqueado) await new Promise((r) => setTimeout(r, 20));
          const desbloqueoMs = performance.now() - t1;
          return { cifradoMs, desbloqueoMs, registros: document.querySelectorAll('#historyList .history-item').length };
        }, 'Clave-Ficticia-2026!');
        console.log(`  [emulado ${vista.ancho}x${vista.alto}, CPU x${FACTOR_CPU}] carga=${cargaMs} ms, cifrado=${Math.round(medidas.cifradoMs)} ms, desbloqueo=${Math.round(medidas.desbloqueoMs)} ms, registros=${medidas.registros}`);
        assert.equal(medidas.registros, 20);
        assert.ok(cargaMs < LIMITE_CARGA_MS, 'carga ' + cargaMs);
        assert.ok(medidas.cifradoMs < LIMITE_CIFRADO_MS, 'cifrado ' + medidas.cifradoMs);
        assert.ok(medidas.desbloqueoMs < LIMITE_DESBLOQUEO_MS, 'desbloqueo ' + medidas.desbloqueoMs);
      } finally {
        await navegador.cliente.enviar('Emulation.setCPUThrottlingRate', { rate: 1 });
      }
    });
  });
}
