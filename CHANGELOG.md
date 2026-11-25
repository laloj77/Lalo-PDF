# Changelog

Todos los cambios notables de **Lalo PDF** se documentan en este archivo.

El formato está basado en [Keep a Changelog](https://keepachangelog.com/es/1.1.0/)
y el proyecto sigue [Semantic Versioning](https://semver.org/lang/es/).

## [Sin publicar]

## [0.2.5] - 2026-11-25

### Añadido

- **Anotaciones editables nativas:** guardar elementos dibujados como anotaciones PDF reales (`/Annots`) y restaurarlos como editables al reabrir el PDF.
- **Mejoras en el cuadro de texto:**
  - Tamaños `8` y `9`, **negrita**, **cursiva**, **subrayado** y **tachado**.
  - Alineación (izquierda, centro, derecha) y borde personalizable (color, 4 grosores visuales `1–4 px` y esquinas rectas o redondeadas).
  - Vista previa en tiempo real dentro del propio cuadro al editar y menú contextual con botón derecho (*Color*, *Tipo de texto / Tamaño*, *Alineación*, *Borde*).
  - Icono `A` para la herramienta de texto.

## [0.2.2] - 2026-11-25

### Añadido

- **Firma manuscrita:** dibujar o escribir una firma, guardarla localmente (`localStorage` + diálogo para elegir dónde guardar el `.png`), colocarla sobre el PDF, moverla, redimensionarla y ajustar su opacidad.
- **Marca de agua:** soporte de texto e imagen/logo con tamaño, rotación y opacidad personalizables y vista previa en tiempo real al mover los sliders.
- **Menú contextual en miniaturas:** clic derecho sobre una o varias miniaturas para *Exportar como…* (PDF, JPEG o PNG), *Duplicar*, *Rotar*, *Insertar página en blanco* o *Eliminar*. Arrastrar con el botón derecho fuera de la ventana abre directamente el diálogo de exportación.
- **Exportar a JPEG (`.jpg`):** añadido al menú desplegable del botón **Exportar**.

### Corregido

- Contraste de los desplegables nativos (`select option`) en modo oscuro en Windows.

## [0.2.1] - 2026-11-25

### Añadido

- **Menú desplegable en Exportar:** al pulsar **Exportar** se despliegan las opciones **Imágenes PNG (`.png`)** y **Microsoft Word (`.docx`)** (también disponible desde *Archivo → Exportar a Word (.docx)…*).
- **Exportación a Microsoft Word (`.docx`):** extracción de texto con formato (tamaño, negrita y cursiva) e imágenes incrustadas de cada página usando `docx`.

## [0.2.0] - 2026-11-24

### Añadido

- **Protección por contraseña y permisos** (`@cantoo/pdf-lib`):
  - Abrir PDFs protegidos por contraseña con diálogo de desbloqueo.
  - Guardar/exportar estableciendo contraseña de apertura, contraseña de permisos y restricciones (impresión en alta/baja/prohibida, modificación, copia y anotaciones) desde el botón **Proteger** o *Archivo → Protección y permisos…* (`Ctrl+Shift+L`).
- **Selección y copia de texto:** capa de texto seleccionable sobre las páginas con soporte de `Ctrl+C`, *Edición → Copiar* y menú contextual con clic derecho.
- **Selección y extracción de imágenes del PDF:** clic sobre imágenes incrustadas para seleccionarlas, arrastrarlas fuera de la ventana para guardarlas como `.jpg`, o clic derecho para **Copiar imagen** y **Guardar imagen como…** en formato **JPG**, **PNG**, **WebP** o **PDF**.
- **Selector de zoom editable:** desplegable rápido (`35 %` a `170 %` y *Ajustar*) y entrada directa del porcentaje en la barra de herramientas.
- **Versión visible** en la esquina inferior derecha de la barra de estado.

### Corregido

- Arrastrar y soltar PDFs sobre la pantalla de inicio vacía y sobre la barra lateral de miniaturas en Windows (`dropEffect = 'copy'` y `preventDefault` en `dragenter`).

## [0.1.3] - 2026-11-24

### Corregido

- Cierre definitivo en Windows: se oculta la ventana inmediatamente al cerrar, los
  temporizadores de salida usan `.unref()` y escalan a `app.exit(0)` (600 ms) y
  `process.exit(0)` (1200 ms) para evitar procesos `electron.exe` / `Lalo PDF.exe`
  colgados en segundo plano.
- Control de instancia única (`requestSingleInstanceLock` + `second-instance`) para
  enfocar la ventana existente o abrir un PDF sin bloquear `userData`.

## [0.1.2] - 2026-11-22

### Corregido

- Cierre/reapertura en Windows: el temporizador de salida forzada usaba `unref()`
  y podía no ejecutarse durante el apagado, dejando el proceso vivo y sin ventana
  al volver a abrir. Ahora la red de seguridad se arma desde `close`,
  `window-all-closed` y `before-quit`, y se limpian los temporales en `will-quit`.

## [0.1.1] - 2026-11-22

### Añadido

- Botón **«Guardar como…»** visible en la barra de herramientas (también
  disponible en *Archivo* y con `Ctrl+Shift+S`).

### Cambiado

- El nombre de la aplicación pasa a ser **Lalo PDF** en todas partes: título de la
  ventana, menús, «Acerca de», pantalla de inicio, nombre del producto y acceso
  directo de Windows. El proceso del Administrador de tareas también se llama
  **Lalo PDF**.

### Corregido

- Los botones de minimizar, maximizar y cerrar de Windows ahora siguen el tema
  del sistema: iconos claros sobre fondo oscuro cuando Windows está en modo
  oscuro, y oscuros sobre fondo claro en modo claro. El cambio de tema en caliente
  también se aplica sin reiniciar.
- El proceso de Windows ya no queda vivo en el Administrador de tareas al cerrar
  la ventana: se limpian los temporales y se fuerza la salida si el cierre
  ordenado se bloquea, de modo que la app se puede volver a abrir.

## [0.1.0] - 2026-11-22

Primera versión. Aplicación de escritorio para **Windows** de visor, editor y
organizador de PDF, inspirada en **Preview** de macOS y construida con
Electron + pdf.js + pdf-lib.

### Añadido

**Abrir y organizar**

- Abrir PDFs desde el menú, arrastrándolos a la ventana o mediante «Abrir con».
- Añadir/combinar varios PDFs y añadir imágenes como páginas.
- Reordenar páginas arrastrando las miniaturas de la barra lateral.
- Duplicar páginas, insertar una página en blanco y eliminar páginas.
- Deshacer y rehacer todas las operaciones de organización.

**Arrastrar fuera de la app**

- Al arrastrar una miniatura (o varias seleccionadas) fuera de la ventana se
  genera automáticamente un **PDF real** con un nombre legible, por ejemplo
  `documento - página 3.pdf`, listo para soltar en el escritorio o el Explorador.

**Ver**

- Tres modos de vista: continua, una página y dos páginas.
- Zoom (acercar, alejar, tamaño real y ajustar a la ventana) y rotar a la
  izquierda o a la derecha.
- Barra lateral de miniaturas (mostrar/ocultar) y modo pantalla completa.

**Anotar y editar**

- Herramientas: seleccionar, resaltador, lápiz, rectángulo, círculo/elipse,
  línea, flecha, cuadro de texto y borrador.
- 5 colores, 3 grosores de línea y 7 tamaños de fuente.
- Las formas y los cuadros de texto se pueden **mover y redimensionar**; el texto
  se edita con doble clic y se aplica con `Ctrl+Enter`.
- Las anotaciones se **aplanan sobre el PDF** al guardar o exportar, de modo que
  se ven igual en cualquier visor.

**Buscar, guardar y salida**

- Buscar texto en el documento y saltar entre coincidencias.
- Guardar sobre el archivo abierto y «Guardar como…», con guardado atómico,
  avisos claros de error y extensión `.pdf` garantizada.
- Exportar cada página como imagen PNG.
- Imprimir (`Ctrl+P`) el documento tal como se ve —con los cambios y las
  anotaciones— con el tamaño de hoja ajustado a cada página. En Windows se
  puede elegir «Microsoft Print to PDF» para guardar una copia.

**Interfaz y distribución**

- Interfaz inspirada en Preview, con barra de título de Windows, menús
  (Archivo, Edición, Ver, Herramientas, Ayuda), atajos de teclado y cuadro
  «Acerca de».
- Instalador NSIS y versión portable de 64 bits para Windows, con icono y
  asociación de archivos.
- Pruebas de humo automatizadas para guardado, errores, anotaciones, formas,
  arrastrar fuera, reordenar e imprimir.

<!--
Notas para futuras versiones:
- Cada cambio se escribe primero en [Sin publicar].
- Al publicar, se renombra a su versión con la fecha y se crea una etiqueta git,
  p. ej. git tag -a v0.1.0 -m "Primera versión".
-->
