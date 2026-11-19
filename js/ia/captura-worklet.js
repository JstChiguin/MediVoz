class CapturaMediVoz extends AudioWorkletProcessor {
  process(entradas) {
    const canal = entradas[0] && entradas[0][0];
    if (canal && canal.length) this.port.postMessage(canal.slice());
    return true;
  }
}

registerProcessor('captura-medivoz', CapturaMediVoz);
