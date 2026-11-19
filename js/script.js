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
const HTML_VACIO = '<span class="marcador-vacio">' + TEXTO_VACIO + '</span>';

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
let history = JSON.parse(localStorage.getItem('mediVozHistory') || '[]');

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

    transcriptBox.innerHTML =
      (finalText ? '<span>' + escHTML(finalText) + '</span>' : '') +
      (interim ? '<span class="interim">' + escHTML(interim) + '</span>' : '');
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
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function startRecording() {
  if (recording) return;
  if (!SpeechRecognition) { showError('Tu navegador no soporta reconocimiento de voz. Usa Chrome o Edge.'); return; }
  hideError();
  recording = true;
  lastFinalPhrase = '';
  lastFinalTime = 0;
  secondsRecording = 0;
  document.getElementById('recordTimer').textContent = '⏱ 00:00';

  timerInterval = setInterval(() => {
    secondsRecording++;

    const min = String(Math.floor(secondsRecording / 60)).padStart(2, '0');
    const sec = String(secondsRecording % 60).padStart(2, '0');

    document.getElementById('recordTimer').textContent = `⏱ ${min}:${sec}`;
  }, 1000);
  const current = transcriptBox.innerText.trim();
  finalText = (current === TEXTO_VACIO ? '' : current + ' ');
  transcriptBox.innerHTML = finalText ? '<span>' + escHTML(finalText) + '</span>' : '';
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

  micBtn.classList.add('recording');
  micRing.classList.add('recording');
  wave.classList.add('show', 'rec');
  micStatus.textContent = 'Escuchando… hable ahora';
  micStatus.classList.add('active');
}

function stopRecording() {
  recording = false;
  clearInterval(timerInterval);
  clearInterval(stuckChecker);
  stuckChecker = null;
  timerInterval = null;
  if (recognition) { try { recognition.stop(); } catch (_) {} recognition = null; }
  micBtn.classList.remove('recording');
  micRing.classList.remove('recording');
  wave.classList.remove('show', 'rec');
  micStatus.textContent = 'Presiona el micrófono para dictar';
  micStatus.classList.remove('active');
  const text = transcriptBox.innerText.trim();
  if (text && text !== TEXTO_VACIO) transcriptBox.innerHTML = escHTML(text);
}

micBtn.addEventListener('click', () => { recording ? stopRecording() : startRecording(); });

document.getElementById('copyBtn').addEventListener('click', () => {
  const text = transcriptBox.innerText.trim();
  if (!text || text === TEXTO_VACIO) { showToast('No hay texto para copiar.'); return; }
  navigator.clipboard.writeText(text).then(() => showToast('✓ Texto copiado al portapapeles'));
});

document.getElementById('clearBtn').addEventListener('click', () => {
  if (recording) stopRecording();
  finalText = '';
  transcriptBox.innerHTML = HTML_VACIO;
  hideError();
});

document.getElementById('saveBtn').addEventListener('click', () => {
  const text = transcriptBox.innerText.trim();
  if (!text || text === TEXTO_VACIO) { showToast('Dicta o escribe algo primero.'); return; }
  const doctor = doctorSelect.value || 'Médico sin especificar';
  const patient = patientInput.value.trim() || 'Paciente sin nombre';
  const entry = { id: Date.now(), doctor, patient, text,
    time: new Date().toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' }) };
  history.unshift(entry);
  if (history.length > 20) history = history.slice(0, 20);
  localStorage.setItem('mediVozHistory', JSON.stringify(history));

  renderHistory();
  showToast('✓ Transcripción guardada');
  finalText = '';
  transcriptBox.innerHTML = HTML_VACIO;
  patientInput.value = '';
});

function renderHistory() {
  if (!history.length) { historyList.innerHTML = '<p class="no-history">Aún no hay transcripciones guardadas.</p>'; return; }
  historyList.innerHTML = history.map(e => `
    <div class="history-item">
      <div class="history-meta">
        <div class="hi-doctor">${escHTML(e.doctor)}</div>
        <div class="hi-patient">👤 ${escHTML(e.patient)}</div>
        <div class="hi-text">${escHTML(e.text)}</div>
        <div class="hi-time">🕐 ${e.time}</div>
      </div>
      <div class="hi-acciones">
        <button class="hi-copy" title="Copiar" onclick="copyEntry(${e.id})">📋</button>
        <button class="hi-copy" title="Imprimir" onclick="printEntry(${e.id})">🖨️</button>
        <button class="hi-copy" title="Exportar Word" onclick="exportEntryWord(${e.id})">📝</button>
        <button class="hi-copy" title="Editar" onclick="editEntry(${e.id})">✏️</button>
        <button class="hi-copy" title="Borrar" onclick="deleteEntry(${e.id})">🗑️</button>
      </div>
    </div>`).join('');
}

window.editEntry = function (id) {
  const entry = history.find(e => e.id === id);
  if (!entry) return;

  AdministradorMedicos.seleccionar(entry.doctor);
  patientInput.value = entry.patient;
  transcriptBox.innerHTML = escHTML(entry.text);

  history = history.filter(e => e.id !== id);
  localStorage.setItem('mediVozHistory', JSON.stringify(history));
  renderHistory();

  showToast('✏️ Transcripción cargada para editar');
};

window.deleteEntry = function (id) {
  if (!confirm('¿Borrar esta transcripción?')) return;

  history = history.filter(e => e.id !== id);
  localStorage.setItem('mediVozHistory', JSON.stringify(history));
  renderHistory();

  showToast('🗑️ Transcripción eliminada');
};

window.exportEntryWord = async function (id) {
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

  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "Transcripcion_MediVoz.docx";
  a.click();

  showToast("📝 Word descargado");
};

window.printEntry = function (id) {
  const entry = history.find(e => e.id === id);

  if (!entry) return;

  const ventana = window.open('', '_blank');

  ventana.document.write(`
    <html>
      <head>
        <title>Transcripción Médica</title>
      </head>
      <body style="font-family:Arial;padding:20px;">

        <h2>${entry.doctor}</h2>

        <p><strong>Paciente:</strong> ${entry.patient}</p>

        <p><strong>Fecha:</strong> ${entry.time}</p>

        <hr>

        <p style="white-space:pre-wrap;">
          ${entry.text}
        </p>

      </body>
    </html>
  `);

  ventana.document.close();
  ventana.print();
};

window.copyEntry = function (id) {
  const entry = history.find(e => e.id === id);
  if (!entry) return;
  const full = `Doctor: ${entry.doctor}\nPaciente: ${entry.patient}\nFecha: ${entry.time}\n\n${entry.text}`;
  navigator.clipboard.writeText(full).then(() => showToast('✓ Copiado'));
};

document.getElementById('clearHistoryBtn').addEventListener('click', () => {
  if (confirm('¿Borrar todas las transcripciones guardadas?')) {
    history = [];
    localStorage.removeItem('mediVozHistory');
    renderHistory();
    showToast('✓ Historial eliminado');
  }
});

document.getElementById('printHistoryBtn').addEventListener('click', () => {
  let contenido = '<h1>Historial MediVoz</h1><hr>';

  history.forEach(e => {
    contenido += `
      <h3>${e.doctor}</h3>
      <p><strong>Paciente:</strong> ${e.patient}</p>
      <p><strong>Fecha:</strong> ${e.time}</p>
      <p>${e.text}</p>
      <hr>
    `;
  });

  const ventana = window.open('', '_blank');

  ventana.document.write(`
    <html>
      <head>
        <title>Historial MediVoz</title>
      </head>
      <body>
        ${contenido}
      </body>
    </html>
  `);

  ventana.document.close();
  ventana.print();
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
