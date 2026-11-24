# Hoja de Ruta de Implementaciones y Características (Roadmap)

Este documento contiene la lista completa de características planificadas, priorizadas y pendientes para **Lalo PDF**.

---

## 🟢 Prioridad 1: Mucho uso, poco riesgo (Lote Recomendado)

- [x] **Imprimir (`Ctrl+P`)**
  - *Estado:* Implementado (v0.1.0).
  - Impresión del documento compuesto usando `webContents.print` y ajuste dinámico de tamaño de hoja (`@page`).
- [ ] **Extraer / Dividir páginas**
  - Seleccionar miniaturas de la barra lateral → *Extraer como PDF…*
  - Opción de *Dividir en varios PDF* (por rangos o por página).
- [ ] **Firma digital / manuscrita**
  - Dibujar o escribir una firma manuscrita una vez, guardarla localmente y colocarla como una forma/objeto (mover, escalar, ajustar opacidad).
- [ ] **Números de página y Marca de agua**
  - Numerar desde/hasta con posición personalizable (cabecera/pie, izquierda/centro/derecha).
  - Marca de agua de texto con rotación y opacidad personalizable.
- [ ] **Comprimir PDF**
  - Recomprimir imágenes del documento con calidad/resolución ajustable.
  - Mostrar comparativa de tamaño "antes → después".

---

## 🟡 Prioridad 2: Mayor complejidad, alto valor

- [ ] **Anotaciones editables nativas**
  - Guardar elementos dibujados como anotaciones PDF reales en lugar de aplanarlos directamente en el lienzo, permitiendo su reeditado posterior.
- [ ] **Protección por contraseña y permisos**
  - Abrir PDFs protegidos por contraseña.
  - Guardar/exportar estableciendo contraseña de apertura y restricciones de edición/impresión.
- [ ] **OCR para documentos escaneados**
  - Reconocimiento óptico de caracteres para generar una capa de texto invisible que permita seleccionar, copiar y buscar texto en PDFs escaneados.
- [ ] **Formularios (AcroForms)**
  - Rellenar campos de formulario interactivos y aplanarlos al guardar.
- [ ] **Más formatos de exportación**
  - Exportar contenido a texto plano (`.txt`), TIFF o Microsoft Word (`.docx`).

---

## 🔵 Prioridad 3: Calidad de vida y experiencia de usuario (UX)

- [ ] **Autoguardado y aviso de cambios sin guardar**
  - Confirmación al intentar cerrar si hay cambios pendientes.
- [ ] **Documentos recientes y pestañas / multi-ventana**
  - Menú de archivos recientes y soporte para trabajar con múltiples documentos a la vez.
- [ ] **Copiar texto seleccionado**
  - Herramienta de selección de texto sobre la página para copiar al portapapeles.
- [ ] **Índice / Marcadores (Tabla de contenidos)**
  - Vista en la barra lateral para navegar por los marcadores del PDF.
- [ ] **Modo presentación a pantalla completa**
  - Pasar páginas a pantalla completa sin elementos de interfaz.
- [ ] **Ajustes de miniatura y navegación rápida**
  - Selector de tamaño de miniaturas en la barra lateral y caja para saltar a un número de página específico.
- [ ] **Asociación de archivos en Windows**
  - Configurar "Abrir con Lalo PDF" automáticamente en el instalador de Windows.
- [ ] **Redacción real (Sanitización)**
  - Eliminación definitiva del contenido y texto subyacente (en lugar de superponer un rectángulo negro).

---

*Nota: Este archivo sirve como referencia permanente en el repositorio para guiar el desarrollo de las futuras versiones.*
