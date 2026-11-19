const NOMBRE_CACHE = 'medivoz-modelo-ia-v1';

function aHexadecimal(buffer) {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function abrirCache() {
  try {
    return typeof caches === 'undefined' ? null : await caches.open(NOMBRE_CACHE);
  } catch (error) {
    return null;
  }
}

async function leerParte(url, cache, alBytes) {
  const solicitud = new Request(url, { credentials: 'omit', cache: 'force-cache' });
  if (cache) {
    const guardada = await cache.match(solicitud);
    if (guardada) {
      const bytes = new Uint8Array(await guardada.arrayBuffer());
      alBytes(bytes.length);
      return bytes;
    }
  }
  const respuesta = await fetch(solicitud);
  if (!respuesta.ok) throw new Error('descarga-fallida');
  const lector = respuesta.body.getReader();
  const trozos = [];
  let total = 0;
  for (;;) {
    const { done, value } = await lector.read();
    if (done) break;
    trozos.push(value);
    total += value.length;
    alBytes(value.length);
  }
  const bytes = new Uint8Array(total);
  let posicion = 0;
  trozos.forEach((t) => { bytes.set(t, posicion); posicion += t.length; });
  return { bytes, solicitud };
}

export async function obtenerArchivo(base, descripcion, alBytes) {
  const cache = await abrirCache();
  const resultado = new Uint8Array(descripcion.tamano);
  let posicion = 0;
  const guardados = [];
  for (const parte of descripcion.partes) {
    const url = new URL(parte, base).href;
    const leida = await leerParte(url, cache, alBytes);
    const bytes = leida instanceof Uint8Array ? leida : leida.bytes;
    if (posicion + bytes.length > resultado.length) throw new Error('tamano-invalido');
    resultado.set(bytes, posicion);
    posicion += bytes.length;
    if (!(leida instanceof Uint8Array) && cache) {
      guardados.push(cache.put(leida.solicitud, new Response(bytes.slice(), { headers: { 'Content-Type': 'application/octet-stream' } })).catch(() => {}));
    }
  }
  if (posicion !== descripcion.tamano) throw new Error('tamano-invalido');
  await Promise.all(guardados);
  const huella = aHexadecimal(await crypto.subtle.digest('SHA-256', resultado));
  if (huella !== descripcion.sha256) {
    if (cache) await Promise.all(descripcion.partes.map((p) => cache.delete(new Request(new URL(p, base).href, { credentials: 'omit', cache: 'force-cache' })).catch(() => false)));
    throw new Error('integridad-invalida');
  }
  return resultado;
}

export async function leerManifiesto(base) {
  const respuesta = await fetch(new URL('manifiesto.json', base).href, { credentials: 'omit' });
  if (!respuesta.ok) throw new Error('manifiesto-no-disponible');
  return respuesta.json();
}

export async function borrarCacheModelo() {
  if (typeof caches === 'undefined') return false;
  return caches.delete(NOMBRE_CACHE);
}

export { NOMBRE_CACHE };
