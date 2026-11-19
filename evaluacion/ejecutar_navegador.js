const fs = require('fs');
const path = require('path');
const { Navegador } = require('../tests/ayudas/navegador');
const { iniciarServidorBanco } = require('./servidor-banco');

const motor = process.argv[2];
const factorCpu = Number(process.argv[3] || 1);
const corpus = JSON.parse(fs.readFileSync(path.join(__dirname, 'corpus.json'), 'utf8'));

(async () => {
  const servidor = await iniciarServidorBanco();
  const navegador = await Navegador.abrir();
  if (factorCpu > 1) await navegador.cliente.enviar('Emulation.setCPUThrottlingRate', { rate: factorCpu });
  let pico = 0;
  const muestreo = setInterval(() => { pico = Math.max(pico, navegador.memoriaMb()); }, 1500);
  try {
    await navegador.ir(servidor.url + 'banco/index.html');
    await navegador.esperarCondicion(() => window.banco && window.banco.listo, 'banco listo');
    const base = navegador.memoriaMb();
    const carga = await navegador.evaluar((m) => window.banco.cargar(m), motor);
    const tras = navegador.memoriaMb();
    pico = Math.max(pico, tras);
    await navegador.evaluar(() => window.banco.transcribir('corto-01'));
    const resultados = {};
    for (const item of corpus) {
      resultados[item.id] = await navegador.evaluar((id) => window.banco.transcribir(id), item.id);
    }
    clearInterval(muestreo);
    pico = Math.max(pico, navegador.memoriaMb());
    const sufijo = factorCpu > 1 ? `-cpu${factorCpu}x` : '';
    const salida = {
      motor,
      entorno: `Chrome real, WASM 1 hilo${factorCpu > 1 ? `, CPU ${factorCpu}x más lenta (emulada)` : ''}`,
      carga_s: carga,
      memoria_base_mb: base,
      memoria_tras_carga_mb: tras,
      memoria_pico_mb: pico,
      resultados
    };
    fs.mkdirSync(path.join(__dirname, 'resultados'), { recursive: true });
    fs.writeFileSync(path.join(__dirname, 'resultados', `hipotesis-${motor}-navegador${sufijo}.json`), JSON.stringify(salida, null, 1));
    const audio = Object.values(resultados).reduce((a, r) => a + r.duracion_s, 0);
    const tiempo = Object.values(resultados).reduce((a, r) => a + r.tiempo_s, 0);
    console.log(`${motor}${sufijo}: carga ${carga}s, audio ${Math.round(audio)}s, decodificado ${tiempo.toFixed(1)}s (RTF ${(tiempo / audio).toFixed(2)}), memoria base ${base} MB, tras carga ${tras} MB, pico ${pico} MB`);
  } finally {
    clearInterval(muestreo);
    await navegador.cerrar();
    servidor.servidor.close();
  }
})().catch((e) => {
  console.error('ERROR', e.message);
  process.exit(1);
});
