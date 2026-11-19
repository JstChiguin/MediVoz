window.AlmacenSeguro = (function () {
  const CLAVE_HISTORIAL_PLANO = 'mediVozHistory';
  const CLAVE_HISTORIAL_CIFRADO = 'mediVozHistorialCifrado';
  const CLAVE_AJUSTES = 'mediVozSeguridad';
  const ITERACIONES_PBKDF2 = 600000;
  const LARGO_SAL = 16;
  const LARGO_IV = 12;
  const LARGO_MINIMO_CONTRASENA = 8;
  const MAXIMO_REGISTROS = 20;
  const MAXIMO_TEXTO = 200000;
  const MAXIMO_CAMPO = 500;
  const DATOS_ASOCIADOS = new TextEncoder().encode('MediVoz:historial:v1');

  let ajustes = { cifrado: false, guardarEnDispositivo: true };
  let claveSesion = null;
  let salSesion = null;
  let historialEnMemoria = [];
  let temporizadorInactividad = null;
  let ultimaActividad = Date.now();

  function leerJson(clave) {
    try {
      return JSON.parse(localStorage.getItem(clave));
    } catch (error) {
      return null;
    }
  }

  function escribir(clave, valor) {
    localStorage.setItem(clave, typeof valor === 'string' ? valor : JSON.stringify(valor));
  }

  function aBase64(bytes) {
    let binario = '';
    const bloque = 0x8000;
    for (let i = 0; i < bytes.length; i += bloque) {
      binario += String.fromCharCode.apply(null, bytes.subarray(i, i + bloque));
    }
    return btoa(binario);
  }

  function desdeBase64(texto) {
    const binario = atob(texto);
    const bytes = new Uint8Array(binario.length);
    for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
    return bytes;
  }

  function recortar(valor, maximo) {
    return String(valor === undefined || valor === null ? '' : valor).slice(0, maximo);
  }

  function sanearRegistros(lista) {
    if (!Array.isArray(lista)) return [];
    const vistos = new Set();
    const resultado = [];
    lista.forEach((registro) => {
      if (!registro || typeof registro !== 'object') return;
      const id = Number(registro.id);
      if (!Number.isSafeInteger(id) || id <= 0 || vistos.has(id)) return;
      vistos.add(id);
      resultado.push({
        id,
        doctor: recortar(registro.doctor, MAXIMO_CAMPO),
        patient: recortar(registro.patient, MAXIMO_CAMPO),
        text: recortar(registro.text, MAXIMO_TEXTO),
        time: recortar(registro.time, MAXIMO_CAMPO)
      });
    });
    return resultado.slice(0, MAXIMO_REGISTROS);
  }

  function cargarAjustes() {
    const guardados = leerJson(CLAVE_AJUSTES);
    ajustes = {
      cifrado: Boolean(guardados && guardados.cifrado && leerJson(CLAVE_HISTORIAL_CIFRADO)),
      guardarEnDispositivo: !(guardados && guardados.guardarEnDispositivo === false)
    };
  }

  function guardarAjustes() {
    escribir(CLAVE_AJUSTES, ajustes);
  }

  async function derivarClave(contrasena, sal, iteraciones) {
    const material = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(contrasena), 'PBKDF2', false, ['deriveKey']
    );
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', hash: 'SHA-256', salt: sal, iterations: iteraciones },
      material,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  async function cifrar(clave, sal, lista, iteraciones) {
    const iv = crypto.getRandomValues(new Uint8Array(LARGO_IV));
    const claro = new TextEncoder().encode(JSON.stringify(lista));
    const cifrado = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: DATOS_ASOCIADOS }, clave, claro
    );
    return {
      v: 1,
      alg: 'AES-GCM-256',
      kdf: 'PBKDF2-SHA256',
      it: iteraciones,
      sal: aBase64(sal),
      iv: aBase64(iv),
      datos: aBase64(new Uint8Array(cifrado))
    };
  }

  async function descifrar(clave, paquete) {
    const claro = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: desdeBase64(paquete.iv), additionalData: DATOS_ASOCIADOS },
      clave,
      desdeBase64(paquete.datos)
    );
    return sanearRegistros(JSON.parse(new TextDecoder().decode(claro)));
  }

  function paqueteValido(paquete) {
    return Boolean(paquete && paquete.v === 1 && paquete.alg === 'AES-GCM-256' &&
      Number.isSafeInteger(paquete.it) && paquete.it >= 100000 && paquete.it <= 10000000 &&
      typeof paquete.sal === 'string' && typeof paquete.iv === 'string' && typeof paquete.datos === 'string');
  }

  function validarContrasena(contrasena) {
    if (typeof contrasena !== 'string' || contrasena.length < LARGO_MINIMO_CONTRASENA) {
      throw new Error('contrasena-corta');
    }
  }

  function olvidarClave() {
    claveSesion = null;
    salSesion = null;
    historialEnMemoria = [];
  }

  function iniciar() {
    cargarAjustes();
    if (ajustes.cifrado) {
      olvidarClave();
      return [];
    }
    historialEnMemoria = sanearRegistros(leerJson(CLAVE_HISTORIAL_PLANO));
    return historialEnMemoria.slice();
  }

  function estado() {
    return {
      cifrado: ajustes.cifrado,
      bloqueado: ajustes.cifrado && !claveSesion,
      guardarEnDispositivo: ajustes.guardarEnDispositivo
    };
  }

  async function activarCifrado(contrasena, registros) {
    validarContrasena(contrasena);
    if (ajustes.cifrado) throw new Error('ya-cifrado');
    const lista = sanearRegistros(registros);
    const sal = crypto.getRandomValues(new Uint8Array(LARGO_SAL));
    const clave = await derivarClave(contrasena, sal, ITERACIONES_PBKDF2);
    const paquete = await cifrar(clave, sal, lista, ITERACIONES_PBKDF2);
    const verificada = await descifrar(clave, paquete);
    if (JSON.stringify(verificada) !== JSON.stringify(lista)) throw new Error('verificacion-fallida');
    escribir(CLAVE_HISTORIAL_CIFRADO, paquete);
    ajustes.cifrado = true;
    guardarAjustes();
    localStorage.removeItem(CLAVE_HISTORIAL_PLANO);
    claveSesion = clave;
    salSesion = sal;
    historialEnMemoria = lista;
    registrarActividad();
    return lista.slice();
  }

  async function desbloquear(contrasena) {
    if (!ajustes.cifrado) throw new Error('sin-cifrado');
    const paquete = leerJson(CLAVE_HISTORIAL_CIFRADO);
    if (!paqueteValido(paquete)) throw new Error('datos-danados');
    const sal = desdeBase64(paquete.sal);
    const clave = await derivarClave(String(contrasena), sal, paquete.it);
    let lista;
    try {
      lista = await descifrar(clave, paquete);
    } catch (error) {
      throw new Error('contrasena-incorrecta');
    }
    claveSesion = clave;
    salSesion = sal;
    historialEnMemoria = lista;
    registrarActividad();
    return lista.slice();
  }

  function bloquear() {
    olvidarClave();
  }

  async function guardarHistorial(registros) {
    const lista = sanearRegistros(registros);
    historialEnMemoria = lista;
    if (!ajustes.guardarEnDispositivo) return;
    if (!ajustes.cifrado) {
      escribir(CLAVE_HISTORIAL_PLANO, lista);
      return;
    }
    if (!claveSesion) throw new Error('bloqueado');
    const paquete = await cifrar(claveSesion, salSesion, lista, leerJson(CLAVE_HISTORIAL_CIFRADO).it);
    escribir(CLAVE_HISTORIAL_CIFRADO, paquete);
  }

  async function desactivarCifrado(contrasena) {
    if (!ajustes.cifrado) throw new Error('sin-cifrado');
    const lista = await desbloquear(contrasena);
    escribir(CLAVE_HISTORIAL_PLANO, lista);
    const releida = sanearRegistros(leerJson(CLAVE_HISTORIAL_PLANO));
    if (JSON.stringify(releida) !== JSON.stringify(lista)) throw new Error('verificacion-fallida');
    localStorage.removeItem(CLAVE_HISTORIAL_CIFRADO);
    ajustes.cifrado = false;
    guardarAjustes();
    olvidarClave();
    historialEnMemoria = lista;
    return lista.slice();
  }

  function establecerGuardadoEnDispositivo(valor) {
    ajustes.guardarEnDispositivo = Boolean(valor);
    guardarAjustes();
  }

  function eliminarTodo() {
    localStorage.removeItem(CLAVE_HISTORIAL_PLANO);
    localStorage.removeItem(CLAVE_HISTORIAL_CIFRADO);
    ajustes.cifrado = false;
    guardarAjustes();
    olvidarClave();
  }

  function exportarJson(registros) {
    return JSON.stringify({ aplicacion: 'MediVoz', exportadoEn: new Date().toISOString(), registros: sanearRegistros(registros) }, null, 2);
  }

  function registrarActividad() {
    ultimaActividad = Date.now();
  }

  function vigilarInactividad({ minutos, estaOcupado, alBloquear, intervaloMs }) {
    clearInterval(temporizadorInactividad);
    ['pointerdown', 'keydown', 'touchstart'].forEach((tipo) => {
      document.addEventListener(tipo, registrarActividad, { passive: true });
    });
    temporizadorInactividad = setInterval(() => {
      if (!claveSesion) return;
      if (estaOcupado()) { registrarActividad(); return; }
      if (Date.now() - ultimaActividad > minutos * 60000) {
        bloquear();
        alBloquear();
      }
    }, intervaloMs || 5000);
  }

  return {
    iniciar,
    estado,
    activarCifrado,
    desbloquear,
    bloquear,
    guardarHistorial,
    desactivarCifrado,
    establecerGuardadoEnDispositivo,
    eliminarTodo,
    exportarJson,
    sanearRegistros,
    vigilarInactividad,
    LARGO_MINIMO_CONTRASENA
  };
})();
