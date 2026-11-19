# 🩺 MediVoz

**Versión 2.1.0**

MediVoz es una aplicación web de transcripción médica por voz desarrollada para facilitar el registro de información clínica de manera rápida y sencilla.

El proyecto nació a partir de una necesidad real observada en el entorno hospitalario: reducir el tiempo destinado a escribir o transcribir información después de una atención médica, permitiendo que el profesional pueda concentrarse más en el paciente y menos en el teclado.

## Funcionalidades

* 🎤 Reconocimiento de voz en español de Chile (Web Speech API), con inicio y detención del micrófono.
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
* Web Speech API
* LocalStorage y Web Crypto API (AES-GCM)
* Docx.js 8.5.0 (incluido en el repositorio, sin CDN)
* GitHub Pages

## Estructura del proyecto

```text
MediVoz/
├── index.html            Estructura HTML
├── css/
│   ├── styles.css        Estilos, incluida la firma flotante
│   ├── fuentes.css       Tipografías locales (sin Google Fonts)
│   ├── fuentes/          Archivos woff2
│   └── impresion.css     Estilos de la ventana de impresión
├── js/
│   ├── config.js         Configuración central (versión 2.1.0 y texto de la firma)
│   ├── medicos.js        Administrador de médicos (lista editable)
│   ├── almacen-seguro.js Almacenamiento del historial y cifrado opcional
│   ├── panel-seguridad.js Panel de seguridad y privacidad
│   ├── vendor/           Dependencias con versión fija
│   └── script.js         Comportamiento de la aplicación y firma flotante
├── tests/                Pruebas automatizadas
├── .github/workflows/    Ejecución de pruebas en GitHub Actions
├── V1                    Versión histórica
└── README.md
```

Todas las rutas son relativas, por lo que el sitio funciona sin cambios en GitHub Pages.

## Instalación y uso

MediVoz no requiere instalación ni dependencias.

* En línea: https://jstchiguin.github.io/MediVoz/
* Local: servir la carpeta con cualquier servidor estático (por ejemplo `node -e "require('./tests/servidor-estatico').iniciarServidor(8080).then(s => console.log(s.url))"`) y abrir la dirección en Chrome o Edge.
* El reconocimiento de voz (español de Chile) requiere Chrome o Edge y permiso de micrófono.

## Administración de médicos

El botón ⚙️ junto al selector abre el administrador de médicos. La lista no viene escrita en el código: se guarda en `localStorage` bajo la clave `mediVozMedicos`, por lo que pertenece a cada navegador y dispositivo y no se sincroniza entre ellos. Si la clave no existe y ya hay un historial guardado, la lista inicial se arma con los nombres de médico de esos registros, sin modificarlos.

## Versión y firma

La versión se define una sola vez en `js/config.js`. La firma flotante `by Chiguin` con la versión debajo se muestra en la esquina inferior derecha mediante el elemento `<firma-medivoz>`, que lee sus datos de esa configuración. En pantallas de hasta 1100 px de ancho la página se desplaza de forma natural y una franja inferior opaca reservada para la firma evita que ésta se superponga a botones o controles; el contenido siempre es alcanzable gracias a un margen inferior equivalente. Para publicar una nueva versión basta con cambiar `version` en `js/config.js` y actualizar la versión esperada en `tests/firma.test.js`.

## Pruebas

Requieren Node.js 22 o superior y Chrome o Edge instalado (se puede indicar otro ejecutable con la variable `CHROME_PATH`). No usan dependencias externas.

```bash
npm test
```

* `tests/firma.test.js`: protege la firma. Falla si cambia el texto `by Chiguin` (cualquier carácter, espacio o mayúscula), si se oculta, si deja de ser fija, si sale de la esquina inferior derecha, si la versión no es `2.1.0` o si se duplica. Se ejecuta en escritorio y móvil, y recorre todo el scroll en 12 resoluciones (de 320x568 a 1366x768) comprobando que la firma no se superponga a botones, campos ni contenido.
* `tests/movil.test.js`: en Chrome con emulación móvil (320 a 412 px de ancho) verifica el desplazamiento vertical de toda la página, que la tarjeta no recorte contenido, que transcripciones extensas se puedan leer completas, que los botones se adapten sin desplazamiento horizontal, el acceso al historial, el dictado simulado y una altura reducida que simula el teclado virtual.
* `tests/medicos.test.js`: verifica que no haya médicos en el código, el aviso de lista vacía, agregar, editar, eliminar con confirmación, validaciones, orden alfabético, persistencia al recargar, la protección de los registros históricos y el panel en móviles.
* `tests/funcionalidad.test.js`: verifica el reconocimiento de voz simulado, el temporizador, la recuperación de grabación, el guardado, el historial local, la edición, la eliminación, la exportación a Word y la impresión.

Las pruebas usan exclusivamente datos ficticios. El reconocimiento de voz se simula y el teclado virtual se emula reduciendo la altura de la ventana; no sustituyen una prueba con micrófono ni teclado reales en un teléfono. Las pruebas también se ejecutan en GitHub Actions en cada push a `develop`, `feature/**` o `seguridad/**` y en cada pull request.

## Seguridad y privacidad

* **Contenido no confiable:** lo dictado, escrito, pegado o leído del almacenamiento se trata siempre como texto. No se usa `innerHTML`, `eval`, `new Function` ni controladores en línea; la ventana de impresión escapa cada campo. Al pegar en la transcripción solo se inserta texto plano.
* **Política de seguridad de contenido (CSP):** declarada en `index.html` con `default-src 'none'`, scripts y estilos solo del propio origen y `connect-src 'none'`. Al estar en una etiqueta `<meta>` (GitHub Pages no permite cabeceras propias) no puede incluir `frame-ancestors`, por lo que la protección contra incrustación en otros sitios no está cubierta.
* **Sin recursos externos:** las tipografías y `docx` se sirven desde el repositorio; `docx` está fijado por hash SHA-384 en las pruebas. MediVoz no tiene servicios de analítica ni de seguimiento y no envía datos a servidores propios o de terceros.
* **Reconocimiento de voz:** usa la Web Speech API del navegador. En Chrome el audio puede enviarse a los servicios de Google; la aplicación lo indica en pantalla. Eso queda fuera del control de MediVoz.
* **Sin IA generativa:** MediVoz no incluye ningún modelo, agente ni herramienta ejecutable conectada a lo dictado. Una frase dictada nunca se interpreta como instrucción: la protección frente a la inyección de prompts es estructural (no hay intérprete) y no depende de detectar palabras sospechosas.
* **Historial cifrado (opcional):** el botón 🔒 Seguridad permite cifrarlo con AES-GCM de 256 bits; la clave se deriva de una contraseña con PBKDF2-SHA-256 (600 000 iteraciones, sal aleatoria por activación y vector nuevo en cada escritura). La contraseña no se guarda ni existe clave fija en el código; la clave derivada vive solo en memoria, no es exportable y se descarta al bloquear. Si se pierde la contraseña, los datos no se pueden recuperar y solo se pueden borrar. El historial se bloquea tras 10 minutos sin actividad (no mientras se graba). La activación migra el historial existente y borra la copia sin cifrar solo después de verificar que se descifra idéntico. También es posible dejar de guardar el historial en el dispositivo, exportar una copia JSON (sin cifrar, solo a petición) y quitar el cifrado.
* **Datos que quedan en el dispositivo:** historial (cifrado o no), lista de médicos y ajustes, en `localStorage` del navegador. La lista de médicos y los ajustes no se cifran. No se guardan grabaciones.
* **Origen compartido en GitHub Pages:** todas las páginas de proyecto bajo `jstchiguin.github.io` comparten el mismo origen y por tanto el mismo `localStorage`. Otra aplicación del mismo usuario podría leer el historial sin cifrar; el cifrado con contraseña mitiga esto. El aislamiento completo requiere un origen propio (por ejemplo un dominio personalizado, que puede tener costo).

## Pruebas de seguridad

* `tests/estatico.test.js`: auditoría del código (construcciones prohibidas, ausencia de comentarios, CSP restrictiva, sin recursos externos, hash de `docx`, permisos y acciones fijadas por commit en GitHub Actions, ausencia de credenciales, audio o exportaciones en el repositorio).
* `tests/cifrado.test.js`: cifrado, descifrado, bloqueo, contraseña incorrecta, datos alterados, migración sin pérdida, fallo durante la migración, inactividad, guardado desactivado y exportación.
* `tests/inyeccion.test.js`: 14 cargas hostiles ficticias (instrucciones en español, suplantación de mensajes del sistema, HTML y scripts mezclados con términos médicos) por dictado, almacenamiento alterado y pegado, y verificación de que la CSP bloquea scripts en línea, `eval` y solicitudes de red inyectadas.
* `tests/privacidad.test.js`: registra todas las solicitudes de red en un flujo completo (dictar, guardar, copiar, imprimir, Word, cifrar, bloquear) y comprueba que ninguna sale del origen ni contiene datos clínicos, además del funcionamiento sin conexión una vez cargada la página.
* `tests/movil-seguridad.test.js`: diseño del panel y de la firma en 320, 390 y 412 px, y tiempos con CPU limitada 4 veces. Es una emulación en un Chrome de escritorio: no sustituye una prueba en un teléfono Android real.

## Beneficios

* Reduce el tiempo dedicado a la documentación clínica.
* Permite registrar información mediante dictado por voz.
* Facilita la organización de registros médicos.
* Genera documentos listos para compartir, imprimir o archivar.
* Funciona directamente desde el navegador sin necesidad de instalación.

## Estado del proyecto

🟢 Versión 2.1.0 funcional en desarrollo activo.

Actualmente MediVoz permite realizar transcripciones médicas por voz, gestionar un historial local de registros y exportar registros individuales a documentos Word para facilitar el trabajo administrativo y clínico.

## Acceso

🌐 Sitio web:

https://jstchiguin.github.io/MediVoz/

## Autor

**Chiguin Chiang**

Proyecto desarrollado como iniciativa personal para apoyar y optimizar procesos de documentación clínica mediante herramientas web y reconocimiento de voz.
