window.PanelDiccionario = (function () {
  const CLAVE_TERMINOS = 'mediVozDiccionario';
  const MAXIMO_TERMINOS = 500;
  const MAXIMO_LARGO = 60;

  let interfaz;
  let diccionario = null;
  let ignoradas = new Set();
  let elementos;
  let ultimoFoco = null;

  function porId(id) {
    return document.getElementById(id);
  }

  function leerTerminos() {
    try {
      const guardados = JSON.parse(localStorage.getItem(CLAVE_TERMINOS));
      if (!Array.isArray(guardados)) return [];
      return guardados.filter((t) => typeof t === 'string').map((t) => t.trim().slice(0, MAXIMO_LARGO)).filter(Boolean).slice(0, MAXIMO_TERMINOS);
    } catch (error) {
      return [];
    }
  }

  function guardarTerminos(lista) {
    try {
      localStorage.setItem(CLAVE_TERMINOS, JSON.stringify(lista));
      return true;
    } catch (error) {
      elementos.error.textContent = 'No se pudo guardar el diccionario en este navegador.';
      return false;
    }
  }

  async function cargarDiccionario() {
    if (diccionario) return diccionario;
    const [modulo, lexico] = await Promise.all([import('./ia/diccionario-medico.js'), import('./ia/lexico-base.js')]);
    diccionario = new modulo.DiccionarioMedico([...lexico.LEXICO_BASE, ...leerTerminos()]);
    return diccionario;
  }

  function clave(sugerencia) {
    return sugerencia.original + '>' + sugerencia.sugerencia;
  }

  function crear(etiqueta, clase, texto) {
    const nodo = document.createElement(etiqueta);
    if (clase) nodo.className = clase;
    if (texto !== undefined) nodo.textContent = texto;
    return nodo;
  }

  function limpiar() {
    ignoradas = new Set();
    elementos.sugerencias.replaceChildren();
    elementos.sugerencias.hidden = true;
  }

  function dibujar(lista) {
    if (!lista.length) {
      elementos.sugerencias.replaceChildren();
      elementos.sugerencias.hidden = true;
      return;
    }
    const filas = lista.map((sugerencia) => {
      const aplicar = crear('button', 'btn-sm primary', 'Aplicar');
      aplicar.type = 'button';
      aplicar.addEventListener('click', () => aplicarSugerencia(sugerencia));
      const ignorar = crear('button', 'btn-sm', 'Ignorar');
      ignorar.type = 'button';
      ignorar.addEventListener('click', () => {
        ignoradas.add(clave(sugerencia));
        revisar();
      });
      const fila = crear('div', 'sugerencia-fila');
      const texto = crear('span', 'sugerencia-texto');
      texto.append(crear('span', 'sugerencia-original', sugerencia.original), ' → ', crear('strong', '', sugerencia.sugerencia));
      fila.append(texto, aplicar, ignorar);
      return fila;
    });
    elementos.sugerencias.replaceChildren(
      crear('p', 'sugerencias-titulo', 'Posibles errores en términos médicos. Revísalos antes de aplicarlos; las cifras y las negaciones nunca se tocan.'),
      ...filas
    );
    elementos.sugerencias.hidden = false;
  }

  async function revisar() {
    const texto = interfaz.obtenerTexto();
    if (!texto) {
      limpiar();
      return;
    }
    const motor = await cargarDiccionario();
    dibujar(motor.sugerir(texto).filter((s) => !ignoradas.has(clave(s))));
  }

  async function aplicarSugerencia(sugerencia) {
    const texto = interfaz.obtenerTexto();
    if (texto.slice(sugerencia.inicio, sugerencia.fin) !== sugerencia.original) {
      await revisar();
      return;
    }
    const motor = await cargarDiccionario();
    interfaz.reemplazarTexto(motor.aplicar(texto, [sugerencia]));
    await revisar();
  }

  function dibujarTerminos() {
    const terminos = leerTerminos();
    elementos.cuenta.textContent = terminos.length + ' términos propios';
    if (!terminos.length) {
      elementos.lista.replaceChildren(crear('li', 'medicos-vacio', 'Aún no agregas términos propios.'));
      return;
    }
    elementos.lista.replaceChildren(...terminos.map((termino, indice) => {
      const borrar = crear('button', 'hi-copy', '🗑️');
      borrar.type = 'button';
      borrar.title = 'Eliminar ' + termino;
      borrar.setAttribute('aria-label', 'Eliminar ' + termino);
      borrar.addEventListener('click', () => {
        const restantes = leerTerminos().filter((_, i) => i !== indice);
        if (guardarTerminos(restantes)) {
          diccionario = null;
          dibujarTerminos();
        }
      });
      const item = crear('li', 'medicos-item');
      item.append(crear('span', 'medicos-nombre', termino), borrar);
      return item;
    }));
  }

  function agregar(evento) {
    evento.preventDefault();
    const termino = elementos.campo.value.replace(/\s+/g, ' ').trim().slice(0, MAXIMO_LARGO);
    elementos.error.textContent = '';
    if (!termino) return;
    if (/\d/.test(termino)) {
      elementos.error.textContent = 'Los términos no pueden contener números.';
      return;
    }
    const existentes = leerTerminos();
    if (existentes.length >= MAXIMO_TERMINOS) {
      elementos.error.textContent = 'Se alcanzó el máximo de términos.';
      return;
    }
    if (existentes.some((t) => t.localeCompare(termino, 'es', { sensitivity: 'base' }) === 0)) {
      elementos.error.textContent = 'Ese término ya está en tu diccionario.';
      return;
    }
    if (guardarTerminos([...existentes, termino])) {
      diccionario = null;
      elementos.campo.value = '';
      dibujarTerminos();
    }
  }

  function abrir() {
    ultimoFoco = document.activeElement;
    elementos.error.textContent = '';
    dibujarTerminos();
    elementos.panel.hidden = false;
    elementos.campo.focus();
  }

  function cerrar() {
    elementos.panel.hidden = true;
    if (ultimoFoco && typeof ultimoFoco.focus === 'function') ultimoFoco.focus();
    revisar();
  }

  function iniciar(opciones) {
    interfaz = opciones;
    elementos = {
      sugerencias: porId('sugerencias'),
      panel: porId('panelDiccionario'),
      formulario: porId('formularioDiccionario'),
      campo: porId('terminoDiccionarioInput'),
      error: porId('errorDiccionario'),
      lista: porId('listaDiccionario'),
      cuenta: porId('cuentaDiccionario'),
      cerrar: porId('cerrarDiccionarioBtn')
    };
    porId('abrirDiccionarioBtn').addEventListener('click', abrir);
    porId('revisarBtn').addEventListener('click', revisar);
    elementos.cerrar.addEventListener('click', cerrar);
    elementos.panel.addEventListener('click', (evento) => { if (evento.target === elementos.panel) cerrar(); });
    document.addEventListener('keydown', (evento) => {
      if (evento.key === 'Escape' && !elementos.panel.hidden) cerrar();
    });
    elementos.formulario.addEventListener('submit', agregar);
  }

  return { iniciar, revisar, limpiar, abrir, cerrar };
})();
