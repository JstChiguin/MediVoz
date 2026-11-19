const SIMULACIONES_BASE = `
  window.confirm = () => true;
  window.__portapapeles = [];
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: (texto) => { window.__portapapeles.push(texto); return Promise.resolve(); } }
  });
  window.__ventanas = [];
  window.open = () => {
    const ventana = { html: '', impresa: false, document: { write(h) { ventana.html += h; }, close() { if (ventana.onload) ventana.onload(); } }, print() { ventana.impresa = true; } };
    window.__ventanas.push(ventana);
    return ventana;
  };
  window.__reconocimientos = [];
  class ReconocimientoFalso {
    constructor() { window.__reconocimientos.push(this); }
    start() {}
    stop() {}
  }
  window.SpeechRecognition = ReconocimientoFalso;
  window.__descargas = [];
  window.__blobs = {};
  const crearUrlOriginal = URL.createObjectURL.bind(URL);
  URL.createObjectURL = (blob) => { const url = crearUrlOriginal(blob); window.__blobs[url] = blob; return url; };
  HTMLAnchorElement.prototype.click = function () { window.__descargas.push({ nombre: this.download, url: this.href }); };
  window.__violacionesCsp = [];
  document.addEventListener('securitypolicyviolation', (e) => window.__violacionesCsp.push(e.violatedDirective));
`;

function dictar(texto) {
  const reconocimiento = window.__reconocimientos[window.__reconocimientos.length - 1];
  const resultado = { 0: { transcript: texto }, isFinal: true, length: 1 };
  reconocimiento.onresult({ resultIndex: 0, results: [resultado] });
}

module.exports = { SIMULACIONES_BASE, dictar };
