(function () {
  const ETIQUETA_FIRMA = 'firma-medivoz';

  function crearTexto(clase, texto) {
    const elemento = document.createElement('span');
    elemento.className = clase;
    elemento.textContent = texto;
    return elemento;
  }

  class FirmaMediVoz extends HTMLElement {
    connectedCallback() {
      const { firma, version } = window.MEDIVOZ_CONFIG;
      this.replaceChildren(
        crearTexto('firma-medivoz__autor', firma),
        crearTexto('firma-medivoz__version', 'v' + version)
      );
    }
  }

  if (!customElements.get(ETIQUETA_FIRMA)) {
    customElements.define(ETIQUETA_FIRMA, FirmaMediVoz);
  }

  function asegurarFirmaUnica() {
    const firmas = document.querySelectorAll(ETIQUETA_FIRMA);
    if (!firmas.length) {
      document.body.appendChild(document.createElement(ETIQUETA_FIRMA));
      return;
    }
    for (let i = 1; i < firmas.length; i++) firmas[i].remove();
  }

  asegurarFirmaUnica();
  new MutationObserver(asegurarFirmaUnica).observe(document.body, { childList: true });
})();

const TEXTO_VACIO = 'El texto dictado aparecerá aquí…';

const micBtn = document.getElementById('micBtn');
const micRing = document.getElementById('micRing');
const micStatus = document.getElementById('micStatus');
const wave = document.getElementById('wave');
const transcriptBox = document.getElementById('transcriptBox');
const errorBanner = document.getElementById('errorBanner');
const historyList = document.getElementById('historyList');
const doctorSelect = document.getElementById('doctorSelect');
const patientInput = document.getElementById('patientInput');
const toast = document.getElementById('toast');

let recognition = null;
let recording = false;
let finalText = '';
let lastFinalPhrase = '';
let lastFinalTime = 0;
let timerInterval = null;
let secondsRecording = 0;
let lastTextTime = Date.now();
let stuckChecker = null;
let history = AlmacenSeguro.iniciar();

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

function setupRecognition() {
  if (!SpeechRecognition) return null;
  const r = new SpeechRecognition();
  r.lang = 'es-CL';
  r.continuous = true;
  r.interimResults = false;
  r.onresult = (e) => {
    let interim = '';

    for (let i = e.resultIndex; i < e.results.length; i++) {
      const frase = e.results[i][0].transcript.trim();

      if (e.results[i].isFinal) {
        const ahora = Date.now();

        const fraseRepetida = frase === lastFinalPhrase && (ahora - lastFinalTime) < 8000;
        const yaEstaAlFinal = finalText.trim().endsWith(frase);

        if (!fraseRepetida && !yaEstaAlFinal) {
          finalText += frase + ' ';
          lastFinalPhrase = frase;
          lastFinalTime = ahora;
        }
      } else {
        interim += frase + ' ';
      }
    }

    lastTextTime = Date.now();

    mostrarTexto(finalText, interim);
  };
  r.onerror = (e) => {
    let mensaje = '';

    switch (e.error) {
      case 'network':
        mensaje = 'Se perdió la conexión con el servicio de voz. Reintentando...';
        showError(mensaje);

        try {
          r.stop();
        } catch (err) {
          console.error(err);
        }

        return;

      case 'audio-capture':
        mensaje = 'No se detectó ningún micrófono disponible.';
        break;

      case 'not-allowed':
        mensaje = 'Permiso de micrófono denegado.';
        break;

      case 'no-speech':
        mensaje = 'No se detectó voz.';
        break;

      case 'aborted':
        mensaje = 'La grabación fue cancelada.';
        break;

      case 'service-not-allowed':
        mensaje = 'El servicio de reconocimiento de voz no está permitido.';
        break;

      default:
        mensaje = 'Error desconocido: ' + e.error;
    }

    console.error('SpeechRecognition Error:', e);
    showError(mensaje);

    stopRecording();
  };

  r.onstart = () => console.log('🎤 Inició grabación');

  r.onend = () => {
    console.log('🛑 Finalizó grabación');

    if (recording) {
      try {
        r.start();
      } catch (err) {
        console.error(err);
      }
    }
  };

  r.onspeechstart = () => console.log('🗣️ Detectó voz');
  r.onspeechend = () => console.log('🔇 Terminó voz');
  return r;
}

function escHTML(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function crearNodo(etiqueta, clase, texto) {
  const nodo = document.createElement(etiqueta);
  if (clase) nodo.className = clase;
  if (texto !== undefined) nodo.textContent = texto;
  return nodo;
}

function mostrarTexto(confirmado, provisional) {
  const nodos = [];
  if (confirmado) nodos.push(crearNodo('span', '', confirmado));
  if (provisional) nodos.push(crearNodo('span', 'interim', provisional));
  transcriptBox.replaceChildren(...nodos);
}

function mostrarMarcadorVacio() {
  transcriptBox.replaceChildren(crearNodo('span', 'marcador-vacio', TEXTO_VACIO));
}

transcriptBox.addEventListener('paste', (evento) => {
  evento.preventDefault();
  const texto = (evento.clipboardData || window.clipboardData).getData('text/plain');
  const seleccion = window.getSelection();
  if (!seleccion.rangeCount) return;
  const rango = seleccion.getRangeAt(0);
  rango.deleteContents();
  const nodo = document.createTextNode(texto);
  rango.insertNode(nodo);
  rango.setStartAfter(nodo);
  rango.collapse(true);
  seleccion.removeAllRanges();
  seleccion.addRange(rango);
});

const motorVoz = document.getElementById('motorVoz');
const avisoMotor = document.getElementById('avisoMotor');
const CLAVE_MOTOR = 'mediVozMotor';
const AVISO_NAVEGADOR = 'Motor del navegador: puede enviar el audio a servicios externos (por ejemplo, los de Google en Chrome).';
const AVISO_LOCAL = 'IA local: el audio se procesa solo en este dispositivo y no se envía a ningún servidor. La primera vez descarga unos 135 MB y usa cerca de 1 GB de memoria mientras se usa.';
let reconocedorLocal = null;
let usandoLocal = false;
let esperandoTranscripcionLocal = false;
let descartandoLocal = false;

const MOTOR_NAVEGADOR_CONSENTIDO = 'navegador-consentido';
const consentimientoNavegador = document.getElementById('consentimientoNavegador');
let navegadorConsentido = false;

function leerMotorGuardado() {
  try {
    return localStorage.getItem(CLAVE_MOTOR) === MOTOR_NAVEGADOR_CONSENTIDO ? 'navegador' : 'local';
  } catch (error) {
    return 'local';
  }
}

function guardarMotor(valor) {
  try {
    localStorage.setItem(CLAVE_MOTOR, valor);
  } catch (error) {
    showError('No se pudo recordar la elección del motor de voz.');
  }
}

function actualizarAvisoMotor() {
  avisoMotor.textContent = motorVoz.value === 'local' ? AVISO_LOCAL : AVISO_NAVEGADOR;
  consentimientoNavegador.hidden = motorVoz.value !== 'navegador' || navegadorConsentido;
}

motorVoz.value = leerMotorGuardado();
navegadorConsentido = motorVoz.value === 'navegador';
actualizarAvisoMotor();
motorVoz.addEventListener('change', () => {
  if (recording) stopRecording();
  navegadorConsentido = false;
  guardarMotor('local');
  actualizarAvisoMotor();
  if (motorVoz.value === 'local' && navigator.deviceMemory && navigator.deviceMemory < 4) {
    showToast('Este dispositivo tiene poca memoria: la IA local podría ir lenta o cerrarse. Puedes cambiar manualmente al motor del navegador.');
  }
});
document.getElementById('aceptarMotorNavegador').addEventListener('click', () => {
  navegadorConsentido = true;
  guardarMotor(MOTOR_NAVEGADOR_CONSENTIDO);
  actualizarAvisoMotor();
});
document.getElementById('volverIaLocal').addEventListener('click', () => {
  motorVoz.value = 'local';
  navegadorConsentido = false;
  guardarMotor('local');
  actualizarAvisoMotor();
});

function iniciarTemporizador() {
  secondsRecording = 0;
  document.getElementById('recordTimer').textContent = '⏱ 00:00';
  timerInterval = setInterval(() => {
    secondsRecording++;

    const min = String(Math.floor(secondsRecording / 60)).padStart(2, '0');
    const sec = String(secondsRecording % 60).padStart(2, '0');

    document.getElementById('recordTimer').textContent = `⏱ ${min}:${sec}`;
  }, 1000);
}

function prepararTextoInicial() {
  const current = transcriptBox.innerText.trim();
  finalText = (current === TEXTO_VACIO ? '' : current + ' ');
  mostrarTexto(finalText, '');
}

function marcarGrabando() {
  micBtn.classList.add('recording');
  micRing.classList.add('recording');
  wave.classList.add('show', 'rec');
  micStatus.textContent = 'Escuchando… hable ahora';
  micStatus.classList.add('active');
}

function finalizarTexto() {
  const text = transcriptBox.innerText.trim();
  if (text && text !== TEXTO_VACIO) {
    transcriptBox.textContent = text;
    PanelDiccionario.revisar();
  }
}

function mensajeErrorLocal(error, modulo) {
  if (error && error.name === 'NotAllowedError') return 'Permiso de micrófono denegado.';
  if (error && error.name === 'NotFoundError') return 'No se detectó ningún micrófono disponible.';
  return modulo ? modulo.mensajeDeError(error && error.message) : 'No se pudo iniciar la IA local.';
}

async function iniciarGrabacionLocal() {
  hideError();
  descartandoLocal = false;
  micBtn.disabled = true;
  micStatus.textContent = 'Preparando la IA local…';
  let modulo = null;
  try {
    modulo = await import('./ia/reconocedor-local.js');
    if (!reconocedorLocal) {
      reconocedorLocal = new modulo.ReconocedorLocal({
        alTexto: (texto) => {
          finalText += texto + ' ';
          mostrarTexto(finalText, '');
          lastTextTime = Date.now();
        },
        alEstado: (estado, pendientes) => {
          if (estado === 'pendientes' && !descartandoLocal) mostrarTexto(finalText, pendientes > 0 ? '…' : '');
        },
        alError: (mensaje) => showError(mensaje)
      });
    }
    await reconocedorLocal.preparar((fraccion) => {
      micStatus.textContent = 'Descargando el modelo… ' + Math.round(fraccion * 100) + '%';
    });
    prepararTextoInicial();
    await reconocedorLocal.iniciar();
    recording = true;
    usandoLocal = true;
    iniciarTemporizador();
    marcarGrabando();
  } catch (error) {
    showError(mensajeErrorLocal(error, modulo));
    micStatus.textContent = 'Presiona el micrófono para dictar';
  } finally {
    micBtn.disabled = false;
  }
}

function startRecording() {
  if (recording || micBtn.disabled) return;
  if (motorVoz.value === 'local') { iniciarGrabacionLocal(); return; }
  if (!navegadorConsentido) { showError('Para usar el motor del navegador, acepta primero el aviso de privacidad o vuelve a la IA local.'); return; }
  if (!SpeechRecognition) { showError('Tu navegador no soporta reconocimiento de voz. Usa Chrome o Edge.'); return; }
  hideError();
  recording = true;
  lastFinalPhrase = '';
  lastFinalTime = 0;
  iniciarTemporizador();
  prepararTextoInicial();
  recognition = setupRecognition();
  recognition.start();
  lastTextTime = Date.now();

  stuckChecker = setInterval(() => {
    if (!recording || !recognition) return;

    const segundosSinTexto = (Date.now() - lastTextTime) / 1000;

    if (segundosSinTexto > 60 && finalText.length > 0) {
      console.log('🔄 Micrófono pegado. Reiniciando...');
      showError('🔄 Micrófono sin respuesta. Reconectando...');

      try {
        recognition.stop();
      } catch (err) {
        console.error(err);
      }

      lastTextTime = Date.now();
    }
  }, 5000);

  marcarGrabando();
}

function stopRecording() {
  const eraLocal = usandoLocal;
  usandoLocal = false;
  recording = false;
  clearInterval(timerInterval);
  clearInterval(stuckChecker);
  stuckChecker = null;
  timerInterval = null;
  if (recognition) { try { recognition.stop(); } catch (_) {} recognition = null; }
  micBtn.classList.remove('recording');
  micRing.classList.remove('recording');
  wave.classList.remove('show', 'rec');
  micStatus.classList.remove('active');
  if (eraLocal && reconocedorLocal) {
    esperandoTranscripcionLocal = true;
    micStatus.textContent = 'Terminando la transcripción…';
    reconocedorLocal.detener().catch(() => showError('La IA local tuvo un problema y se detuvo.')).then(() => {
      esperandoTranscripcionLocal = false;
      micStatus.textContent = 'Presiona el micrófono para dictar';
      finalizarTexto();
    });
    return;
  }
  micStatus.textContent = 'Presiona el micrófono para dictar';
  finalizarTexto();
}

micBtn.addEventListener('click', () => { recording ? stopRecording() : startRecording(); });

document.getElementById('copyBtn').addEventListener('click', () => {
  const text = transcriptBox.innerText.trim();
  if (!text || text === TEXTO_VACIO) { showToast('No hay texto para copiar.'); return; }
  navigator.clipboard.writeText(text).then(() => showToast('✓ Texto copiado al portapapeles'));
});

document.getElementById('clearBtn').addEventListener('click', () => {
  PanelDiccionario.limpiar();
  if (recording) stopRecording();
  if (reconocedorLocal) {
    descartandoLocal = true;
    reconocedorLocal.descartarPendientes();
  }
  finalText = '';
  mostrarMarcadorVacio();
  hideError();
});

function persistirHistorial() {
  return AlmacenSeguro.guardarHistorial(history).catch(() => {
    showError('No se pudo guardar el historial en este navegador.');
  });
}

function historialBloqueado() {
  return AlmacenSeguro.estado().bloqueado;
}

document.getElementById('saveBtn').addEventListener('click', () => {
  const text = transcriptBox.innerText.trim();
  if (!text || text === TEXTO_VACIO) { showToast('Dicta o escribe algo primero.'); return; }
  if (esperandoTranscripcionLocal) { showToast('Espera a que termine la transcripción.'); return; }
  if (historialBloqueado()) { showToast('🔒 Desbloquea el historial para guardar.'); PanelSeguridad.abrir(); return; }
  const doctor = doctorSelect.value || 'Médico sin especificar';
  const patient = patientInput.value.trim() || 'Paciente sin nombre';
  const entry = { id: Date.now(), doctor, patient, text,
    time: new Date().toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' }) };
  history.unshift(entry);
  if (history.length > 20) history = history.slice(0, 20);
  persistirHistorial();

  renderHistory();
  showToast(AlmacenSeguro.estado().guardarEnDispositivo ? '✓ Transcripción guardada' : '✓ Guardada solo en esta sesión');
  finalText = '';
  mostrarMarcadorVacio();
  PanelDiccionario.limpiar();
  patientInput.value = '';
});

const ACCIONES_HISTORIAL = [
  { accion: 'copiar', titulo: 'Copiar', icono: '📋' },
  { accion: 'imprimir', titulo: 'Imprimir', icono: '🖨️' },
  { accion: 'word', titulo: 'Exportar Word', icono: '📝' },
  { accion: 'editar', titulo: 'Editar', icono: '✏️' },
  { accion: 'borrar', titulo: 'Borrar', icono: '🗑️' }
];

function crearRegistroHistorial(e) {
  const meta = crearNodo('div', 'history-meta');
  meta.append(
    crearNodo('div', 'hi-doctor', e.doctor),
    crearNodo('div', 'hi-patient', '👤 ' + e.patient),
    crearNodo('div', 'hi-text', e.text),
    crearNodo('div', 'hi-time', '🕐 ' + e.time)
  );
  const acciones = crearNodo('div', 'hi-acciones');
  ACCIONES_HISTORIAL.forEach(({ accion, titulo, icono }) => {
    const boton = crearNodo('button', 'hi-copy', icono);
    boton.type = 'button';
    boton.title = titulo;
    boton.dataset.accion = accion;
    boton.dataset.id = String(e.id);
    acciones.appendChild(boton);
  });
  const registro = crearNodo('div', 'history-item');
  registro.append(meta, acciones);
  return registro;
}

function renderHistory() {
  if (historialBloqueado()) {
    const bloqueo = crearNodo('div', 'historial-bloqueado');
    const abrir = crearNodo('button', 'btn-sm primary', '🔓 Desbloquear');
    abrir.type = 'button';
    abrir.addEventListener('click', () => PanelSeguridad.abrir());
    bloqueo.append(crearNodo('p', 'no-history', '🔒 El historial está cifrado y bloqueado.'), abrir);
    historyList.replaceChildren(bloqueo);
    return;
  }
  if (!history.length) {
    historyList.replaceChildren(crearNodo('p', 'no-history', 'Aún no hay transcripciones guardadas.'));
    return;
  }
  historyList.replaceChildren(...history.map(crearRegistroHistorial));
}

historyList.addEventListener('click', (evento) => {
  const boton = evento.target.closest('button[data-accion]');
  if (!boton) return;
  const id = Number(boton.dataset.id);
  const accion = boton.dataset.accion;
  if (accion === 'copiar') copyEntry(id);
  else if (accion === 'imprimir') printEntry(id);
  else if (accion === 'word') exportEntryWord(id);
  else if (accion === 'editar') editEntry(id);
  else if (accion === 'borrar') deleteEntry(id);
});

function editEntry(id) {
  const entry = history.find(e => e.id === id);
  if (!entry) return;

  AdministradorMedicos.seleccionar(entry.doctor);
  patientInput.value = entry.patient;
  transcriptBox.textContent = entry.text;

  history = history.filter(e => e.id !== id);
  persistirHistorial();
  renderHistory();

  showToast('✏️ Transcripción cargada para editar');
}

function deleteEntry(id) {
  if (!confirm('¿Borrar esta transcripción?')) return;

  history = history.filter(e => e.id !== id);
  persistirHistorial();
  renderHistory();

  showToast('🗑️ Transcripción eliminada');
}

async function exportEntryWord(id) {
  const entry = history.find(e => e.id === id);
  if (!entry) return;

  const { Document, Packer, Paragraph, TextRun } = docx;

  const doc = new Document({
    sections: [{
      children: [
        new Paragraph({
          children: [
            new TextRun({
              text: "MediVoz - Transcripción Médica",
              bold: true,
              size: 32
            })
          ]
        }),
        new Paragraph(""),
        new Paragraph("Doctor: " + entry.doctor),
        new Paragraph("Paciente: " + entry.patient),
        new Paragraph("Fecha: " + entry.time),
        new Paragraph(""),
        new Paragraph({
          children: [
            new TextRun({
              text: entry.text,
              size: 24
            })
          ]
        }),
        new Paragraph(""),
        new Paragraph({
          children: [
            new TextRun({
              text: "by Chiguin",
              italics: true,
              size: 20
            })
          ]
        })
      ]
    }]
  });

  const blob = await Packer.toBlob(doc);
  descargarBlob(blob, 'Transcripcion_MediVoz.docx');

  showToast("📝 Word descargado");
}

function descargarBlob(blob, nombre) {
  const a = document.createElement("a");
  const direccion = URL.createObjectURL(blob);
  a.href = direccion;
  a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(direccion), 10000);
}

function abrirVentanaImpresion(titulo, cuerpo) {
  const ventana = window.open('', '_blank');
  if (!ventana) { showToast('El navegador bloqueó la ventana de impresión.'); return; }
  const hoja = new URL('css/impresion.css', window.location.href).href;
  ventana.document.write(
    '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">' +
    '<title>' + escHTML(titulo) + '</title>' +
    '<link rel="stylesheet" href="' + escHTML(hoja) + '"></head><body>' + cuerpo + '</body></html>'
  );
  ventana.onload = () => ventana.print();
  ventana.document.close();
}

function printEntry(id) {
  const entry = history.find(e => e.id === id);
  if (!entry) return;

  abrirVentanaImpresion('Transcripción Médica',
    '<h2>' + escHTML(entry.doctor) + '</h2>' +
    '<p><strong>Paciente:</strong> ' + escHTML(entry.patient) + '</p>' +
    '<p><strong>Fecha:</strong> ' + escHTML(entry.time) + '</p>' +
    '<hr>' +
    '<p class="texto-transcripcion">' + escHTML(entry.text) + '</p>');
}

function copyEntry(id) {
  const entry = history.find(e => e.id === id);
  if (!entry) return;
  const full = `Doctor: ${entry.doctor}\nPaciente: ${entry.patient}\nFecha: ${entry.time}\n\n${entry.text}`;
  navigator.clipboard.writeText(full).then(() => showToast('✓ Copiado'));
}

document.getElementById('clearHistoryBtn').addEventListener('click', () => {
  const bloqueado = historialBloqueado();
  const mensaje = bloqueado
    ? 'El historial está cifrado y bloqueado. Si continúa se borrará por completo y el cifrado quedará desactivado. ¿Continuar?'
    : '¿Borrar todas las transcripciones guardadas?';
  if (confirm(mensaje)) {
    history = [];
    AlmacenSeguro.eliminarTodo();
    renderHistory();
    PanelSeguridad.actualizar();
    showToast('✓ Historial eliminado');
  }
});

document.getElementById('printHistoryBtn').addEventListener('click', () => {
  if (historialBloqueado()) { showToast('🔒 Desbloquea el historial para imprimir.'); PanelSeguridad.abrir(); return; }
  let contenido = '<h1>Historial MediVoz</h1><hr>';

  history.forEach(e => {
    contenido +=
      '<h3>' + escHTML(e.doctor) + '</h3>' +
      '<p><strong>Paciente:</strong> ' + escHTML(e.patient) + '</p>' +
      '<p><strong>Fecha:</strong> ' + escHTML(e.time) + '</p>' +
      '<p class="texto-transcripcion">' + escHTML(e.text) + '</p>' +
      '<hr>';
  });

  abrirVentanaImpresion('Historial MediVoz', contenido);
});

PanelDiccionario.iniciar({
  obtenerTexto: () => {
    const texto = transcriptBox.innerText.trim();
    return texto === TEXTO_VACIO ? '' : texto;
  },
  reemplazarTexto: (texto) => {
    transcriptBox.textContent = texto;
    finalText = texto + ' ';
  }
});

PanelSeguridad.iniciar({
  obtenerHistorial: () => history,
  reemplazarHistorial: (lista) => { history = lista; renderHistory(); },
  estaGrabando: () => recording,
  descargar: descargarBlob,
  avisar: (mensaje) => showToast(mensaje)
});

AdministradorMedicos.iniciar({ avisar: showToast });
renderHistory();

let toastTimer;
function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2800);
}
function showError(msg) { errorBanner.textContent = '⚠ ' + msg; errorBanner.classList.add('show'); }
function hideError() { errorBanner.classList.remove('show'); }
