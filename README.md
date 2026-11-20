# 🩺 MediVoz

**Versión 2.2.2**

## 🌐 Dónde usar MediVoz

| Alojamiento | Dirección | Papel |
|---|---|---|
| **Cloudflare Pages** | https://medivoz-chiguin.pages.dev/ | **Principal (recomendado)** |
| GitHub Pages | https://jstchiguin.github.io/MediVoz/ | Alternativo |

Ambos sitios publican **MediVoz v2.2.2** con los mismos archivos (en la auditoría se compararon por huella SHA-256 los archivos publicados con el repositorio y coincidieron).

**Cloudflare Pages es el alojamiento recomendado** porque entrega cabeceras HTTP de seguridad reales (CSP con `frame-ancestors`, `X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, HSTS) y porque su origen `pages.dev` es propio de este proyecto, de modo que el `localStorage` no se comparte con otras páginas.

**GitHub Pages sigue disponible como alternativa**, con menos protecciones: no permite cabeceras HTTP propias (solo entrega HSTS), la CSP va únicamente en una etiqueta `<meta>` que no admite `frame-ancestors` y el origen `jstchiguin.github.io` es compartido con otros proyectos del mismo usuario, así que comparte almacenamiento con ellos. Los datos de cada sitio son independientes: el historial, los médicos y los ajustes guardados en un origen no aparecen en el otro.

MediVoz es una aplicación web de transcripción médica por voz desarrollada para facilitar el registro de información clínica de manera rápida y sencilla.

El proyecto nació a partir de una necesidad real observada en el entorno hospitalario: reducir el tiempo destinado a escribir o transcribir información después de una atención médica, permitiendo que el profesional pueda concentrarse más en el paciente y menos en el teclado.

## Funcionalidades

* 🎤 Reconocimiento de voz en español de Chile con dos motores: la **IA local privada** (predeterminada), que procesa el audio solo en el dispositivo, o el del navegador (Web Speech API), que se elige a mano tras aceptar un aviso de privacidad.
* 📖 Diccionario médico con sugerencias de corrección para revisar (nunca cambia nada por sí solo).
* ⏱️ Temporizador de grabación y reinicio automático del reconocimiento cuando el servicio de voz se corta.
* 📝 Transcripción automática y edición manual del texto antes de guardar.
* 👨‍⚕️ Selección del médico tratante desde una lista que el usuario administra: agregar, editar (con orden alfabético) y eliminar con confirmación, sin nombres vacíos ni duplicados.
* 🔒 Los registros guardados conservan el nombre del médico original aunque luego se cambie o elimine de la lista.
* 👤 Campo de paciente asociado a la transcripción.
* 📋 Copiado de la transcripción al portapapeles.
* 💾 Guardado de transcripciones en un historial local del navegador (se conservan las 20 más recientes).
* ✏️ Edición de un registro guardado: se carga en el formulario y se vuelve a guardar.
* 📋 Copiado de un registro individual.
* 📄 Exportación individual de un registro a Word (.docx).
* 🖨️ Impresión individual de un registro.
* 🖨️ Impresión de todo el historial.
* 🗑️ Eliminación individual de registros y eliminación de todo el historial.
* ⚠️ Mensajes de error y notificaciones.
* 📱 Diseño adaptable a computadores, tablets y móviles.

## Tecnologías utilizadas

* HTML5
* CSS3
* JavaScript
* Web Speech API y, opcionalmente, IA local con ONNX Runtime Web 1.22.0 (WebAssembly) y un Web Worker
* LocalStorage y Web Crypto API (AES-GCM)
* Docx.js 8.5.0 (incluido en el repositorio, sin CDN)
* Cloudflare Pages (principal, publicación manual) y GitHub Pages (alternativo)

## Estructura del proyecto

```text
MediVoz/
├── index.html            Estructura HTML
├── favicon.ico           Ícono clásico (16, 32 y 48 px)
├── manifest.webmanifest  Nombre, colores e íconos para Android
├── iconos/               PNG de 32, 192, 512 (normal y enmascarable) y 180 px (iOS)
├── css/
│   ├── styles.css        Estilos, incluida la firma flotante
│   ├── fuentes.css       Tipografías locales (sin Google Fonts)
│   ├── fuentes/          Archivos woff2
│   └── impresion.css     Estilos de la ventana de impresión
├── js/
│   ├── config.js         Configuración central (versión 2.2.2 y texto de la firma)
│   ├── medicos.js        Administrador de médicos (lista editable)
│   ├── almacen-seguro.js Almacenamiento del historial y cifrado opcional
│   ├── panel-seguridad.js Panel de seguridad y privacidad
│   ├── panel-diccionario.js Diccionario médico y sugerencias
│   ├── ia/               IA local: motor, segmentador de voz, captura, diccionario
│   ├── vendor/           Dependencias con versión fija (docx y ONNX Runtime Web)
│   └── script.js         Comportamiento de la aplicación y firma flotante
├── modelos/conformer-es/ Modelo de voz local (CC-BY-4.0) en fragmentos de 20 MiB, con manifiesto y huellas SHA-256
├── herramientas/         Utilidades de mantenimiento (división del modelo en fragmentos)
├── _headers              Cabeceras HTTP de seguridad para Cloudflare Pages (GitHub Pages las ignora)
├── evaluacion/           Banco de pruebas reproducible de motores y su informe
├── tests/                Pruebas automatizadas
├── .github/workflows/    Ejecución de pruebas en GitHub Actions
├── V1                    Versión histórica
└── README.md
```

Todas las rutas son relativas, por lo que el sitio funciona sin cambios en Cloudflare Pages (raíz del dominio) y en GitHub Pages (bajo `/MediVoz/`).

## Instalación y uso

MediVoz no requiere instalación ni dependencias.

* En línea (principal): https://medivoz-chiguin.pages.dev/
* En línea (alternativo): https://jstchiguin.github.io/MediVoz/
* Local: servir la carpeta con cualquier servidor estático (por ejemplo `node -e "require('./tests/servidor-estatico').iniciarServidor(8080).then(s => console.log(s.url))"`) y abrir la dirección en Chrome o Edge.
* El reconocimiento de voz (español de Chile) requiere Chrome o Edge y permiso de micrófono.

## Administración de médicos

El botón ⚙️ junto al selector abre el administrador de médicos. La lista no viene escrita en el código: se guarda en `localStorage` bajo la clave `mediVozMedicos`, por lo que pertenece a cada navegador y dispositivo y no se sincroniza entre ellos. Si la clave no existe y ya hay un historial guardado, la lista inicial se arma con los nombres de médico de esos registros, sin modificarlos.

## Versión y firma

La versión se define una sola vez en `js/config.js`. La firma flotante `by Chiguin` con la versión debajo se muestra en la esquina inferior izquierda (en móviles y en escritorio) mediante el elemento `<firma-medivoz>`, que lee sus datos de esa configuración. En pantallas de hasta 1100 px de ancho la página se desplaza de forma natural y no hay ninguna barra inferior: la firma flota sobre la página, es translúcida y no intercepta toques, y solo se reserva al final del contenido el margen mínimo (alto de la firma más el área segura del dispositivo) para que el último elemento pueda desplazarse hasta quedar libre. Mientras se desplaza, el contenido puede pasar por debajo de la firma, que no bloquea ningún control. Para publicar una nueva versión basta con cambiar `version` en `js/config.js` y actualizar la versión esperada en `tests/firma.test.js`.

## Pruebas

Requieren Node.js 22 o superior y Chrome o Edge instalado (se puede indicar otro ejecutable con la variable `CHROME_PATH`). No usan dependencias externas.

```bash
npm test
```

* `tests/firma.test.js`: protege la firma. Falla si cambia el texto `by Chiguin` (cualquier carácter, espacio o mayúscula), si se oculta, si deja de ser fija, si sale de la esquina inferior izquierda, si reaparece una barra inferior reservada, si la versión no es `2.2.2` o si se duplica. Se ejecuta en escritorio y móvil, y recorre todo el scroll en 12 resoluciones (de 320x568 a 1366x768) comprobando que permanezca en la esquina inferior izquierda, que no haya desplazamiento horizontal y que al final del scroll no quede sobre botones, campos ni contenido.
* `tests/movil.test.js`: en Chrome con emulación móvil (320 a 412 px de ancho) verifica el desplazamiento vertical de toda la página, que la tarjeta no recorte contenido, que transcripciones extensas se puedan leer completas, que los botones se adapten sin desplazamiento horizontal, el acceso al historial, el dictado simulado y una altura reducida que simula el teclado virtual.
* `tests/medicos.test.js`: verifica que no haya médicos en el código, el aviso de lista vacía, agregar, editar, eliminar con confirmación, validaciones, orden alfabético, persistencia al recargar, la protección de los registros históricos y el panel en móviles.
* `tests/funcionalidad.test.js`: verifica el reconocimiento de voz simulado, el temporizador, la recuperación de grabación, el guardado, el historial local, la edición, la eliminación, la exportación a Word y la impresión.

Las pruebas usan exclusivamente datos ficticios. El reconocimiento de voz se simula y el teclado virtual se emula reduciendo la altura de la ventana; no sustituyen una prueba con micrófono ni teclado reales en un teléfono. Las pruebas también se ejecutan en GitHub Actions en cada push a `develop`, `feature/**` o `seguridad/**` y en cada pull request.

## Seguridad y privacidad

* **Contenido no confiable:** lo dictado, escrito, pegado o leído del almacenamiento se trata siempre como texto. No se usa `innerHTML`, `eval`, `new Function` ni controladores en línea; la ventana de impresión escapa cada campo. Al pegar en la transcripción solo se inserta texto plano.
* **Política de seguridad de contenido (CSP):** declarada en `index.html` con `default-src 'none'`, scripts, estilos, conexiones y workers solo del propio origen y `wasm-unsafe-eval` únicamente para ejecutar WebAssembly (no habilita `eval`). Al estar en una etiqueta `<meta>` (GitHub Pages no permite cabeceras propias) no puede incluir `frame-ancestors`, por lo que la protección contra incrustación en otros sitios no está cubierta en GitHub Pages. El archivo `_headers` entrega la misma CSP como cabecera real, con `frame-ancestors 'none'`, junto con `X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy` (micrófono solo del propio sitio) y HSTS cuando el sitio se sirva desde Cloudflare Pages (ver más abajo).
* **Sin recursos externos:** las tipografías y `docx` se sirven desde el repositorio; `docx` está fijado por hash SHA-384 en las pruebas. MediVoz no tiene servicios de analítica ni de seguimiento y no envía datos a servidores propios o de terceros.
* **Reconocimiento de voz:** el motor del navegador usa la Web Speech API; en Chrome el audio puede enviarse a los servicios de Google y la aplicación lo indica en pantalla. Eso queda fuera del control de MediVoz. El motor **IA local** no envía audio ni texto a ningún servidor (ver más abajo). MediVoz nunca cambia de motor por sí solo.
* **Sin IA generativa:** la IA local es un modelo de transcripción (audio a texto), no un modelo de lenguaje: no recibe instrucciones, no tiene herramientas ni agentes y no ejecuta nada. MediVoz no incluye ningún agente ni herramienta ejecutable conectada a lo dictado. Una frase dictada nunca se interpreta como instrucción: la protección frente a la inyección de prompts es estructural (no hay intérprete) y no depende de detectar palabras sospechosas.
* **Aviso para activar el cifrado:** junto a los botones del historial se muestra una nota fija («Protege tu historial») que explica que el cifrado es opcional, que se activa con el botón 🔒 Seguridad y que, si no se activa, el historial se guarda sin cifrar en este navegador, y advierte que una contraseña perdida no se puede recuperar. La nota refleja el estado real: si el cifrado está activo dice «Historial cifrado» y si el guardado en el dispositivo está desactivado lo indica. No es una ventana emergente, no activa nada por sí sola y no modifica el almacenamiento.
* **Historial cifrado (opcional):** el botón 🔒 Seguridad permite cifrarlo con AES-GCM de 256 bits; la clave se deriva de una contraseña con PBKDF2-SHA-256 (600 000 iteraciones, sal aleatoria por activación y vector nuevo en cada escritura). La contraseña no se guarda ni existe clave fija en el código; la clave derivada vive solo en memoria, no es exportable y se descarta al bloquear. Si se pierde la contraseña, los datos no se pueden recuperar y solo se pueden borrar. El historial se bloquea tras 10 minutos sin actividad (no mientras se graba). La activación migra el historial existente y borra la copia sin cifrar solo después de verificar que se descifra idéntico. También es posible dejar de guardar el historial en el dispositivo, exportar una copia JSON (sin cifrar, solo a petición) y quitar el cifrado.
* **Datos que quedan en el dispositivo:** historial (cifrado o no), lista de médicos y ajustes, en `localStorage` del navegador. La lista de médicos y los ajustes no se cifran. No se guardan grabaciones.
* **Origen compartido en GitHub Pages (alternativo):** todas las páginas de proyecto bajo `jstchiguin.github.io` comparten el mismo origen y por tanto el mismo `localStorage`. Otra aplicación del mismo usuario podría leer el historial sin cifrar; el cifrado con contraseña mitiga esto. El sitio principal en Cloudflare Pages tiene un origen propio (`medivoz-chiguin.pages.dev`) y no comparte almacenamiento con GitHub Pages.

## IA local de transcripción (opcional)

El selector **Motor de voz** junto al micrófono usa por defecto la **IA local privada**. La primera vez que se pulsa el micrófono se descarga el modelo (nada se descarga al abrir la página). El selector muestra nombres cortos (**IA local — Privada** y **Chrome — Rápido**) y la explicación completa de cada motor aparece debajo. El motor de Chrome (Web Speech API) es una alternativa manual: al elegirlo aparece un aviso de que la voz puede enviarse a servicios externos (por ejemplo, los de Google) y el micrófono no funciona con ese motor hasta pulsar **Entiendo y acepto**. Esa aceptación vale solo para la sesión del navegador (`sessionStorage`): no se guarda de forma permanente, al cerrar la pestaña se pierde y al abrir MediVoz de nuevo vuelve la IA local. Tampoco es una autorización para procesar datos clínicos reales. Si se vuelve a la IA local, el consentimiento se elimina. La versión 2.2.0 guardaba la elección en `localStorage`; esa clave antigua se borra al abrir la aplicación y nunca activa el motor externo. No se afirma que ningún motor sea más preciso: eso depende del dispositivo y del tipo de dictado. **MediVoz nunca cambia por sí solo de la IA local al motor del navegador**, tampoco si el modelo falla: muestra el error y deja el micrófono libre.

* **Modelo:** NVIDIA NeMo FastConformer Hybrid en español, rama transductora cuantizada a 8 bits (licencia CC-BY-4.0, atribución en `modelos/conformer-es/ATRIBUCION.md`). Se ejecuta con ONNX Runtime Web (WebAssembly, un hilo) dentro de un Web Worker, por lo que la interfaz no se congela.
* **Privacidad:** el audio se captura con un `AudioWorklet`, se segmenta por pausas en el propio dispositivo y se transcribe localmente. Las pruebas automatizadas registran toda la red durante un dictado completo: solo hay solicitudes `GET` al propio sitio (el modelo y el código), ninguna con datos de audio o texto. No se guardan grabaciones.
* **Descarga y caché:** unos 135 MB la primera vez, alojados en este mismo sitio (no hay servidores de terceros). Se descargan por fragmentos de 20 MiB como máximo; cada fragmento y el archivo ya unido se verifican contra las huellas SHA-256 de `modelos/conformer-es/manifiesto.json` y se guardan en la caché del navegador (Cache Storage) para no repetir la descarga. Un archivo corrupto se descarta con un aviso.
* **Memoria y liberación:** el modelo en uso ocupa cerca de 0,8 GB de memoria; medido en la auditoría v2.2.2 con Chrome de escritorio, el pico total del navegador fue de unos 1,3 GB (de los cuales unos 0,5 GB son del propio navegador vacío). Se descarga de la memoria tras 10 minutos sin dictar. No se carga al iniciar la aplicación.
* **Sin conexión:** una vez descargado el modelo, la IA local no necesita red. La página en sí sí se carga desde el sitio publicado (no hay service worker), así que para abrir MediVoz sin conexión la página debe seguir abierta o estar en la caché normal del navegador.
* **Recuperación:** si la descarga o la carga fallan, el micrófono queda libre y se muestra un aviso; el motor del navegador sigue disponible.
* **Limitaciones conocidas:** los nombres de fármacos son el punto débil del modelo (por ejemplo, "enalapril" puede salir como "en el april"). Las cifras y las unidades se reconocen mucho mejor. Toda transcripción debe revisarse antes de usarse con fines clínicos.

### Diccionario médico

El botón **📖 Diccionario** abre un editor de términos propios que se suman a un vocabulario clínico base. Tras cada dictado, o con **🔎 Revisar**, MediVoz muestra posibles errores como *sugerencias* que se aceptan o se ignoran una a una. Nunca cambia nada por sí solo y por diseño solo considera palabras de al menos ocho letras: las cifras, las dosis, las unidades y las negaciones no se tocan (hay pruebas que lo verifican).

### Comparativa de motores

`evaluacion/INFORME.md` contiene la comparación completa (precisión, velocidad, memoria y licencias) de Whisper tiny, base y small, Moonshine, Canary, Parakeet, Vosk y los modelos Conformer, medidos con 40 audios ficticios y reproducibles con los scripts de `evaluacion/`. Whisper, que suele darse por defecto, resultó el menos preciso para dictado médico en español con los modelos que caben en un navegador.

## Pruebas de seguridad

* `tests/estatico.test.js`: auditoría del código (construcciones prohibidas, ausencia de comentarios, CSP restrictiva, sin recursos externos, hash de `docx`, permisos y acciones fijadas por commit en GitHub Actions, ausencia de credenciales, audio o exportaciones en el repositorio).
* `tests/cifrado.test.js`: cifrado, descifrado, bloqueo, contraseña incorrecta, datos alterados, migración sin pérdida, fallo durante la migración, inactividad, guardado desactivado y exportación.
* `tests/inyeccion.test.js`: 14 cargas hostiles ficticias (instrucciones en español, suplantación de mensajes del sistema, HTML y scripts mezclados con términos médicos) por dictado, almacenamiento alterado y pegado, y verificación de que la CSP bloquea scripts en línea, `eval` y solicitudes de red inyectadas.
* `tests/privacidad.test.js`: registra todas las solicitudes de red en un flujo completo (dictar, guardar, copiar, imprimir, Word, cifrar, bloquear) y comprueba que ninguna sale del origen ni contiene datos clínicos, además del funcionamiento sin conexión una vez cargada la página.
* `tests/ia-local.test.js`: con un micrófono simulado de Chrome que reproduce audio ficticio, verifica que la IA local transcribe, ordena las frases, no se carga al iniciar, se recupera de un modelo corrupto, descarta lo pendiente al borrar, no hace solicitudes externas y no ejecuta una frase dictada que pide borrar datos o desactivar el cifrado.
* `tests/ia-unitarias.test.js`, `tests/diccionario.test.js`, `tests/diccionario-interfaz.test.js`, `tests/metricas.test.js`: segmentador de voz, características de audio, diccionario (incluidas las reglas que impiden tocar cifras y negaciones) y métricas de evaluación.
* `tests/motor-predeterminado.test.js`: la IA local es el motor por defecto, las explicaciones de cada motor, el consentimiento explícito y solo por sesión para Chrome (se pierde al volver a la IA local o al abrir una sesión nueva) y que ningún fallo de la IA local cambia de motor.
* `tests/selector-motor.test.js`: nombres completos, ausencia de desbordamiento y de superposición con el micrófono a 320, 360, 390, 412, 768 y 1366 px, desplazamiento vertical y accesibilidad del selector nativo.
* `tests/aviso-cifrado.test.js`: texto, ubicación y adaptación a pantallas del aviso del cifrado, coincidencia con el botón 🔒 Seguridad y fidelidad con el estado real (sin cifrar, cifrado, bloqueado y solo sesión).
* `tests/cabeceras.test.js`: formato y límites de `_headers`, coincidencia de su CSP con la del `<meta>`, permisos (micrófono solo del propio sitio), requisitos de Cloudflare Pages (25 MiB por archivo) y entrega real de las cabeceras. Todas las pruebas con navegador sirven el sitio con esas cabeceras.
* `tests/favicon.test.js`: formatos y tamaños de los íconos (`favicon.ico` de 16, 32 y 48 px, PNG de 32, 192, 512 y 180 px y uno enmascarable), rutas relativas, parámetro de versión contra la caché, manifiesto válido y carga real sin errores en la raíz (Cloudflare Pages) y bajo `/MediVoz/` (GitHub Pages).
* `tests/modelo-fragmentos.test.js`: el modelo reconstruido es idéntico al original, huellas por fragmento, herramienta de división y descarga (fragmento alterado, desordenado, faltante o inexistente).
* `tests/movil-seguridad.test.js`: diseño del panel y de la firma en 320, 390 y 412 px, y tiempos con CPU limitada 4 veces. Es una emulación en un Chrome de escritorio: no sustituye una prueba en un teléfono Android real.

## Alojamiento: Cloudflare Pages (principal) y GitHub Pages (alternativo)

MediVoz v2.2.2 está publicado en **Cloudflare Pages** (https://medivoz-chiguin.pages.dev/) y en **GitHub Pages** (https://jstchiguin.github.io/MediVoz/). Cloudflare Pages usa el plan gratuito, sin Workers, Functions ni otros servicios de pago.

| | Cloudflare Pages (principal) | GitHub Pages (alternativo) |
|---|---|---|
| Costo | Gratis; dominio propio opcional (el dominio sí tiene costo) | Gratis para repositorios públicos |
| Cabeceras HTTP propias | Sí, con el archivo `_headers` (CSP completa, `X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, HSTS, etc.) | No: la CSP solo puede ir en `<meta>` y no admite `frame-ancestors` |
| Protección contra incrustación (clickjacking) | Sí (`frame-ancestors 'none'` y `X-Frame-Options: DENY`) | No es posible |
| Origen del sitio | `medivoz-chiguin.pages.dev`, propio de este proyecto | `jstchiguin.github.io`, compartido con otros proyectos del usuario (mismo `localStorage`) |
| Tamaño máximo por archivo | **25 MiB** (por eso el modelo se divide en fragmentos de 20 MiB) | 100 MB |
| Número de archivos | 20 000 (subida manual: hasta 1 000 archivos) | Sin límite práctico |
| Despliegue | **Manual**, subiendo una carpeta | Automático desde `main` |

Los límites y precios son los publicados por las plataformas ([límites de Cloudflare Pages](https://developers.cloudflare.com/pages/platform/limits/)) y pueden cambiar. La cuota de despliegues de la cuenta no se verificó en la auditoría.

### Protecciones de Cloudflare Pages

En la auditoría de v2.2.2 se comprobó con peticiones reales que Cloudflare entrega estas cabeceras en el HTML, los scripts, los `.wasm`, el manifiesto del modelo, sus fragmentos, los íconos y las fuentes: Strict-Transport-Security (1 año), Content-Security-Policy con `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Permissions-Policy` (micrófono solo del propio sitio), `Cross-Origin-Opener-Policy` y `Cross-Origin-Resource-Policy`. Los `.wasm` se sirven como `application/wasm` y los `.mjs` como `text/javascript`, y la inferencia local funcionó sin violaciones de CSP.

Una calificación alta en un analizador externo de cabeceras (por ejemplo A o 100 %) solo indica que las cabeceras están bien configuradas: **no es una garantía absoluta de seguridad**. No protege frente a un dispositivo comprometido, a una extensión maliciosa del navegador ni a un fallo en el código de la aplicación. Tampoco se ocultó la cabecera `Server: cloudflare`: la documentación de Cloudflare impide modificar su valor y no aclara si puede eliminarse en el plan gratuito, por lo que se mantiene la configuración actual.

### Despliegues manuales en Cloudflare Pages

El sitio de Cloudflare **no está conectado al repositorio**: cada versión se sube a mano en el panel de Cloudflare Pages (subida directa de una carpeta). Para preparar el paquete actualizado:

1. Verificar que `main` contiene la versión que se quiere publicar y que las pruebas pasan.
2. Exportar solo los archivos versionados de `main` a una carpeta nueva y vacía, por ejemplo con `git -c core.autocrlf=false -c core.eol=lf archive main --format=tar` extraído en esa carpeta. Así no se incluyen `.git`, `node_modules`, archivos locales ni credenciales, y los textos conservan saltos de línea LF (con CRLF cambiarían las huellas de los archivos).
3. Quitar de esa carpeta lo que no deba publicarse (`tests/`, `evaluacion/`, `herramientas/`, `.github/`, `.gitattributes`, `package.json`, `README.md`, `V1`), conservando `index.html`, `_headers`, `favicon.ico`, `manifest.webmanifest`, `iconos/`, `css/`, `js/` y `modelos/`.
4. Comprobar que ningún archivo supera 25 MiB y que el modelo coincide con las huellas de `modelos/conformer-es/manifiesto.json`.
5. Subir la carpeta con la opción de subida directa de Cloudflare Pages y revisar después, en el sitio publicado, la versión `2.2.2`, la firma y las cabeceras.

La última carpeta publicada tenía 47 archivos y 143 MB, con el archivo más grande de 20 MiB. Al ser un origen distinto de GitHub Pages, sus datos locales no se trasladan solos.

### Fragmentos del modelo y cómo regenerarlos

El archivo `encoder.int8.onnx` (131 MB) está dividido en 7 fragmentos (seis de 20 MiB y un resto); los demás archivos caben enteros. La división no altera el modelo: el archivo reconstruido tiene exactamente el mismo tamaño y la misma huella SHA-256 que el original, así que la transcripción es idéntica. `node herramientas/dividir-modelo.js` reconstruye cada archivo desde sus fragmentos, comprueba su huella, lo vuelve a dividir y regenera el manifiesto con las huellas de cada fragmento. El cargador verifica cada fragmento al descargarlo (y los que vienen de la caché) y luego el archivo completo.

## Resultados de la auditoría de v2.2.2

La auditoría de seguridad, privacidad, IA y rendimiento se hizo sin modificar código, configuración ni alojamiento. Resultados reales:

* **Sitios publicados:** ambos muestran v2.2.2 con la firma `by Chiguin` abajo a la izquierda y sin barra inferior. Se compararon por SHA-256 23 archivos publicados con `main` y coincidieron en los dos sitios.
* **Pruebas contra Cloudflare Pages** (13 archivos de prueba que se pueden ejecutar contra una URL remota): 235 ejecutadas, **231 aprobadas, 3 fallidas y 1 cancelada**. Las 3 fallidas no son fallos de la aplicación: una prueba de favicon usa un proxy HTTP que no sirve contra una URL HTTPS remota, y dos de IA local esperan solo 8 s a una descarga de unos 135 MB. La cancelada fue una ejecución de `favicon.test.js` que se detuvo tras quedarse colgada al abrir Chrome en Windows.
* **Pruebas locales sin navegador:** 110 de 110 aprobadas. Las pruebas que revisan el repositorio local no se ejecutaron contra Cloudflare.
* **Integración continua:** las ejecuciones de GitHub Actions están en verde.
* **IA local en Cloudflare (audios ficticios, Chrome real con micrófono simulado):** 4 dictados transcritos sin ninguna solicitud externa ni violación de CSP. La primera carga, con descarga del modelo, tardó entre 9,6 y 16,8 s y el pico de memoria del navegador fue de 1,27 a 1,32 GB. Un dictado con órdenes ficticias dentro del texto se transcribió tal cual y no se ejecutó nada.
* **Privacidad:** solo hay dos `fetch` en la aplicación, ambos al propio sitio (manifiesto y fragmentos del modelo); no hay `XMLHttpRequest`, `sendBeacon`, `WebSocket` ni `EventSource`. Con la IA local, `connect-src 'self'` impide enviar datos fuera. El tráfico interno del navegador cuando se usa el motor de Chrome no es observable desde la página, por lo que no se afirma ausencia absoluta de envíos con ese motor.
* **Cifrado:** AES-GCM de 256 bits con PBKDF2-SHA-256 (600 000 iteraciones); activar, bloquear, contraseña incorrecta, datos alterados y migración están cubiertos por pruebas. El cifrado no protege frente a XSS, dispositivo comprometido o navegador desbloqueado.
* **Dependencias:** sin paquetes npm; `docx` 8.5.0 y ONNX Runtime Web 1.22.0 van incluidos en el repositorio. No se encontraron avisos de seguridad para ONNX Runtime Web 1.22.0 y no hubo resultados concluyentes para `docx` 8.5.0.

**No ejecutado o no verificado:** prueba en un teléfono Android físico, apertura de un `.docx` real y del diálogo de impresión real, comportamiento con poca memoria y uso de CPU, comparación reproducible con el motor de Chrome, la cuota de despliegues de Cloudflare y los fallos de descarga del modelo contra Cloudflare (verificados solo en local y en integración continua).

### Problemas pendientes

* **Precisión médica:** la IA local confunde nombres de fármacos y algunos términos (en la auditoría, "enalapril" salió como "al april", "losartán" como "los hartán" y "cefalea" como "sefalea"). En los 40 audios sintéticos de `evaluacion/INFORME.md` tuvo 12,4 % de error de palabras y 73,9 % de términos médicos exactos; con voz real puede ser peor. No se afirma que sea más precisa que el motor de Chrome. Toda transcripción debe revisarse antes de usarse con fines clínicos.
* **Consumo de memoria:** unos 1,3 GB de pico total en Chrome de escritorio, lo que puede ser demasiado para teléfonos con poca memoria.
* **Compatibilidad con Android:** no se ha probado en un teléfono Android físico; solo hay emulación móvil en Chrome de escritorio.
* **GitHub Pages:** protecciones HTTP menores, como se explicó arriba.
* **Cloudflare, de bajo riesgo:** las rutas inexistentes devuelven `index.html` con código 200, se envía `Access-Control-Allow-Origin: *` (valor por defecto de Pages; los archivos son públicos y llevan `Cross-Origin-Resource-Policy: same-origin`), el HSTS no incluye `includeSubDomains` ni `preload` y el manifiesto web y los fragmentos del modelo salen sin `Content-Type`.
* **Pruebas en Windows:** algunas ejecuciones con navegador se cuelgan a veces al abrir Chrome; al repetirlas solas pasan.

## Beneficios

* Reduce el tiempo dedicado a la documentación clínica.
* Permite registrar información mediante dictado por voz.
* Facilita la organización de registros médicos.
* Genera documentos listos para compartir, imprimir o archivar.
* Funciona directamente desde el navegador sin necesidad de instalación.

## Estado del proyecto

🟢 Versión 2.2.2 publicada en Cloudflare Pages y en GitHub Pages, en desarrollo activo.

Actualmente MediVoz permite realizar transcripciones médicas por voz, gestionar un historial local de registros y exportar registros individuales a documentos Word para facilitar el trabajo administrativo y clínico.

## Acceso

🌐 Sitio web principal (Cloudflare Pages):

https://medivoz-chiguin.pages.dev/

🌐 Sitio alternativo (GitHub Pages):

https://jstchiguin.github.io/MediVoz/

## Autor

**Chiguin Chiang**

Proyecto desarrollado como iniciativa personal para apoyar y optimizar procesos de documentación clínica mediante herramientas web y reconocimiento de voz.
