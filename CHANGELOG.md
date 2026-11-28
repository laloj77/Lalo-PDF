# Changelog

Todos los cambios notables de **Lalo PDF** se documentan en este archivo.

El formato está basado en [Keep a Changelog](https://keepachangelog.com/es/1.1.0/)
y el proyecto sigue [Semantic Versioning](https://semver.org/lang/es/).

## [Sin publicar]

## [0.9.4] - 2026-11-28

### Añadido

- **Marca de agua personalizable:** añadidos deslizadores de posición **X / Y (%)** con vista previa en tiempo real y selector de alcance (**Todas las páginas**, **Solo página actual** o **Páginas seleccionadas**).
- **Color de fuente en cuadro de texto:** selector nativo de color (`#te-color`) junto al tamaño de la letra en el editor de texto.
- **Mover y copiar/pegar figuras:** arrastrar figuras/anotaciones con el botón derecho del ratón (con margen ampliado a `14 px` en líneas y flechas) y copiar/pegar con `Ctrl+C` / `Ctrl+V`.
- **Aplicar recorte con Intro:** el modal de Recortar se puede confirmar pulsando `Enter`.

### Corregido

- **Deshacer Recortar:** `applyCropAndNormalize` ya no limpia `state.sources`, permitiendo deshacer el recorte.
- **Arrastrar PDF con otro abierto:** abre el nuevo PDF en una pestaña nueva salvo si se suelta en la barra de miniaturas (donde se añade al final).
- **Herramienta de figuras:** tras dibujar una figura se mantiene la herramienta activa en lugar de volver a "Seleccionar".
- **Márgenes internos del cuadro de texto:** añadido margen interior horizontal y superior para que el texto no toque el borde.

## [0.9.3] - 2026-11-28

### Mejorado

- **Modularización inicial (`src/modules/`):**
  - Creado [src/modules/utils.js](src/modules/utils.js) (`window.LaloUtils`: `clamp`, `escapeHtml`).
  - Creado [src/modules/tools-menu.js](src/modules/tools-menu.js) (`window.LaloToolsMenu`: `bindToolsMenu`).
  - Cargados en [src/index.html](src/index.html) antes de [src/app.js](src/app.js), estableciendo la base modular sin alterar el comportamiento del visor.

## [0.9.2] - 2026-11-28

### Mejorado

- **Rendimiento y memoria ([src/app.js](src/app.js)):**
  - Liberación automática de los canvases de páginas que salen del área visible (`IntersectionObserver` + `__unload`), reduciendo drásticamente el consumo de RAM/GPU en PDFs largos.
  - Eliminada copia duplicada `file.bytes.slice()` al abrir el segundo documento en **Comparar PDFs**.

## [0.9.1] - 2026-11-28

### Mejorado

- **Tamaño del instalador y empaquetado:** activada `compression: "maximum"` en `electron-builder` y excluidos archivos innecesarios en producción (`.map`, `.d.ts`, `README`, `test/`, `docs/`, `pdfjs-dist/legacy`, `pdfjs-dist/web`, `pdf-lib/umd`, `pdf-lib/es`).
- **Plan de pruebas ([docs/TESTING.md](docs/TESTING.md)):** esquematizado por bloques (`A`–`F`) y apartados numerados cubriendo todas las funciones de la aplicación.

## [0.9.0] - 2026-11-27

### Mejorado

- **Roadmap:** añadidos los 3 puntos de optimización (rendimiento/memoria, modularización de `src/app.js` y tamaño en disco) en *Prioridad 4*, y marcados como completados *Comparar dos PDFs* y *Certificado / Firma digital criptográfica (`.pfx` / `.p12`)*.

### Corregido

- Restaurado el arrastre de la ventana desde la barra superior (evitando que los contenedores `.tb-left`, `.tb-center` y `.tb-right` bloqueen el movimiento de la ventana).

## [0.8.9] - 2026-11-27

### Añadido

- **Firma digital con certificado `.pfx` / `.p12`:** nueva herramienta para firmar criptográficamente el PDF con certificado personal, contraseña y motivo opcional, guardando el archivo `_firmado.pdf`.
- **Menú desplegable Herramientas ▾:** agrupa *Dividir*, *Comprimir*, *Recortar*, *Comparar*, *OCR* y *Firmar (.pfx)* en la barra superior para evitar solapamientos.
- **Separadores reordenables:** los separadores de las barras de herramientas ahora también se pueden arrastrar y guardar en su nueva posición.

### Cambiado

- Movidos **Deshacer** y **Rehacer** a la barra superior junto a **Herramientas ▾**, y eliminados de la barra lateral derecha.

## [0.8.8] - 2026-11-27

### Añadido

- **Comparar dos PDFs:** nuevo botón **Comparar** en la barra de herramientas para abrir un segundo PDF y compararlo con el documento actual página a página:
  - Vista **Lado a lado** (diferencias resaltadas en rojo en A y verde en B) y vista **Superpuesto**.
  - Panel lateral con porcentaje de píxeles distintos y diff de texto palabra a palabra (`<del>` / `<ins>`).
  - Navegación por páginas (`←` / `→`, `Esc` para cerrar) y chips de página que marcan en rojo las páginas con diferencias de texto.

### Corregido

- Colisión de nombre `paintOverlay` en el visor al añadir la vista de comparación.
- Estilos de `#compare-modal` (variables de tema, margen para controles de ventana en Windows y ancho automático en los botones de modo).

## [0.8.7] - 2026-11-27

### Añadido

- **Recortar y normalizar páginas:** nuevo botón **Recortar** en la barra de herramientas con modal que permite recortar márgenes (superior, inferior, izquierdo, derecho en mm) con vista previa, normalizar el tamaño a A4 (210 × 297 mm) y aplicarlo a todas las páginas, la actual o las seleccionadas. Compatible con deshacer.
- **Roadmap:** añadidos *Comparar dos PDFs* y *Firma digital con certificado .pfx/.p12*.

### Corregido

- El modal Recortar no se mostraba al pulsar el botón (faltaban estilos de overlay).
- Campos, desplegable y pie del modal Recortar con estilos coherentes (Cancelar a la izquierda, Aplicar a la derecha).
- Los desplegables nativos se veían con fondo blanco y texto ilegible en tema oscuro; ahora respetan el `color-scheme` del tema.

## [0.8.6] - 2026-11-27

### Mejorado

- **Icono y marca en la interfaz:**
  - Refinado el icono principal ([build/icon.png](file:///home/antigravity/laloj77/Lalo-PDF/build/icon.png), [build/icon.ico](file:///home/antigravity/laloj77/Lalo-PDF/build/icon.ico) y [src/icon.png](file:///home/antigravity/laloj77/Lalo-PDF/src/icon.png)) haciendo el lado derecho de la hoja más translúcido para que la `L` destaque con claridad.
  - Añadido el icono (`28×28 px`) y el nombre **Lalo PDF** en la esquina superior izquierda de la barra de herramientas, siempre visible.

## [0.8.5] - 2026-11-27

### Cambiado

- **Nuevo icono de la aplicación (estilo Apple):** actualizado el icono principal ([build/icon.png](file:///home/antigravity/laloj77/Lalo-PDF/build/icon.png) y [build/icon.ico](file:///home/antigravity/laloj77/Lalo-PDF/build/icon.ico)) al diseño minimalista *Monograma L en cinta* sobre fondo cerámico claro.

## [0.8.4] - 2026-11-27

### Corregido

- **Abrir PDFs en nueva pestaña al hacer doble clic:** corregida la llamada a [`createNewTab()`](file:///home/antigravity/laloj77/Lalo-PDF/src/app.js#L6203) en el manejador `open-file` (en lugar de `newBlankTab()`), permitiendo abrir otro PDF en una pestaña nueva sin necesidad de crearla manualmente antes.

## [0.8.3] - 2026-11-27

### Mejorado

- **Abrir PDFs en nueva pestaña al hacer doble clic:** si ya hay un documento abierto en Lalo PDF y se abre otro PDF desde el explorador (doble clic), se abre automáticamente en una nueva pestaña (o cambia a su pestaña si ya estaba abierto) en lugar de reemplazar el documento actual.

## [0.8.2] - 2026-11-27

### Añadido

- **Barra de progreso minimalista al actualizar:** indicador discreto en la barra de estado (`Actualizando… XX%` / `Instalando…`) y progreso en el icono de la barra de tareas de Windows durante la descarga de actualizaciones.

### Corregido

- **Abrir PDF por defecto (doble clic en Windows):** corregido el momento en que se abre el archivo pasado por argumento al iniciar la app (`openPathInWindow` justo tras resolver `loadURL`), evitando que el evento `did-finish-load` se registrara demasiado tarde.

## [0.8.0] - 2026-11-27

### Añadido

- **Clonado fiel PDF → Word (`.docx`) con motor externo (`pdf2docx`):** integración de Python embebido (`vendor-win/python`) + `pdf2docx` en el instalador/portable de Windows (y detección automática de Python local en desarrollo) para reconstruir tablas, columnas, imágenes y diseño al exportar a Word, con respaldo automático al motor básico (`docx`) y aviso del motor usado en el toast.
- **Post-procesado de maquetación en `.docx` (`python-docx`):** compactación de márgenes superior/inferior y espaciado de párrafos para reducir saltos de página, y conversión automática de índices con líneas de puntos en tabulaciones alineadas a la derecha con relleno de puntos (`WD_TAB_LEADER.DOTS`).

### Corregido

- **Exportación de formularios rellenos (AcroForms):** aplanado de campos sobre el documento origen antes de `copyPages` para que los valores introducidos no se pierdan al exportar a PDF o Word, y normalización de tamaños de fuente desproporcionados en `/DA` tanto al aplanar como en el visor.
- **Menú de exportación y compatibilidad con Python en Windows:** corregido el recorte de `#export-menu` en `#right-rail` (`overflow: visible`) y ejecución mediante script temporal `.py` compatible con Python de Microsoft Store y lanzador `py -3`.

## [0.7.3] - 2026-11-27

### Añadido

- **Formularios (AcroForms):** rellenado interactivo de campos de texto, multilínea, casillas de verificación y desplegables directamente en el visor, con aplanado automático al guardar (`form.flatten()`) y documento de ejemplo `docs/ejemplo-formulario.pdf`.

## [0.7.2] - 2026-11-27

### Corregido

- **Scroll horizontal y alineación al hacer zoom:** en vista inicial o tras reducir con `-`, la barra horizontal desaparece automáticamente (`zoomOut` vuelve a *Ajustar* al llegar al ajuste inicial); al ampliar con zoom, `#viewer` usa `align-items: safe center` y escala de forma coherente las páginas más anchas para evitar huecos negros excesivos a la derecha.

## [0.7.1] - 2026-11-27

### Corregido

- **Esquina de scroll blanca:** ocultado el cuadrado blanco en la esquina inferior derecha del visor (`::-webkit-scrollbar-corner { background: transparent; }`).

## [0.7.0] - 2026-11-27

### Añadido

- **Redacción real (Sanitización):** nueva herramienta **Redactar / Censurar** en la barra de marcado para dibujar recuadros sobre datos sensibles y botón **Aplicar redacción** que quema los recuadros negros en la página y elimina definitivamente el texto subyacente.

## [0.6.9] - 2026-11-26

### Cambiado

- **Barra de marcado (`#markup-bar`):** acoplada justo debajo de la barra superior (`top: 0`) con animación deslizante suave (`0.36s`) tanto al aparecer como al ocultarse.

## [0.6.8] - 2026-11-26

### Añadido

- **Selector de tema claro / oscuro en vivo:** iconos de **Sol** y **Luna** en la barra vertical derecha para cambiar entre modo claro y oscuro al instante con transición gradual (`0.28s`), persistencia en `localStorage` y actualización en vivo de la barra de título de Windows.

## [0.6.7] - 2026-11-26

### Añadido

- **Botones Deshacer y Rehacer en la barra vertical derecha:** acceso directo con iconos (`btn-rail-undo`, `btn-rail-redo`) sincronizados con el historial de cambios.

### Corregido

- **Estado de Rehacer (`redo`):** sincronización de `updateUndoButtons()` en `undo()`, `redo()` y `restoreSnapshot()` para que el botón se habilite correctamente tras deshacer anotaciones.

## [0.6.5] - 2026-11-26

### Cambiado

- **Rotación fluida de páginas:** animación CSS suave (`240 ms`) al rotar páginas antes de refrescar el visor y sin mostrar el cursor de espera (`silent: true`).

## [0.6.4] - 2026-11-26

### Añadido

- **Actualizador automático desde GitHub Releases (`electron-updater`):** al abrir la app instalada comprueba si hay una nueva versión; si aceptas, la descarga, cierra la app, la instala silenciosamente y la vuelve a abrir conservando tu configuración.
- **Indicador de actualización y botón de versión:** en la esquina inferior derecha, icono de actualización en **verde** (al día) o **rojo** (actualización disponible) y botón `vX.Y.Z` que abre el proyecto en GitHub.

## [0.6.2] - 2026-11-26

### Añadido

- **Barra vertical derecha (`#right-rail`):** reubicados los iconos de herramientas (*Vistas*, *Rotar*, *Anotar*, *Buscar*, *Imprimir*, *Presentación*, *Proteger* y *Exportar*) en una barra vertical a la derecha para evitar solapamientos en ventanas estrechas, dejando la barra superior despejada para los botones de texto con separadores verticales.
- **Reordenación deslizante de barras:** arrastrar y soltar para reordenar botones en la barra superior y en la barra vertical derecha con animación fluida (FLIP) y persistencia en `localStorage`.

## [0.6.0] - 2026-11-26

### Añadido

- **OCR para documentos escaneados (`tesseract.js`):** botón **OCR** en la barra superior para reconocer texto en Español, Inglés o ambos (en todas las páginas o en la página actual) e insertar una capa de texto invisible que permite buscar con `Ctrl+F`, seleccionar y copiar texto.

### Corregido

- **Selección de texto sobre páginas escaneadas:** ajustado `z-index` de `.page-image-hit` por debajo de `.textLayer`, escalado proporcional de palabras OCR y control de `selectionchange` para evitar saltos de selección a toda la hoja.

## [0.5.7] - 2026-11-26

### Añadido

- **Pestañas multi-documento:** barra de pestañas debajo de la barra de herramientas con botón **`+`** (`Ctrl+T`), cierre (`Ctrl+W`), indicador `•` de cambios sin guardar y reordenación fluida arrastrando y soltando.
- **Documentos recientes:** lista en la pantalla de inicio con los últimos 8 PDFs abiertos para reabrirlos con un clic y botón **Limpiar**.

### Cambiado

- **Pantalla de inicio:** sustituido el icono genérico por el icono real de la app (`src/icon.png`).

## [0.5.5] - 2026-11-26

### Añadido

- **Índice / Marcadores (Tabla de contenidos):** pestañas **Páginas | Índice** en la barra lateral izquierda para navegar por los marcadores jerárquicos del PDF (con desplegables y salto directo de página) y documento de ejemplo `docs/ejemplo-indice.pdf`.

### Cambiado

- **Instalador NSIS (`perMachine: true`):** solicitud automática de permisos de administrador (UAC) al instalar en `C:\Program Files\Lalo PDF`.

## [0.5.2] - 2026-11-26

### Añadido

- **Nuevo icono propio de la app (`pdf`):** diseñado y aplicado en `build/icon.ico`, `build/icon.png` y `src/icon.png` para el ejecutable, instalador, accesos directos e interfaz de ventana en Windows.
- **Versión portable separada en GitHub Releases:** `Lalo-PDF-0.5.2-Portable-x64.exe` se publica de forma independiente junto al instalador NSIS (`Lalo-PDF-0.5.2-x64.exe`).

## [0.5.1] - 2026-11-26

### Añadido

- **Asociación de archivos `.pdf` en Windows:** configuración de `fileAssociations` en el instalador NSIS para registrar *Abrir con Lalo PDF* y permitir establecerlo como visor PDF predeterminado en Windows.

## [0.5.0] - 2026-11-26

### Cambiado

- **Lanzamiento del ejecutable e instalador de Windows (`v0.5.0`):** compilación y publicación del instalador NSIS y versión portable de 64 bits (`Lalo-PDF-0.5.0-x64.exe`) con todas las funcionalidades acumuladas hasta `v0.4.0`.

## [0.4.0] - 2026-11-25

### Añadido

- **Comprimir PDF:** botón **Comprimir** en la barra superior y *Archivo → Comprimir PDF…* con control de **Calidad JPEG** (`15%–95%`), **Resolución máxima** (`Original`, `1600 px`, `1200 px`, `800 px`) y comparativa en vivo **antes → después** con porcentaje de ahorro.
- **Opciones avanzadas de compresión** con casillas y botones `?` explicativos:
  - Eliminar metadatos y datos privados (XMP, miniaturas incrustadas, `PieceInfo`, autor/editor).
  - Aplanar anotaciones y formularios.
  - Optimizar estructura y flujos (`useObjectStreams`).
  - Convertir imágenes a escala de grises.
  - Rasterizar páginas (compresión extrema).

## [0.3.3] - 2026-11-25

### Cambiado

- Botón **Exportar** convertido a formato solo icono y reubicado a la derecha de **Proteger** en la barra superior.

## [0.3.2] - 2026-11-25

### Añadido

- **Dividir PDF:** botón **Dividir** en la barra superior y *Archivo → Dividir PDF…* para dividir el documento en varios archivos por página o por rangos (`1-3, 4-6`).

### Cambiado

- Botón **Proteger** convertido a formato solo icono y reubicado a la derecha de **Presentación**.

## [0.3.1] - 2026-11-25

### Añadido

- **Números de página:** rango *Desde/Hasta*, número inicial, posición vertical (*Cabecera* / *Pie de página*), alineación (*Izquierda* / *Centro* / *Derecha*), formato (`1, 2, 3…`, `Página 1`, `1 / N`) y tamaño personalizables con vista previa en vivo.

## [0.3.0] - 2026-11-25

### Añadido

- **Modo presentación a pantalla completa (`F5`):** botón junto a *Imprimir* y en *Ver → Modo presentación* para pasar páginas sin interfaz, con control flotante inferior (`←`, `1 / N`, `→`, `Salir`).

### Cambiado

- Botones de acción de la derecha (*Proteger*, *Exportar*, *Guardar como…*, *Guardar*) más compactos en la barra superior.

## [0.2.8] - 2026-11-25

### Añadido

- **Miniaturas redimensionables:** divisor arrastrable entre la barra lateral y el visor principal; las miniaturas se adaptan automáticamente y se renderizan a `360 px` base para mantenerse nítidas.
- **Navegación rápida:** caja `Ir a pág.` en la barra inferior para saltar directamente a cualquier número de página.

## [0.2.7] - 2026-11-25

### Cambiado

- **Diálogo de cambios sin guardar:** sustituido el cuadro nativo antiguo por un modal moderno integrado en la app (`#unsaved-modal`) adaptado al modo oscuro/claro, con las opciones *Cancelar*, *No guardar*, *Guardar como…* y *Guardar*.

## [0.2.6] - 2026-11-25

### Añadido

- **Autoguardado:** interruptor estilo iOS en la barra superior (3.ª posición a la izquierda) que guarda automáticamente tras cada edición y recuerda su estado entre sesiones.
- **Aviso de cambios sin guardar al cerrar:** diálogo nativo con las opciones *Guardar*, *Guardar como…*, *No guardar* y *Cancelar*.

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
