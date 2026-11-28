# Plan de Pruebas Completo — Lalo PDF (`v0.9.2`)

Este documento define las pruebas completas de **Lalo PDF** organizadas por **bloques y apartados** (`A.1`, `B.1`, etc.) para identificar rápidamente qué bloque o apartado falla en **Windows**.

---

## Bloque A: Requisitos previos y Ciclo de vida en Windows

> **Foco crítico:** Comprobar que la aplicación abre de forma limpia y cierra completamente sin dejar procesos colgados ni errores silenciosos.

- [ ] **A.1 Sin procesos residuales previos**
  ```powershell
  tasklist | findstr /I "electron Lalo"
  ```
- [ ] **A.2 Arranque en desarrollo y cierre con `X`**
  1. Ejecutar `npm start`.
  2. Verificar que la ventana abre sin pantalla en blanco ni errores críticos en consola.
  3. Cerrar con el botón **X** y confirmar que no queda ningún proceso `electron` activo.
- [ ] **A.3 Cierre con `Alt + F4` y reapertura**
  1. Abrir un PDF con `npm start`, cerrar con `Alt + F4`.
  2. Confirmar que no quedan procesos residuales y que vuelve a abrir limpio.
- [ ] **A.4 Cierre con diálogos nativos**
  1. Abrir y cancelar un diálogo nativo (abrir, guardar o imprimir) y cerrar la app principal.
  2. Confirmar que Electron termina limpiamente.

---

## Bloque B: Tests Automatizados (E2E)

Ejecutar todos los scripts de `package.json` y verificar código de salida `0`:

```powershell
npm run test:e2e
npm run test:errors
npm run test:markup
npm run test:shapes
npm run test:drag
npm run test:reorder
npm run test:print
```

- [ ] **B.1** `test:e2e` (guardado básico)
- [ ] **B.2** `test:errors` (manejo de errores)
- [ ] **B.3** `test:markup` (anotaciones)
- [ ] **B.4** `test:shapes` (formas)
- [ ] **B.5** `test:drag` (arrastrar y soltar)
- [ ] **B.6** `test:reorder` (reordenación de páginas)
- [ ] **B.7** `test:print` (impresión)

---

## Bloque C: Apertura, Pestañas, Navegación e Interfaz

- [ ] **C.1 Pantalla de inicio y arrastrar PDF**
  - Arrastrar un PDF sobre la pantalla inicial y comprobar que se abre correctamente.
- [ ] **C.2 Abrir archivo, historial y asociación `.pdf`**
  - Abrir con `Ctrl+O` / botón abrir, desde *Documentos recientes* y con doble clic desde el Explorador de Windows.
- [ ] **C.3 Pestañas**
  - Abrir varios PDFs en pestañas, cambiar entre ellas y cerrar pestañas.
- [ ] **C.4 Modos de vista y Zoom**
  - Probar vista continua (`Ctrl+1`), una página (`Ctrl+2`), dos páginas (`Ctrl+3`), desplegable de zoom (35 % – 170 %, Ajustar), entrada directa de porcentaje e *Ir a página*.
- [ ] **C.5 Barra lateral (Miniaturas, Índice y Búsqueda)**
  - Redimensionar miniaturas arrastrando el divisor, navegar por el índice/marcadores y buscar texto (`Ctrl+F`).
- [ ] **C.6 Modo presentación y Tema**
  - Probar modo presentación (`F5`) y cambio entre tema claro y oscuro.
- [ ] **C.7 Personalización de barras**
  - Arrastrar y reordenar iconos en la barra superior y barra lateral (incluidos separadores), comprobando que se mantiene al reiniciar y que la ventana se sigue pudiendo mover desde la barra superior.

---

## Bloque D: Edición de páginas y Anotaciones

- [ ] **D.1 Gestión de páginas**
  - Reordenar, rotar (`Ctrl+R`), duplicar, insertar en blanco, eliminar páginas y arrastrar otro PDF sobre las miniaturas para añadir sus páginas.
- [ ] **D.2 Extraer y Dividir**
  - Extraer páginas seleccionadas como PDF y dividir un documento en varios PDFs (por rangos o por página).
- [ ] **D.3 Dibujo y anotaciones nativas**
  - Lápiz, resaltador, formas (rectángulo, círculo, línea, flecha) y borrador; guardar y reabrir para comprobar que las anotaciones siguen siendo editables.
- [ ] **D.4 Cuadro de texto**
  - Tamaños (incluidos 8 y 9), negrita, cursiva, subrayado, tachado, alineación, color/grosor de borde, esquinas rectas/redondeadas y menú contextual (clic derecho).
- [ ] **D.5 Selección de texto e imágenes**
  - Seleccionar y copiar texto al portapapeles; seleccionar imágenes del PDF para copiar, arrastrar como JPEG o guardar (JPG, PNG, WebP, PDF).
- [ ] **D.6 Firma manuscrita y Deshacer/Rehacer**
  - Crear/colocar firma manuscrita y probar Deshacer (`Ctrl+Z`) y Rehacer (`Ctrl+Shift+Z`) desde la barra superior.

---

## Bloque E: Herramientas avanzadas (Menú Herramientas ▾)

- [ ] **E.1 Comprimir PDF**
  - Ajustar calidad/resolución, verificar comparativa de tamaño "antes → después" y resultado.
- [ ] **E.2 Recortar y normalizar a A4**
  - Comprobar vista previa, recorte de márgenes en mm, normalización a A4, alcance (todas / actual / seleccionadas) y deshacer.
- [ ] **E.3 Comparar dos PDFs**
  - Abrir segundo PDF, probar vista *Lado a lado* y *Superpuesto*, diff de texto en panel lateral y chips de navegación por página.
- [ ] **E.4 OCR**
  - Aplicar OCR a un PDF escaneado y verificar que el texto pasa a ser seleccionable y buscable.
- [ ] **E.5 Firma digital (`.pfx` / `.p12`)**
  - Seleccionar certificado `.pfx`/`.p12`, introducir contraseña y motivo opcional, y generar el `_firmado.pdf`.
- [ ] **E.6 Números de página, Marca de agua y Redacción real**
  - Añadir numeración, marca de agua (texto/imagen, rotación, opacidad) y redactar texto comprobando que el contenido subyacente queda eliminado.
- [ ] **E.7 Formularios (AcroForms) y Protección**
  - Rellenar campos de formulario y probar guardar/exportar con contraseña de apertura y permisos.

---

## Bloque F: Guardado, Exportación, Actualizador y Build

- [ ] **F.1 Guardado y cambios sin guardar**
  - Probar `Ctrl+S`, `Ctrl+Shift+S`, interruptor *Autoguardado* y diálogo de confirmación al cerrar con cambios pendientes.
- [ ] **F.2 Exportación**
  - Exportar a `.png`, `.jpg`, `.txt`, `.tiff` y `.docx` (clonado fiel con `pdf2docx`).
- [ ] **F.3 Imprimir (`Ctrl+P`)**
  - Verificar diálogo de impresión y vista previa correcta.
- [ ] **F.4 Actualizador automático**
  - Comprobar búsqueda de nueva versión en GitHub Releases y barra de progreso en la barra de estado.
- [ ] **F.5 Build empaquetado (Pre-Release)**
  ```powershell
  npm run dist:win
  ```
  - Verificar generación sin errores en `dist/`, apertura del ejecutable y cierre limpio sin procesos `Lalo PDF.exe` en segundo plano.
