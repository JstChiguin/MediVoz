import { SegmentadorVoz } from './segmentador.js';

const FRECUENCIA_MODELO = 16000;
const BASE_MODELO = new URL('../../modelos/conformer-es/', import.meta.url).href;
const RUTA_TRABAJADOR = new URL('./trabajador.js', import.meta.url).href;
const RUTA_CAPTURA = new URL('./captura-worklet.js', import.meta.url).href;
const MINUTOS_INACTIVIDAD_MODELO = 10;

async function remuestrear(muestras, frecuenciaOrigen) {
  if (frecuenciaOrigen === FRECUENCIA_MODELO) return muestras;
  const largo = Math.ceil((muestras.length * FRECUENCIA_MODELO) / frecuenciaOrigen);
  const contexto = new OfflineAudioContext(1, largo, FRECUENCIA_MODELO);
  const buffer = contexto.createBuffer(1, muestras.length, frecuenciaOrigen);
  buffer.copyToChannel(muestras, 0);
  const fuente = contexto.createBufferSource();
  fuente.buffer = buffer;
  fuente.connect(contexto.destination);
  fuente.start();
  const resultado = await contexto.startRendering();
  return resultado.getChannelData(0).slice();
}

export function mensajeDeError(codigo) {
  const mensajes = {
    'descarga-fallida': 'No se pudo descargar el modelo de IA. Revisa la conexión e inténtalo de nuevo.',
    'integridad-invalida': 'El modelo descargado no coincide con la huella esperada y fue descartado.',
    'manifiesto-no-disponible': 'El modelo de IA no está disponible en este sitio.',
    'tamano-invalido': 'El modelo descargado está incompleto.'
  };
  return mensajes[codigo] || 'La IA local tuvo un problema y se detuvo.';
}

export class ReconocedorLocal {
  constructor({ alTexto, alEstado, alError }) {
    this.alTexto = alTexto;
    this.alEstado = alEstado;
    this.alError = alError;
    this.trabajador = null;
    this.listo = false;
    this.preparando = null;
    this.contexto = null;
    this.flujo = null;
    this.nodo = null;
    this.segmentador = null;
    this.pendientes = new Map();
    this.siguienteIdentificador = 0;
    this.siguienteEntrega = 0;
    this.recibidos = new Map();
    this.temporizadorInactividad = null;
    this.grabando = false;
    this.ignorarHasta = 0;
  }

  crearTrabajador() {
    this.trabajador = new Worker(RUTA_TRABAJADOR, { type: 'module' });
    this.trabajador.onmessage = (evento) => this.recibir(evento.data);
    this.trabajador.onerror = () => this.alError('La IA local tuvo un problema y se detuvo.');
  }

  recibir(mensaje) {
    if (mensaje.tipo === 'progreso' && this.alProgreso) this.alProgreso(mensaje.fraccion);
    else if (mensaje.tipo === 'listo') {
      this.listo = true;
      if (this.resolverPreparacion) this.resolverPreparacion();
    } else if (mensaje.tipo === 'texto') {
      this.recibidos.set(mensaje.identificador, String(mensaje.texto || ''));
      this.entregarEnOrden();
    } else if (mensaje.tipo === 'liberado') {
      this.listo = false;
    } else if (mensaje.tipo === 'error') {
      if (this.rechazarPreparacion) this.rechazarPreparacion(new Error(mensaje.codigo));
      else this.alError(mensajeDeError(mensaje.codigo));
      if (mensaje.identificador !== undefined) {
        this.recibidos.set(mensaje.identificador, '');
        this.entregarEnOrden();
      }
    }
  }

  entregarEnOrden() {
    while (this.recibidos.has(this.siguienteEntrega)) {
      const identificador = this.siguienteEntrega;
      const texto = this.recibidos.get(identificador);
      this.recibidos.delete(identificador);
      this.siguienteEntrega++;
      if (texto && identificador >= this.ignorarHasta) this.alTexto(texto);
    }
    this.alEstado('pendientes', this.siguienteIdentificador - this.siguienteEntrega);
    if (this.siguienteEntrega === this.siguienteIdentificador && this.resolverVaciado) {
      this.resolverVaciado();
      this.resolverVaciado = null;
    }
  }

  async preparar(alProgreso) {
    clearTimeout(this.temporizadorInactividad);
    if (this.listo) return;
    if (this.preparando) return this.preparando;
    this.alProgreso = alProgreso;
    if (!this.trabajador) this.crearTrabajador();
    this.preparando = new Promise((resolver, rechazar) => {
      this.resolverPreparacion = resolver;
      this.rechazarPreparacion = rechazar;
    });
    this.trabajador.postMessage({ tipo: 'preparar', base: BASE_MODELO });
    try {
      await this.preparando;
    } catch (error) {
      this.descartarTrabajador();
      throw error;
    } finally {
      this.preparando = null;
      this.resolverPreparacion = null;
      this.rechazarPreparacion = null;
    }
  }

  async iniciar() {
    await this.preparar();
    this.flujo = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: false, noiseSuppression: true, autoGainControl: true }
    });
    this.contexto = new AudioContext();
    if (this.contexto.state === 'suspended') await this.contexto.resume();
    await this.contexto.audioWorklet.addModule(RUTA_CAPTURA);
    const fuente = this.contexto.createMediaStreamSource(this.flujo);
    this.nodo = new AudioWorkletNode(this.contexto, 'captura-medivoz', { numberOfOutputs: 0 });
    this.segmentador = new SegmentadorVoz({ frecuencia: this.contexto.sampleRate });
    this.nodo.port.onmessage = (evento) => {
      if (!this.grabando) return;
      this.segmentador.procesar(evento.data).forEach((segmento) => this.enviarSegmento(segmento));
    };
    fuente.connect(this.nodo);
    this.grabando = true;
    this.alEstado('escuchando');
  }

  async enviarSegmento(segmento) {
    const identificador = this.siguienteIdentificador++;
    this.alEstado('pendientes', this.siguienteIdentificador - this.siguienteEntrega);
    const muestras = await remuestrear(segmento, this.contexto ? this.contexto.sampleRate : FRECUENCIA_MODELO);
    this.trabajador.postMessage({ tipo: 'transcribir', identificador, muestras }, [muestras.buffer]);
  }

  descartarPendientes() {
    this.ignorarHasta = this.siguienteIdentificador;
  }

  async detener() {
    if (!this.grabando) return;
    this.grabando = false;
    const finales = this.segmentador ? this.segmentador.vaciar() : [];
    finales.forEach((segmento) => this.enviarSegmento(segmento));
    this.liberarCaptura();
    if (this.siguienteEntrega < this.siguienteIdentificador) {
      await new Promise((resolver) => { this.resolverVaciado = resolver; });
    }
    this.alEstado('inactivo');
    this.programarLiberacion();
  }

  liberarCaptura() {
    if (this.nodo) {
      this.nodo.port.onmessage = null;
      this.nodo.disconnect();
    }
    if (this.flujo) this.flujo.getTracks().forEach((pista) => pista.stop());
    if (this.contexto) this.contexto.close().catch(() => {});
    this.nodo = null;
    this.flujo = null;
    this.contexto = null;
    this.segmentador = null;
  }

  programarLiberacion() {
    clearTimeout(this.temporizadorInactividad);
    this.temporizadorInactividad = setTimeout(() => this.descargarModelo(), MINUTOS_INACTIVIDAD_MODELO * 60000);
  }

  descartarTrabajador() {
    if (this.trabajador) this.trabajador.terminate();
    this.trabajador = null;
    this.listo = false;
  }

  descargarModelo() {
    clearTimeout(this.temporizadorInactividad);
    if (this.grabando) return;
    this.descartarTrabajador();
  }

  estaListo() {
    return this.listo;
  }
}
