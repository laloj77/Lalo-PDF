# Changelog

Todos los cambios notables de **Lalo PDF Converter** se documentan en este archivo.

El formato está basado en [Keep a Changelog](https://keepachangelog.com/es/1.1.0/)
y el proyecto sigue [Semantic Versioning](https://semver.org/lang/es/).

## [Sin publicar]

_(Nada todavía.)_

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
