export class SegmentadorVoz {
  constructor({
    frecuencia,
    tramaMs = 30,
    silencioFinMs = 700,
    prerrolloMs = 300,
    maximoSegundos = 25,
    minimoSegundos = 0.4,
    vozMinimaMs = 200,
    umbralMinimo = 0.008,
    factorRuido = 3,
    ventanaRuidoTramas = 70,
    tramasParaIniciar = 2
  }) {
    this.frecuencia = frecuencia;
    this.largoTrama = Math.round((frecuencia * tramaMs) / 1000);
    this.tramaMs = tramaMs;
    this.tramasSilencioFin = Math.ceil(silencioFinMs / tramaMs);
    this.tramasPrerrollo = Math.ceil(prerrolloMs / tramaMs);
    this.tramasMaximas = Math.floor((maximoSegundos * 1000) / tramaMs);
    this.tramasMinimas = Math.ceil((minimoSegundos * 1000) / tramaMs);
    this.tramasVozMinimas = Math.ceil(vozMinimaMs / tramaMs);
    this.umbralMinimo = umbralMinimo;
    this.factorRuido = factorRuido;
    this.ventanaRuido = ventanaRuidoTramas;
    this.tramasParaIniciar = tramasParaIniciar;
    this.restos = new Float32Array(0);
    this.prerrollo = [];
    this.recientes = [];
    this.tramas = [];
    this.energias = [];
    this.enSegmento = false;
    this.tramasSilencio = 0;
    this.tramasVoz = 0;
    this.consecutivas = 0;
  }

  umbral() {
    if (!this.recientes.length) return this.umbralMinimo;
    return Math.max(this.umbralMinimo, Math.min(...this.recientes) * this.factorRuido);
  }

  procesar(bloque) {
    const unido = new Float32Array(this.restos.length + bloque.length);
    unido.set(this.restos, 0);
    unido.set(bloque, this.restos.length);
    const completados = [];
    let posicion = 0;
    while (posicion + this.largoTrama <= unido.length) {
      const trama = unido.slice(posicion, posicion + this.largoTrama);
      posicion += this.largoTrama;
      const segmento = this.procesarTrama(trama);
      if (segmento) completados.push(...segmento);
    }
    this.restos = unido.slice(posicion);
    return completados;
  }

  energia(trama) {
    let suma = 0;
    for (let i = 0; i < trama.length; i++) suma += trama[i] * trama[i];
    return Math.sqrt(suma / trama.length);
  }

  procesarTrama(trama) {
    const energia = this.energia(trama);
    const umbral = this.umbral();
    const hayVoz = energia > umbral;
    this.recientes.push(energia);
    if (this.recientes.length > this.ventanaRuido) this.recientes.shift();
    if (!this.enSegmento) {
      this.prerrollo.push(trama);
      if (this.prerrollo.length > this.tramasPrerrollo + this.tramasParaIniciar) this.prerrollo.shift();
      this.consecutivas = hayVoz ? this.consecutivas + 1 : 0;
      if (this.consecutivas >= this.tramasParaIniciar) {
        this.enSegmento = true;
        this.tramas = this.prerrollo.slice();
        this.energias = this.tramas.map((t) => this.energia(t));
        this.prerrollo = [];
        this.tramasSilencio = 0;
        this.tramasVoz = this.consecutivas;
        this.consecutivas = 0;
      }
      return null;
    }
    this.tramas.push(trama);
    this.energias.push(energia);
    if (hayVoz) {
      this.tramasSilencio = 0;
      this.tramasVoz++;
    } else {
      this.tramasSilencio++;
    }
    if (this.tramasSilencio >= this.tramasSilencioFin) return this.cerrar(false);
    if (this.tramas.length >= this.tramasMaximas) return this.cortarEnPausa();
    return null;
  }

  concatenar(tramas) {
    const salida = new Float32Array(tramas.length * this.largoTrama);
    tramas.forEach((t, i) => salida.set(t, i * this.largoTrama));
    return salida;
  }

  cerrar(conservarSilencio) {
    const recorte = conservarSilencio ? 0 : Math.max(0, this.tramasSilencio - Math.ceil(200 / this.tramaMs));
    const tramas = recorte ? this.tramas.slice(0, this.tramas.length - recorte) : this.tramas;
    const valido = this.tramasVoz >= this.tramasVozMinimas && tramas.length >= this.tramasMinimas;
    this.reiniciar();
    return valido ? [this.concatenar(tramas)] : null;
  }

  cortarEnPausa() {
    const ventana = Math.min(this.tramas.length - 1, Math.ceil(4000 / this.tramaMs));
    const inicio = this.tramas.length - ventana;
    let corte = this.tramas.length - 1;
    let minimo = Infinity;
    for (let i = inicio; i < this.tramas.length; i++) {
      if (this.energias[i] < minimo) {
        minimo = this.energias[i];
        corte = i;
      }
    }
    const primera = this.tramas.slice(0, corte + 1);
    const resto = this.tramas.slice(corte + 1);
    const restoEnergias = this.energias.slice(corte + 1);
    this.reiniciar();
    this.enSegmento = true;
    this.tramas = resto;
    this.energias = restoEnergias;
    this.tramasVoz = this.tramasVozMinimas;
    return primera.length >= this.tramasMinimas ? [this.concatenar(primera)] : null;
  }

  reiniciar() {
    this.enSegmento = false;
    this.tramas = [];
    this.energias = [];
    this.tramasSilencio = 0;
    this.tramasVoz = 0;
    this.consecutivas = 0;
    this.prerrollo = [];
  }

  vaciar() {
    if (this.restos.length) {
      const relleno = new Float32Array(this.largoTrama);
      relleno.set(this.restos);
      this.restos = new Float32Array(0);
      this.procesarTrama(relleno);
    }
    if (!this.enSegmento) return [];
    return this.cerrar(false) || [];
  }
}
