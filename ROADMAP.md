# Hoja de Ruta de Implementaciones y Características (Roadmap)

Este documento contiene la lista completa de características planificadas, priorizadas y pendientes para **Lalo PDF**.

---

## 🟢 Prioridad 1: Mucho uso, poco riesgo (Lote Recomendado)

- [x] ~~**Imprimir (`Ctrl+P`)**~~
  - ~~*Estado:* Implementado (v0.1.0).~~
  - ~~Impresión del documento compuesto usando `webContents.print` y ajuste dinámico de tamaño de hoja (`@page`).~~
- [x] ~~**Extraer / Dividir páginas**~~
  - ~~Seleccionar miniaturas de la barra lateral → *Extraer como PDF…* (y exportar como JPEG/PNG, duplicar, rotar, insertar en blanco o eliminar desde el menú contextual o arrastrando con el botón derecho).~~
  - ~~Opción de *Dividir en varios PDF* (por rangos o por página).~~
- [x] ~~**Firma digital / manuscrita**~~
  - ~~Dibujar o escribir una firma manuscrita una vez, guardarla localmente y colocarla como una forma/objeto (mover, escalar, ajustar opacidad).~~
- [x] ~~**Números de página y Marca de agua**~~
  - ~~Numerar desde/hasta con posición personalizable (cabecera/pie, izquierda/centro/derecha).~~
  - ~~Marca de agua de texto (e imagen/logo) con rotación y opacidad personalizable.~~
- [x] ~~**Comprimir PDF**~~
  - ~~Recomprimir imágenes del documento con calidad/resolución ajustable.~~
  - ~~Mostrar comparativa de tamaño "antes → después".~~

---

## 🟡 Prioridad 2: Mayor complejidad, alto valor

- [x] ~~**Anotaciones editables nativas**~~
  - ~~Guardar elementos dibujados como anotaciones PDF reales en lugar de aplanarlos directamente en el lienzo, permitiendo su reeditado posterior.~~
- [x] ~~**Protección por contraseña y permisos**~~
  - ~~Abrir PDFs protegidos por contraseña.~~
  - ~~Guardar/exportar estableciendo contraseña de apertura y restricciones de edición/impresión.~~
- [x] ~~**Formularios (AcroForms)**~~
  - ~~Rellenar campos de formulario interactivos y aplanarlos al guardar.~~
- [x] ~~**Más formatos de exportación**~~
  - ~~Exportar contenido a texto plano (`.txt`), TIFF, JPEG (`.jpg`), PNG (`.png`) o Microsoft Word (`.docx`).~~

---

## 🔵 Prioridad 3: Calidad de vida y experiencia de usuario (UX)

- [x] ~~**Autoguardado y aviso de cambios sin guardar**~~
  - ~~Interruptor de Autoguardado tipo iOS en la barra superior y confirmación al intentar cerrar si hay cambios pendientes (*Guardar*, *Guardar como…*, *No guardar*, *Cancelar*).~~
- [x] ~~**Documentos recientes y pestañas / multi-ventana**~~
  - ~~Menú de archivos recientes y soporte para trabajar con múltiples documentos a la vez.~~
- [x] ~~**Copiar texto seleccionado**~~
  - ~~Herramienta de selección de texto sobre la página para copiar al portapapeles.~~
- [x] ~~**Índice / Marcadores (Tabla de contenidos)**~~
  - ~~Vista en la barra lateral para navegar por los marcadores del PDF.~~
- [x] ~~**Modo presentación a pantalla completa**~~
  - ~~Pasar páginas a pantalla completa (`F5` / botón junto a Imprimir) sin elementos de interfaz y con control flotante.~~
- [x] ~~**Ajustes de miniatura y navegación rápida**~~
  - ~~Redimensionar miniaturas arrastrando el divisor de la barra lateral (renderizadas a `360 px` base para máxima nitidez) y caja `Ir a pág.` para saltar a un número de página específico.~~
- [x] ~~**Asociación de archivos en Windows**~~
  - ~~Configurar "Abrir con Lalo PDF" automáticamente en el instalador de Windows.~~
- [x] ~~**Redacción real (Sanitización)**~~
  - ~~Eliminación definitiva del contenido y texto subyacente (en lugar de superponer un rectángulo negro).~~
- [x] ~~**Modo claro para la interfaz**~~
  - ~~Añadir selector de tema claro/oscuro en la interfaz.~~
- [x] ~~**Arrastrar PDF a las miniaturas para añadir páginas**~~
  - ~~Arrastrar un archivo PDF sobre la barra lateral de miniaturas para añadir sus páginas al documento actual.~~
- [x] ~~**Arrastrar PDF a la pantalla central al iniciar**~~
  - ~~Permitir arrastrar y soltar un PDF directamente sobre la pantalla de inicio cuando no hay ningún documento abierto.~~
- [x] ~~**Desplegable y entrada directa de porcentaje de zoom**~~
  - ~~Selector rápido (35 % – 170 % y Ajustar) y escritura directa del porcentaje en la barra de herramientas.~~
- [x] ~~**Selección y extracción de imágenes del PDF**~~
  - ~~Seleccionar imágenes dentro del PDF, arrastrarlas fuera como JPEG o usar clic derecho para copiar o guardar como JPG, PNG, WebP o PDF.~~
- [x] ~~**Crear icono para la app (externo e interno)**~~
  - ~~Diseñar y aplicar el icono propio de Lalo PDF tanto para el ejecutable/acceso directo de Windows como para la interfaz interna de la aplicación.~~
- [x] ~~**Mejoras en el cuadro de texto**~~
  - ~~Tamaños de letra 8 y 9, negrita, cursiva, subrayado y tachado, con icono `A` y vista previa en tiempo real.~~
  - ~~Alineación (izquierda, centro, derecha), color de borde, 4 grosores (1–4 px) y esquinas rectas o redondeadas.~~
  - ~~Menú contextual con botón derecho sobre el cuadro de texto (Color, Tipo de texto y Tamaño, Alineación, Borde).~~

---

## 🟣 Prioridad 4: Al final del proyecto

- [x] ~~**Clonado fiel PDF → Word (`.docx`) con motor externo**~~
  - ~~Integrar un motor externo en la app (como **LibreOffice** o **Python `pdf2docx`**) para reconstruir tablas, columnas y diseño exacto al exportar a `.docx`.~~
- [x] ~~**OCR para documentos escaneados**~~
  - ~~Reconocimiento óptico de caracteres para generar una capa de texto invisible que permita seleccionar, copiar y buscar texto en PDFs escaneados.~~
- [x] ~~**Actualizador automático desde GitHub Releases**~~
  - ~~Comprobar si hay una nueva versión publicada en GitHub Releases (`electron-updater` / `latest.yml`), descargarla e instalarla automáticamente desde la app.~~

---

- [ ] **Optimizar rendimiento y memoria**
  - Evitar copias innecesarias de bytes del PDF en memoria, liberar canvases/miniaturas fuera de pantalla en documentos largos y acelerar el renderizado al cambiar de página o hacer zoom.
- [ ] **Modularizar `src/app.js`**
  - Dividir `src/app.js` (+7.600 líneas) en módulos por responsabilidad (visor, anotaciones, herramientas PDF, modales, pestañas/historial) para facilitar el mantenimiento y evitar colisiones de nombres.
- [ ] **Optimizar tamaño en disco y ligereza**
  - Reducir el peso de la aplicación y del instalador/portable revisando dependencias y recursos empaquetados (`tesseract.js`, `vendor-win/python`, `asar`).

---

## ⭐ Prioridad 5: Lista de deseos para v2

- [ ] **Revisar OCR**
  - Afinar la precisión visual y la selección de texto tras aplicar OCR en documentos escaneados.
- [ ] **Edición directa de texto en PDF (documentos normales)**
  - Hacer doble clic sobre una línea de texto para editarla encima (fondo liso/blanco), reemplazando el bloque visualmente.
- [ ] **Edición directa de texto en PDF (avanzado, estilo Sejda)**
  - Parsear y reescribir el *content stream* (`BT ... ET`) con `pdf-lib` para eliminar el texto original sin tapar fondos de color, tablas ni imágenes.
- [x] ~~**Recortar páginas (Crop) y normalizar tamaño**~~
  - ~~Recortar márgenes de una o todas las páginas (útil en PDFs escaneados o tickets) y ajustar/normalizar páginas a A4.~~
- [x] ~~**Comparar dos PDFs**~~
  - ~~Abrir dos versiones de un documento y resaltar diferencias visuales o de texto página a página.~~
- [x] ~~**Certificado / Firma digital criptográfica (`.pfx` / `.p12`)**~~
  - ~~Firmar documentos con certificado digital (distinto a la firma manuscrita visual) con validez criptográfica.~~

---

## 🐛 Errores conocidos

- [ ] **Sin barra de archivo** (menú superior *Archivo / Editar / Ver…* en Windows).
- [x] ~~**Actualizar no funciona**.~~
- [x] ~~**Abrir PDF por defecto:** si se asigna la app como visor predeterminado para `.pdf`, al hacer doble clic en un PDF abre el programa, pero vacío, sin el PDF.~~

---

*Nota: Este archivo sirve como referencia permanente en el repositorio para guiar el desarrollo de las futuras versiones.*
