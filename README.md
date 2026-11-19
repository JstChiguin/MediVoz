# 🩺 MediVoz

**Versión 2.0.0**

MediVoz es una aplicación web de transcripción médica por voz desarrollada para facilitar el registro de información clínica de manera rápida y sencilla.

El proyecto nació a partir de una necesidad real observada en el entorno hospitalario: reducir el tiempo destinado a escribir o transcribir información después de una atención médica, permitiendo que el profesional pueda concentrarse más en el paciente y menos en el teclado.

## Funcionalidades

* 🎤 Reconocimiento de voz en español de Chile (Web Speech API), con inicio y detención del micrófono.
* ⏱️ Temporizador de grabación y reinicio automático del reconocimiento cuando el servicio de voz se corta.
* 📝 Transcripción automática y edición manual del texto antes de guardar.
* 👨‍⚕️ Selección del médico tratante desde una lista.
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

## Versión y firma

La versión se define una sola vez en `js/config.js`. La firma flotante `by Chiguin` con la versión debajo se muestra en la esquina inferior derecha mediante el elemento `<firma-medivoz>`, que lee sus datos de esa configuración. En pantallas de hasta 1100 px de ancho el contenido se desplaza dentro de un área que termina sobre una franja inferior reservada, de modo que la firma nunca se superpone a botones ni controles. Para publicar una nueva versión basta con cambiar `version` en `js/config.js` y actualizar la versión esperada en `tests/firma.test.js`.

## Pruebas

Requieren Node.js 22 o superior y Chrome o Edge instalado (se puede indicar otro ejecutable con la variable `CHROME_PATH`). No usan dependencias externas.

```bash
npm test
```

* `tests/firma.test.js`: protege la firma. Falla si cambia el texto `by Chiguin` (cualquier carácter, espacio o mayúscula), si se oculta, si deja de ser fija, si sale de la esquina inferior derecha, si la versión no es `2.0.0` o si se duplica. Se ejecuta en escritorio y móvil, y recorre todo el scroll en 12 resoluciones (de 320x568 a 1366x768) comprobando que la firma no se superponga a botones, campos ni contenido.
* `tests/funcionalidad.test.js`: verifica el reconocimiento de voz simulado, el temporizador, la recuperación de grabación, el guardado, el historial local, la edición, la eliminación, la exportación a Word y la impresión.

Las pruebas usan exclusivamente datos ficticios. Las pruebas también se ejecutan en GitHub Actions en cada push a `develop` o a ramas `feature/**` y en cada pull request.

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
