window.AdministradorMedicos = (function () {
  const CLAVE_MEDICOS = 'mediVozMedicos';
  const CLAVE_HISTORIAL = 'mediVozHistory';
  const SIN_ESPECIFICAR = 'Médico sin especificar';

  let medicos = [];
  let nombreEnEdicion = null;
  let nombreTemporal = null;
  let avisar = () => {};

  let selector;
  let aviso;
  let botonAdministrar;
  let panel;
  let formulario;
  let campoNombre;
  let mensajeError;
  let lista;

  function comparar(a, b) {
    return a.localeCompare(b, 'es', { sensitivity: 'base' });
  }

  function normalizar(nombre) {
    return String(nombre).replace(/\s+/g, ' ').trim();
  }

  function sinDuplicados(nombres) {
    const resultado = [];
    nombres.forEach((nombre) => {
      if (nombre && !resultado.some((existente) => comparar(existente, nombre) === 0)) resultado.push(nombre);
    });
    return resultado;
  }

  function ordenar(nombres) {
    return [...nombres].sort(comparar);
  }

  function leerArreglo(clave) {
    try {
      const valor = JSON.parse(localStorage.getItem(clave));
      return Array.isArray(valor) ? valor : null;
    } catch (error) {
      return null;
    }
  }

  function guardar() {
    try {
      localStorage.setItem(CLAVE_MEDICOS, JSON.stringify(medicos));
      return true;
    } catch (error) {
      mostrarError('No se pudo guardar la lista en este navegador.');
      return false;
    }
  }

  function cargar() {
    const guardada = leerArreglo(CLAVE_MEDICOS);
    if (guardada) {
      return ordenar(sinDuplicados(guardada.filter((n) => typeof n === 'string').map(normalizar)));
    }
    const historial = leerArreglo(CLAVE_HISTORIAL) || [];
    const derivados = historial
      .map((registro) => (registro && typeof registro.doctor === 'string' ? normalizar(registro.doctor) : ''))
      .filter((nombre) => nombre && nombre !== SIN_ESPECIFICAR);
    return ordenar(sinDuplicados(derivados));
  }

  function crearElemento(etiqueta, clase, texto) {
    const elemento = document.createElement(etiqueta);
    if (clase) elemento.className = clase;
    if (texto !== undefined) elemento.textContent = texto;
    return elemento;
  }

  function crearBoton(texto, clase, titulo, alPulsar) {
    const boton = crearElemento('button', clase, texto);
    boton.type = 'button';
    boton.title = titulo;
    boton.setAttribute('aria-label', titulo);
    boton.addEventListener('click', alPulsar);
    return boton;
  }

  function crearOpcion(valor, texto) {
    const opcion = document.createElement('option');
    opcion.value = valor;
    opcion.textContent = texto;
    return opcion;
  }

  function renderizarSelector(deseado) {
    const seleccionado = deseado === undefined ? selector.value : deseado;
    selector.replaceChildren(
      crearOpcion('', medicos.length ? '— Seleccionar médico —' : '— Sin médicos registrados —')
    );
    medicos.forEach((nombre) => selector.appendChild(crearOpcion(nombre, nombre)));
    const esTemporal = nombreTemporal && seleccionado === nombreTemporal && !medicos.includes(nombreTemporal);
    if (esTemporal) selector.appendChild(crearOpcion(nombreTemporal, nombreTemporal));
    else nombreTemporal = null;
    selector.value = seleccionado;
    if (selector.value !== seleccionado) selector.value = '';
    aviso.hidden = medicos.length > 0;
  }

  function mostrarError(texto) {
    mensajeError.textContent = texto;
  }

  function validar(nombre, original) {
    if (!nombre) return 'El nombre no puede estar vacío.';
    const repetido = medicos.some((existente) => existente !== original && comparar(existente, nombre) === 0);
    return repetido ? 'Ese médico ya está registrado.' : '';
  }

  function agregar(nombreCrudo) {
    const nombre = normalizar(nombreCrudo);
    const error = validar(nombre, null);
    if (error) { mostrarError(error); return false; }
    medicos = ordenar([...medicos, nombre]);
    if (!guardar()) return false;
    mostrarError('');
    renderizarSelector();
    renderizarLista();
    avisar('✓ Médico agregado');
    return true;
  }

  function renombrar(original, nombreCrudo) {
    const nombre = normalizar(nombreCrudo);
    if (nombre === original) { cancelarEdicion(); return; }
    const error = validar(nombre, original);
    if (error) { mostrarError(error); return; }
    medicos = ordenar(medicos.map((existente) => (existente === original ? nombre : existente)));
    if (!guardar()) return;
    const seleccion = selector.value === original ? nombre : selector.value;
    nombreEnEdicion = null;
    mostrarError('');
    renderizarSelector(seleccion);
    renderizarLista();
    avisar('✓ Nombre actualizado');
  }

  function eliminar(nombre) {
    const mensaje = `¿Eliminar a "${nombre}" de la lista de médicos? Los registros guardados conservarán su nombre.`;
    if (!confirm(mensaje)) return;
    medicos = medicos.filter((existente) => existente !== nombre);
    if (!guardar()) return;
    const seleccion = selector.value === nombre ? '' : selector.value;
    if (nombreEnEdicion === nombre) nombreEnEdicion = null;
    mostrarError('');
    renderizarSelector(seleccion);
    renderizarLista();
    avisar('🗑️ Médico eliminado de la lista');
  }

  function iniciarEdicion(nombre) {
    nombreEnEdicion = nombre;
    mostrarError('');
    renderizarLista();
    const campo = lista.querySelector('input');
    if (campo) { campo.focus(); campo.select(); }
  }

  function cancelarEdicion() {
    nombreEnEdicion = null;
    mostrarError('');
    renderizarLista();
  }

  function crearFilaNormal(nombre) {
    const fila = crearElemento('li', 'medicos-item');
    fila.appendChild(crearElemento('span', 'medicos-nombre', nombre));
    const acciones = crearElemento('div', 'medicos-acciones');
    acciones.appendChild(crearBoton('✏️', 'hi-copy', 'Editar ' + nombre, () => iniciarEdicion(nombre)));
    acciones.appendChild(crearBoton('🗑️', 'hi-copy', 'Eliminar ' + nombre, () => eliminar(nombre)));
    fila.appendChild(acciones);
    return fila;
  }

  function crearFilaEdicion(nombre) {
    const fila = crearElemento('li', 'medicos-item editando');
    const campo = document.createElement('input');
    campo.type = 'text';
    campo.value = nombre;
    campo.maxLength = 120;
    campo.className = 'medicos-campo-edicion';
    campo.setAttribute('aria-label', 'Nuevo nombre para ' + nombre);
    campo.addEventListener('keydown', (evento) => {
      if (evento.key === 'Enter') { evento.preventDefault(); renombrar(nombre, campo.value); }
      if (evento.key === 'Escape') { evento.stopPropagation(); cancelarEdicion(); }
    });
    const acciones = crearElemento('div', 'medicos-acciones');
    acciones.appendChild(crearBoton('💾', 'hi-copy', 'Guardar nombre', () => renombrar(nombre, campo.value)));
    acciones.appendChild(crearBoton('✖', 'hi-copy', 'Cancelar edición', cancelarEdicion));
    fila.appendChild(campo);
    fila.appendChild(acciones);
    return fila;
  }

  function renderizarLista() {
    lista.replaceChildren();
    if (!medicos.length) {
      lista.appendChild(crearElemento('li', 'medicos-vacio', 'Aún no hay médicos registrados. Agrega el primero con el campo de arriba.'));
      return;
    }
    medicos.forEach((nombre) => {
      lista.appendChild(nombre === nombreEnEdicion ? crearFilaEdicion(nombre) : crearFilaNormal(nombre));
    });
  }

  function abrirPanel() {
    nombreEnEdicion = null;
    mostrarError('');
    renderizarLista();
    panel.hidden = false;
    campoNombre.focus();
  }

  function cerrarPanel() {
    panel.hidden = true;
    nombreEnEdicion = null;
    botonAdministrar.focus();
  }

  function seleccionar(nombre) {
    if (!nombre || nombre === SIN_ESPECIFICAR) {
      selector.value = '';
      return;
    }
    nombreTemporal = medicos.includes(nombre) ? null : nombre;
    renderizarSelector(nombre);
  }

  function iniciar(opciones) {
    avisar = opciones.avisar;
    selector = document.getElementById('doctorSelect');
    aviso = document.getElementById('avisoMedicos');
    botonAdministrar = document.getElementById('manageDoctorsBtn');
    panel = document.getElementById('panelMedicos');
    formulario = document.getElementById('formularioMedico');
    campoNombre = document.getElementById('nombreMedicoInput');
    mensajeError = document.getElementById('errorMedicos');
    lista = document.getElementById('listaMedicos');

    medicos = cargar();
    if (medicos.length && !leerArreglo(CLAVE_MEDICOS)) guardar();
    renderizarSelector();
    renderizarLista();

    botonAdministrar.addEventListener('click', abrirPanel);
    document.getElementById('cerrarMedicosBtn').addEventListener('click', cerrarPanel);
    panel.addEventListener('click', (evento) => { if (evento.target === panel) cerrarPanel(); });
    document.addEventListener('keydown', (evento) => {
      if (evento.key === 'Escape' && !panel.hidden) cerrarPanel();
    });
    formulario.addEventListener('submit', (evento) => {
      evento.preventDefault();
      if (agregar(campoNombre.value)) {
        campoNombre.value = '';
        campoNombre.focus();
      }
    });
    campoNombre.addEventListener('input', () => mostrarError(''));
  }

  return { iniciar, seleccionar, obtener: () => [...medicos] };
})();
