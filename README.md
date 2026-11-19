# 🩺 MediVoz

**Versión 2.0.0**

MediVoz es una aplicación web de transcripción médica por voz desarrollada para facilitar el registro de información clínica de manera rápida y sencilla.

El proyecto nació a partir de una necesidad real observada en el entorno hospitalario: reducir el tiempo destinado a escribir o transcribir información después de una atención médica, permitiendo que el profesional pueda concentrarse más en el paciente y menos en el teclado.

## Funcionalidades

* 🎤 Reconocimiento de voz en tiempo real.
* 📝 Transcripción automática de texto.
* 👨‍⚕️ Selección de médico tratante.
* 👤 Registro de paciente asociado a la transcripción.
* ✏️ Edición manual de registros.
* 💾 Almacenamiento local de historial.
* 📋 Copiado rápido al portapapeles.
* 📄 Exportación individual a Word (.docx).
* 📚 Exportación completa del historial a Word (.docx).
* 🖨️ Impresión individual de registros.
* 🖨️ Impresión completa del historial.
* 🗑️ Eliminación individual de registros.
* 🗑️ Eliminación completa del historial.
* 📱 Compatibilidad con computadores, tablets y dispositivos móviles.

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

La versión se define una sola vez en `js/config.js`. La firma flotante `by Chiguin` con la versión debajo se muestra en la esquina inferior derecha mediante el elemento `<firma-medivoz>`, que lee sus datos de esa configuración. Para publicar una nueva versión basta con cambiar `version` en `js/config.js` y actualizar la versión esperada en `tests/firma.test.js`.

## Pruebas

Requieren Node.js 22 o superior y Chrome o Edge instalado (se puede indicar otro ejecutable con la variable `CHROME_PATH`). No usan dependencias externas.

```bash
npm test
```

* `tests/firma.test.js`: protege la firma. Falla si cambia el texto `by Chiguin` (cualquier carácter, espacio o mayúscula), si se oculta, si deja de ser fija, si sale de la esquina inferior derecha, si la versión no es `2.0.0` o si se duplica. Se ejecuta en escritorio y móvil.
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

Actualmente MediVoz permite realizar transcripciones médicas por voz, gestionar un historial local de registros y exportar información a documentos Word para facilitar el trabajo administrativo y clínico.

## Próximas mejoras

* 🔍 Búsqueda de registros por paciente.
* 📅 Filtros por fecha y profesional.
* ☁️ Respaldo y sincronización en la nube.
* 🤖 Integración con inteligencia artificial para asistencia en documentación clínica.
* 📊 Estadísticas y métricas de uso.
* 🎨 Personalización de plantillas de exportación.

## Acceso

🌐 Sitio web:

https://jstchiguin.github.io/MediVoz/

## Autor

**Chiguin Chiang**

Proyecto desarrollado como iniciativa personal para apoyar y optimizar procesos de documentación clínica mediante herramientas web y reconocimiento de voz.
