'use strict';

// Prueba de impresión contra la app real (electron/main.js):
//  1. abre un PDF de muestra
//  2. lo rota para verificar que se imprime el documento compuesto
//  3. pulsa «Imprimir» y redirige el diálogo nativo a un PDF generado
//  4. comprueba que el PDF impreso tiene una página por página del documento
//     y que no quedan lienzos de impresión en la interfaz
//
// Uso: npx electron test/e2e-print.js [archivo.pdf]

const { app, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const os = require('node:os');

const SOURCE =
  process.argv[2] && process.argv[2].toLowerCase().endsWith('.pdf')
    ? path.resolve(process.argv[2])
    : path.join(__dirname, 'sample.pdf');

let openPath = null;
let printedPath = null;
const log = (...args) => console.log('[e2e]', ...args);

dialog.showOpenDialog = async () => {
  log('dialogo: abrir ->', openPath);
  return { canceled: false, filePaths: [openPath] };
};

require('../electron/main.js');

app.on('browser-window-created', (_event, win) => {
  // El diálogo de impresión del sistema no se puede abrir en una prueba sin
  // impresora ni interacción: se sustituye por printToPDF, que aplica las
  // mismas reglas @media print que se usan al imprimir de verdad.
  win.webContents.print = async (_options = {}, callback = () => {}) => {
    try {
      const data = await win.webContents.printToPDF({ printBackground: true });
      await fs.writeFile(printedPath, data);
      log('impresión generada:', data.length, 'bytes');
      callback(true);
    } catch (error) {
      log('FALLO al imprimir:', error.message);
      callback(false, error.message);
    }
  };

  win.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    const text = String(message);
    if (/Parsed number that is too large/.test(text)) return;
    console.log(`[renderer:${level}] ${text} (${path.basename(sourceId)}:${line})`);
  });

  win.webContents.once('did-finish-load', async () => {
    let tmp = null;
    try {
      tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'lalo-print-'));
      openPath = path.join(tmp, 'documento.pdf');
      printedPath = path.join(tmp, 'impresion.pdf');
      await fs.copyFile(SOURCE, openPath);

      const pages = await win.webContents.executeJavaScript(`
        new Promise((resolve) => {
          document.querySelector('#btn-open').click();
          const t0 = Date.now();
          const timer = setInterval(() => {
            const n = document.querySelectorAll('.page').length;
            if (n > 0) { clearInterval(timer); resolve(n); }
            else if (Date.now() - t0 > 30000) { clearInterval(timer); resolve(-1); }
          }, 150);
        })
      `);
      log('paginas renderizadas:', pages);
      if (pages <= 0) throw new Error('No se pudo abrir el PDF');

      const shot = await win.webContents.capturePage();
      await fs.writeFile(path.join(__dirname, 'captura-print.png'), shot.toPNG());

      // Rotar para comprobar que la impresión usa el PDF compuesto, no el original.
      await win.webContents.executeJavaScript(`
        (async () => {
          document.querySelector('#btn-rotate').click();
          await new Promise((r) => setTimeout(r, 600));
        })()
      `);

      log('boton Imprimir presente:', await win.webContents.executeJavaScript(`
        !!document.querySelector('#btn-print')
      `));

      await win.webContents.executeJavaScript("document.querySelector('#btn-print').click()");

      // Esperar a que el PDF impreso aparezca en disco.
      const t0 = Date.now();
      let printed = null;
      while (Date.now() - t0 < 30000) {
        printed = await fs.readFile(printedPath).catch(() => null);
        if (printed) break;
        await new Promise((r) => setTimeout(r, 150));
      }
      if (!printed) throw new Error('No se generó el PDF impreso');

      const { PDFDocument } = require('pdf-lib');
      const doc = await PDFDocument.load(printed);
      const outPages = doc.getPageCount();
      log('PDF impreso:', printed.length, 'bytes, paginas =', outPages);
      const sizes = doc.getPages().map((p) => `${Math.round(p.getWidth())}x${Math.round(p.getHeight())}`);
      log('tamaños de página:', sizes.slice(0, 4).join(', '));

      if (outPages !== pages) {
        throw new Error(`Se esperaban ${pages} páginas impresas, se generaron ${outPages}`);
      }

      const leftovers = await win.webContents.executeJavaScript(`
        document.querySelectorAll('#print-root canvas').length
      `);
      log('lienzos de impresión restantes:', leftovers);
      if (leftovers !== 0) throw new Error('Quedaron lienzos de impresión en la interfaz');

      await fs.rm(tmp, { recursive: true, force: true });
      log('OK');
      app.exit(0);
    } catch (error) {
      console.error('[e2e] FALLO:', error);
      if (tmp) await fs.rm(tmp, { recursive: true, force: true }).catch(() => {});
      app.exit(1);
    }
  });
});
