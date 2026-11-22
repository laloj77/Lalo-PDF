# Lalo PDF

Visor, editor y organizador de PDF para **Windows**, inspirado en **Preview** de macOS
(Electron + pdf.js + pdf-lib).

## Funciones

- **Organizar**: reordenar páginas arrastrando miniaturas, añadir PDF/imágenes, duplicar,
  insertar página en blanco y eliminar páginas. Todo con Deshacer/Rehacer.
- **Arrastrar fuera**: al arrastrar una miniatura (o varias seleccionadas) fuera de la
  ventana se genera un **PDF real** con un nombre legible
  (`documento - página 3.pdf`) que se puede soltar en el escritorio o en el Explorador.
- **Ver**: vista continua, una página y dos páginas; zoom, ajustar a la ventana,
  rotar y barra lateral de miniaturas.
- **Herramientas**: resaltador, lápiz, rectángulo, cuadro de texto y borrador;
  las marcas se aplanan sobre el PDF al guardar.
- **Buscar** texto en el documento.
- **Guardar** sobre el archivo abierto o **Guardar como…**, y **Exportar** cada página como PNG.
- **Imprimir** (`Ctrl+P`): abre el diálogo de impresión de Windows con el documento tal como se ve
  (incluidos los cambios y las anotaciones). Se puede elegir «Imprimir a PDF» para guardar una copia.

## Atajos

| Acción | Atajo |
| --- | --- |
| Abrir PDF | `Ctrl+O` |
| Añadir PDF | `Ctrl+Shift+O` |
| Guardar (sobre el archivo abierto) | `Ctrl+S` |
| Guardar como… | `Ctrl+Shift+S` o `Mayús` + clic en **Guardar** |
| Exportar como imágenes | `Ctrl+Shift+E` |
| Imprimir | `Ctrl+P` |
| Acercar / alejar | `Ctrl+=` / `Ctrl+-` |
| Tamaño real / ajustar | `Ctrl+0` / `Ctrl+9` |
| Rotar | `Ctrl+R` / `Ctrl+Shift+R` |
| Buscar | `Ctrl+F` |
| Herramientas | `Ctrl+Alt+1…9` |

## Registro de cambios

El historial de versiones está en [CHANGELOG.md](CHANGELOG.md) (formato
[Keep a Changelog](https://keepachangelog.com/es/1.1.0/) y SemVer).

## Desarrollo

```bash
npm install       # instala dependencias y copia los vendors a src/vendor
npm start         # abre la app
```

## Compilar para Windows

```bash
npm run dist:win        # instalador NSIS + versión portable (x64)
npm run dist:win:nsis   # solo instalador
```

Los artefactos quedan en `dist/` (`Lalo-PDF-0.1.1-x64.exe`, etc.).

## Pruebas

Pruebas de humo que abren un PDF real, lo editan, guardan y exportan usando la app completa
(protocolo, preload e IPC reales):

```bash
npm run test:e2e      # abrir → editar → Guardar → Guardar como → Exportar
npm run test:errors   # avisos: sin documento y carpeta sin permisos
npm run test:markup   # un resaltado debe aparecer en el PNG exportado
npm run test:shapes   # formas y texto se aplanan en el PDF y en el PNG
npm run test:drag     # arrastrar miniaturas fuera genera un PDF con nombre legible
npm run test:reorder  # arrastrar dentro de la barra lateral sigue reordenando
npm run test:print    # imprimir genera una página por página del documento
```

> En macOS, si `ELECTRON_RUN_AS_NODE=1` está definido en el entorno, ejecuta las pruebas con
> `env -u ELECTRON_RUN_AS_NODE npm run test:e2e`.
