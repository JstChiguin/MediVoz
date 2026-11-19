# 🩺 MediVoz

**Versión 2.0.0**

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
* LocalStorage
* Docx.js
* GitHub Pages

## Estructura del proyecto

```text
MediVoz/
├── index.html            Estructura HTML
├── css/
│   └── styles.css        Todos los estilos, incluida la firma flotante
├── js/
│   ├── config.js         Configuración central (versión 2.0.0 y texto de la firma)
│   ├── medicos.js        Administrador de médicos (lista editable)
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

* `tests/firma.test.js`: protege la firma. Falla si cambia el texto `by Chiguin` (cualquier carácter, espacio o mayúscula), si se oculta, si deja de ser fija, si sale de la esquina inferior derecha, si la versión no es `2.0.0` o si se duplica. Se ejecuta en escritorio y móvil, y recorre todo el scroll en 12 resoluciones (de 320x568 a 1366x768) comprobando que la firma no se superponga a botones, campos ni contenido.
* `tests/movil.test.js`: en Chrome con emulación móvil (320 a 412 px de ancho) verifica el desplazamiento vertical de toda la página, que la tarjeta no recorte contenido, que transcripciones extensas se puedan leer completas, que los botones se adapten sin desplazamiento horizontal, el acceso al historial, el dictado simulado y una altura reducida que simula el teclado virtual.
* `tests/medicos.test.js`: verifica que no haya médicos en el código, el aviso de lista vacía, agregar, editar, eliminar con confirmación, validaciones, orden alfabético, persistencia al recargar, la protección de los registros históricos y el panel en móviles.
* `tests/funcionalidad.test.js`: verifica el reconocimiento de voz simulado, el temporizador, la recuperación de grabación, el guardado, el historial local, la edición, la eliminación, la exportación a Word y la impresión.

Las pruebas usan exclusivamente datos ficticios. El reconocimiento de voz se simula y el teclado virtual se emula reduciendo la altura de la ventana; no sustituyen una prueba con micrófono ni teclado reales en un teléfono. Las pruebas también se ejecutan en GitHub Actions en cada push a `develop` o a ramas `feature/**` y en cada pull request.

## Beneficios

* Reduce el tiempo dedicado a la documentación clínica.
* Permite registrar información mediante dictado por voz.
* Facilita la organización de registros médicos.
* Genera documentos listos para compartir, imprimir o archivar.
* Funciona directamente desde el navegador sin necesidad de instalación.

## Estado del proyecto

🟢 Versión 2.0.0 funcional en desarrollo activo.

Actualmente MediVoz permite realizar transcripciones médicas por voz, gestionar un historial local de registros y exportar registros individuales a documentos Word para facilitar el trabajo administrativo y clínico.

## Acceso

🌐 Sitio web:

https://jstchiguin.github.io/MediVoz/

## Autor

**Chiguin Chiang**

Proyecto desarrollado como iniciativa personal para apoyar y optimizar procesos de documentación clínica mediante herramientas web y reconocimiento de voz.
