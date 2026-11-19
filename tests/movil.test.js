const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { Navegador } = require('./ayudas/navegador');
const { iniciarServidor } = require('./servidor-estatico');

const vistasMoviles = [
  { ancho: 320, alto: 568 },
  { ancho: 360, alto: 640 },
  { ancho: 390, alto: 844 },
  { ancho: 412, alto: 915 }
];

const SIMULACION_VOZ = `
  class ReconocimientoFalso {
    constructor() { window.__reconocimiento = this; }
    start() {}
    stop() {}
  }
  window.SpeechRecognition = ReconocimientoFalso;
`;

let servidor;
let navegador;

before(async () => {
  servidor = await iniciarServidor();
  navegador = await Navegador.abrir();
  await navegador.bloquearUrls(['*fonts.googleapis.com*', '*fonts.gstatic.com*', '*unpkg.com*']);
  await navegador.scriptInicial(SIMULACION_VOZ);
});

after(async () => {
  await navegador.cerrar();
  servidor.servidor.close();
});

async function prepararPagina(ancho, alto) {
  await navegador.configurarVista({ ancho, alto, movil: true });
  await navegador.ir(servidor.url);
  await navegador.evaluar(() => {
    localStorage.clear();
    localStorage.setItem('mediVozMedicos', JSON.stringify(['Médico Ficticio Alfa']));
    const registros = Array.from({ length: 6 }, (_, i) => ({
      id: 2000 + i,
      doctor: 'Médico Ficticio Alfa',
      patient: 'Paciente Ficticio ' + i,
      text: 'Texto ficticio de prueba ' + i,
      time: '01-01-26 10:0' + i
    }));
    localStorage.setItem('mediVozHistory', JSON.stringify(registros));
  });
  await navegador.ir(servidor.url);
  await navegador.esperarCondicion(() => document.querySelectorAll('.history-item').length === 6, 'historial cargado');
}

function cargarTranscripcionExtensa() {
  const lineas = Array.from({ length: 80 }, (_, i) => 'Línea ficticia número ' + i);
  document.getElementById('transcriptBox').innerText = lineas.join('\n');
}

for (const { ancho, alto } of vistasMoviles) {
  describe(`Desplazamiento y adaptación en móvil ${ancho}x${alto}`, () => {
    it('permite desplazar toda la página verticalmente', async () => {
      await prepararPagina(ancho, alto);
      await navegador.evaluar(cargarTranscripcionExtensa);
      const resultado = await navegador.evaluar(() => {
        const raiz = document.scrollingElement;
        const estiloHtml = getComputedStyle(document.documentElement);
        const estiloBody = getComputedStyle(document.body);
        raiz.scrollTop = 100000;
        return {
          desbordaVertical: raiz.scrollHeight > window.innerHeight,
          overflowHtml: estiloHtml.overflowY,
          overflowBody: estiloBody.overflowY,
          alturaBody: document.body.getBoundingClientRect().height,
          desplazado: raiz.scrollTop,
          maximo: raiz.scrollHeight - raiz.clientHeight
        };
      });
      assert.ok(resultado.desbordaVertical);
      assert.notEqual(resultado.overflowHtml, 'hidden');
      assert.notEqual(resultado.overflowBody, 'hidden');
      assert.ok(resultado.alturaBody > alto);
      assert.ok(resultado.desplazado > 0 && Math.abs(resultado.desplazado - resultado.maximo) <= 1);
    });

    it('no recorta la tarjeta: el contenido completo es alcanzable', async () => {
      await prepararPagina(ancho, alto);
      await navegador.evaluar(cargarTranscripcionExtensa);
      const medida = await navegador.evaluar(() => {
        const tarjeta = document.querySelector('.card');
        const historial = document.querySelector('.history-section').getBoundingClientRect();
        const rectTarjeta = tarjeta.getBoundingClientRect();
        return {
          recorte: tarjeta.scrollHeight - tarjeta.clientHeight,
          historialDentro: historial.bottom <= rectTarjeta.bottom + 1 && historial.top >= rectTarjeta.top
        };
      });
      assert.ok(medida.recorte <= 1, 'la tarjeta recorta ' + medida.recorte + 'px de contenido');
      assert.equal(medida.historialDentro, true);
    });

    it('muestra la transcripción completa mediante desplazamiento', async () => {
      await prepararPagina(ancho, alto);
      await navegador.evaluar(cargarTranscripcionExtensa);
      const caja = await navegador.evaluar(() => {
        const cuadro = document.getElementById('transcriptBox');
        const tarjeta = document.querySelector('.card').getBoundingClientRect();
        const r = cuadro.getBoundingClientRect();
        const inicio = cuadro.scrollTop;
        cuadro.scrollTop = cuadro.scrollHeight;
        const final = cuadro.scrollTop;
        const rectFinal = cuadro.getBoundingClientRect();
        return {
          desborda: cuadro.scrollHeight > cuadro.clientHeight,
          altoVisible: r.height,
          dentroDeTarjeta: r.left >= tarjeta.left && r.right <= tarjeta.right + 0.5,
          inicio,
          final,
          maximo: cuadro.scrollHeight - cuadro.clientHeight,
          ultimaLinea: cuadro.innerText.trim().split('\n').pop(),
          sigueMidiendoIgual: Math.abs(rectFinal.height - r.height) < 1
        };
      });
      assert.ok(caja.desborda);
      assert.ok(caja.altoVisible >= 150, 'cuadro demasiado pequeño: ' + caja.altoVisible);
      assert.equal(caja.dentroDeTarjeta, true);
      assert.equal(caja.inicio, 0);
      assert.ok(Math.abs(caja.final - caja.maximo) <= 1);
      assert.equal(caja.ultimaLinea, 'Línea ficticia número 79');
      assert.equal(caja.sigueMidiendoIgual, true);
    });

    it('adapta los botones al ancho sin cortarlos ni generar desplazamiento horizontal', async () => {
      await prepararPagina(ancho, alto);
      const medida = await navegador.evaluar(() => {
        const tarjeta = document.querySelector('.card').getBoundingClientRect();
        const raiz = document.scrollingElement;
        const fuera = [...document.querySelectorAll('.doctor-bar > *, .transcript-actions .btn-sm, .acciones-historial .btn-sm, .mic-btn')]
          .filter((el) => {
            const r = el.getBoundingClientRect();
            return r.width > 0 && (r.left < tarjeta.left - 0.5 || r.right > tarjeta.right + 0.5);
          })
          .map((el) => el.id || el.textContent.trim());
        const recortados = [...document.querySelectorAll('.btn-sm')]
          .filter((el) => el.scrollWidth > el.clientWidth + 1)
          .map((el) => el.textContent.trim());
        return { fuera, recortados, horizontal: raiz.scrollWidth - raiz.clientWidth };
      });
      assert.deepEqual(medida.fuera, []);
      assert.deepEqual(medida.recortados, []);
      assert.ok(medida.horizontal <= 0, 'desplazamiento horizontal de ' + medida.horizontal + 'px');
    });

    it('permite llegar al historial y pulsar sus botones sin que la franja los tape', async () => {
      await prepararPagina(ancho, alto);
      const medida = await navegador.evaluar(() => {
        document.scrollingElement.scrollTop = 100000;
        const reserva = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--reserva-firma'));
        const ultimo = [...document.querySelectorAll('.history-item')].pop();
        const rect = ultimo.getBoundingClientRect();
        const botones = [...ultimo.querySelectorAll('button')].map((boton) => {
          const r = boton.getBoundingClientRect();
          const x = r.left + r.width / 2;
          const y = r.top + r.height / 2;
          return document.elementFromPoint(x, y) === boton;
        });
        return {
          visible: rect.top >= 0 && rect.bottom <= window.innerHeight - reserva + 1,
          botonesAccesibles: botones
        };
      });
      assert.equal(medida.visible, true);
      assert.deepEqual(medida.botonesAccesibles, [true, true, true, true, true]);
    });

    it('mantiene el desplazamiento y la transcripción durante el dictado', async () => {
      await prepararPagina(ancho, alto);
      await navegador.evaluar(() => document.getElementById('micBtn').click());
      await navegador.evaluar(() => {
        for (let i = 0; i < 60; i++) {
          const resultado = [{ transcript: 'frase ficticia dictada número ' + i }];
          resultado.isFinal = true;
          window.__reconocimiento.onresult({ resultIndex: 0, results: [resultado] });
        }
      });
      const medida = await navegador.evaluar(() => {
        const cuadro = document.getElementById('transcriptBox');
        const raiz = document.scrollingElement;
        raiz.scrollTop = 100000;
        cuadro.scrollTop = cuadro.scrollHeight;
        return {
          contenido: cuadro.innerText.includes('frase ficticia dictada número 59'),
          cuadroDesplazable: cuadro.scrollHeight > cuadro.clientHeight,
          paginaDesplazada: raiz.scrollTop > 0,
          horizontal: raiz.scrollWidth - raiz.clientWidth
        };
      });
      await navegador.evaluar(() => document.getElementById('micBtn').click());
      assert.equal(medida.contenido, true);
      assert.equal(medida.cuadroDesplazable, true);
      assert.equal(medida.paginaDesplazada, true);
      assert.ok(medida.horizontal <= 0);
    });

    it('sigue siendo usable al reducirse la altura visible por un teclado simulado', async () => {
      await prepararPagina(ancho, alto);
      await navegador.configurarVista({ ancho, alto: 300, movil: true });
      await navegador.evaluar(() => document.getElementById('transcriptBox').focus());
      const medida = await navegador.evaluar(() => {
        const raiz = document.scrollingElement;
        raiz.scrollTop = 100000;
        const firma = document.querySelector('firma-medivoz').getBoundingClientRect();
        const reserva = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--reserva-firma'));
        const ultimo = [...document.querySelectorAll('.history-item')].pop().getBoundingClientRect();
        document.getElementById('transcriptBox').scrollIntoView({ block: 'center' });
        const caja = document.getElementById('transcriptBox').getBoundingClientRect();
        return {
          desplazable: raiz.scrollHeight > window.innerHeight,
          alcanzaHistorial: ultimo.bottom <= window.innerHeight - reserva + 1,
          firmaAbajoDerecha: window.innerWidth - firma.right <= 48 && window.innerHeight - firma.bottom <= 48 && firma.left > window.innerWidth / 2,
          cajaAccesible: caja.bottom > 0 && caja.top < window.innerHeight - reserva
        };
      });
      assert.deepEqual(medida, { desplazable: true, alcanzaHistorial: true, firmaAbajoDerecha: true, cajaAccesible: true });
    });
  });
}
