window.PanelSeguridad = (function () {
  const MINUTOS_INACTIVIDAD = 10;

  let interfaz;
  let elementos;
  let ultimoFoco = null;

  function porId(id) {
    return document.getElementById(id);
  }

  function mostrarMensaje(texto) {
    elementos.mensaje.textContent = texto;
  }

  function descripcionError(error) {
    const mensajes = {
      'contrasena-corta': 'La contraseña debe tener al menos ' + AlmacenSeguro.LARGO_MINIMO_CONTRASENA + ' caracteres.',
      'contrasena-incorrecta': 'Contraseña incorrecta.',
      'datos-danados': 'Los datos cifrados están dañados y no se pueden abrir.',
      'bloqueado': 'El historial está bloqueado.'
    };
    return mensajes[error && error.message] || 'No se pudo completar la operación.';
  }

  function alternar(elemento, visible) {
    elemento.hidden = !visible;
  }

  function limpiarCampos() {
    [elementos.contrasenaNueva, elementos.contrasenaRepetida, elementos.contrasenaDesbloqueo, elementos.contrasenaDesactivar]
      .forEach((campo) => { campo.value = ''; });
  }

  function actualizar() {
    if (!elementos) return;
    const estado = AlmacenSeguro.estado();
    let descripcion = 'Historial sin cifrar en este dispositivo.';
    if (estado.cifrado) descripcion = estado.bloqueado ? '🔒 Historial cifrado y bloqueado.' : '🔓 Historial cifrado y desbloqueado.';
    elementos.estado.textContent = descripcion;
    alternar(elementos.formularioCifrado, !estado.cifrado);
    alternar(elementos.formularioDesbloqueo, estado.cifrado && estado.bloqueado);
    alternar(elementos.seccionDesbloqueado, estado.cifrado && !estado.bloqueado);
    elementos.guardarEnDispositivo.checked = estado.guardarEnDispositivo;
    elementos.exportar.disabled = estado.bloqueado;
  }

  function abrir() {
    ultimoFoco = document.activeElement;
    mostrarMensaje('');
    limpiarCampos();
    actualizar();
    elementos.panel.hidden = false;
    elementos.cerrar.focus();
  }

  function cerrar() {
    limpiarCampos();
    elementos.panel.hidden = true;
    if (ultimoFoco && typeof ultimoFoco.focus === 'function') ultimoFoco.focus();
  }

  async function activarCifrado(evento) {
    evento.preventDefault();
    const nueva = elementos.contrasenaNueva.value;
    if (nueva !== elementos.contrasenaRepetida.value) {
      mostrarMensaje('Las contraseñas no coinciden.');
      return;
    }
    const confirmado = confirm(
      'Si olvida la contraseña, el historial cifrado NO se puede recuperar; solo se podrá borrar. ¿Activar el cifrado?'
    );
    if (!confirmado) return;
    elementos.activar.disabled = true;
    mostrarMensaje('Cifrando…');
    try {
      const lista = await AlmacenSeguro.activarCifrado(nueva, interfaz.obtenerHistorial());
      interfaz.reemplazarHistorial(lista);
      limpiarCampos();
      mostrarMensaje('');
      interfaz.avisar('🔐 Historial cifrado');
    } catch (error) {
      mostrarMensaje(descripcionError(error));
    } finally {
      elementos.activar.disabled = false;
      actualizar();
    }
  }

  async function desbloquear(evento) {
    evento.preventDefault();
    elementos.desbloquear.disabled = true;
    mostrarMensaje('Verificando…');
    try {
      const lista = await AlmacenSeguro.desbloquear(elementos.contrasenaDesbloqueo.value);
      interfaz.reemplazarHistorial(lista);
      limpiarCampos();
      mostrarMensaje('');
      interfaz.avisar('🔓 Historial desbloqueado');
    } catch (error) {
      mostrarMensaje(descripcionError(error));
    } finally {
      elementos.desbloquear.disabled = false;
      actualizar();
    }
  }

  function bloquearAhora() {
    AlmacenSeguro.bloquear();
    interfaz.reemplazarHistorial([]);
    actualizar();
    interfaz.avisar('🔒 Historial bloqueado');
  }

  async function desactivarCifrado(evento) {
    evento.preventDefault();
    elementos.desactivar.disabled = true;
    mostrarMensaje('Verificando…');
    try {
      const lista = await AlmacenSeguro.desactivarCifrado(elementos.contrasenaDesactivar.value);
      interfaz.reemplazarHistorial(lista);
      limpiarCampos();
      mostrarMensaje('');
      interfaz.avisar('Cifrado desactivado');
    } catch (error) {
      mostrarMensaje(descripcionError(error));
    } finally {
      elementos.desactivar.disabled = false;
      actualizar();
    }
  }

  function exportar() {
    if (AlmacenSeguro.estado().bloqueado) return;
    const confirmado = confirm('El archivo exportado NO estará cifrado y contendrá datos clínicos. ¿Exportar?');
    if (!confirmado) return;
    const contenido = AlmacenSeguro.exportarJson(interfaz.obtenerHistorial());
    interfaz.descargar(new Blob([contenido], { type: 'application/json' }), 'MediVoz_historial.json');
    interfaz.avisar('Copia exportada');
  }

  function cambiarGuardado() {
    AlmacenSeguro.establecerGuardadoEnDispositivo(elementos.guardarEnDispositivo.checked);
    interfaz.avisar(elementos.guardarEnDispositivo.checked
      ? 'Las nuevas transcripciones se guardarán en este dispositivo.'
      : 'Las nuevas transcripciones solo se conservarán durante esta sesión.');
  }

  function iniciar(opciones) {
    interfaz = opciones;
    elementos = {
      panel: porId('panelSeguridad'),
      cerrar: porId('cerrarSeguridadBtn'),
      estado: porId('estadoSeguridad'),
      mensaje: porId('mensajeSeguridad'),
      formularioCifrado: porId('formularioCifrado'),
      contrasenaNueva: porId('contrasenaNueva'),
      contrasenaRepetida: porId('contrasenaRepetida'),
      activar: porId('activarCifradoBtn'),
      formularioDesbloqueo: porId('formularioDesbloqueo'),
      contrasenaDesbloqueo: porId('contrasenaDesbloqueo'),
      desbloquear: porId('desbloquearBtn'),
      seccionDesbloqueado: porId('seccionDesbloqueado'),
      bloquear: porId('bloquearBtn'),
      formularioDesactivar: porId('formularioDesactivar'),
      contrasenaDesactivar: porId('contrasenaDesactivar'),
      desactivar: porId('desactivarCifradoBtn'),
      guardarEnDispositivo: porId('guardarEnDispositivo'),
      exportar: porId('exportarHistorialBtn')
    };
    porId('abrirSeguridadBtn').addEventListener('click', abrir);
    elementos.cerrar.addEventListener('click', cerrar);
    elementos.panel.addEventListener('click', (evento) => { if (evento.target === elementos.panel) cerrar(); });
    document.addEventListener('keydown', (evento) => {
      if (evento.key === 'Escape' && !elementos.panel.hidden) cerrar();
    });
    elementos.formularioCifrado.addEventListener('submit', activarCifrado);
    elementos.formularioDesbloqueo.addEventListener('submit', desbloquear);
    elementos.bloquear.addEventListener('click', bloquearAhora);
    elementos.formularioDesactivar.addEventListener('submit', desactivarCifrado);
    elementos.guardarEnDispositivo.addEventListener('change', cambiarGuardado);
    elementos.exportar.addEventListener('click', exportar);
    AlmacenSeguro.vigilarInactividad({
      minutos: MINUTOS_INACTIVIDAD,
      estaOcupado: interfaz.estaGrabando,
      alBloquear: () => {
        interfaz.reemplazarHistorial([]);
        actualizar();
        interfaz.avisar('🔒 Historial bloqueado por inactividad');
      }
    });
    actualizar();
  }

  return { iniciar, abrir, cerrar, actualizar };
})();
