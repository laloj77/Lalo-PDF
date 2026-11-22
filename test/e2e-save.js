'use strict';

// Prueba de humo contra la app real (electron/main.js):
//  1. abre un PDF (copia temporal)
//  2. edita páginas (rotar + borrar)
//  3. «Guardar» escribe sobre el mismo archivo (sin diálogo)
//  4. El botón «Guardar como…» abre el diálogo de guardado
//  5. «Exportar» genera un PNG por página
//
// Uso: npx electron test/e2e-save.js [archivo.pdf]

const { app, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const os = require('node:os');
const crypto = require('node:crypto');

const SOURCE =
  process.argv[2] && process.argv[2].toLowerCase().endsWith('.pdf')
    ? path.resolve(process.argv[2])
    : path.join(__dirname, 'sample.pdf');

let openPath = null;
let savePath = null;
let exportDir = null;

const log = (...args) => console.log('[e2e]', ...args);
const hash = (buffer) => crypto.createHash('sha1').update(buffer).digest('hex').slice(0, 12);

dialog.showOpenDialog = async (_win, options = {}) => {
  const props = options.properties || [];
  if (props.includes('openDirectory')) {
    log('dialogo: carpeta ->', exportDir);
    return { canceled: false, filePaths: [exportDir] };
  }
  log('dialogo: abrir ->', openPath);
  return { canceled: false, filePaths: [openPath] };
};
dialog.showSaveDialog = async () => {
  log('dialogo: guardar como ->', savePath);
  return { canceled: false, filePath: savePath };
};

require('../electron/main.js');

function waitForToast(win, pattern, timeout = 30000) {
  return win.webContents.executeJavaScript(`
    new Promise((resolve) => {
      const t0 = Date.now();
      const timer = setInterval(() => {
        const toast = document.querySelector('#toast');
        const text = (toast && toast.textContent) || '';
        if (!toast.hidden && ${pattern}.test(text)) {
          clearInterval(timer);
          resolve(text);
        } else if (Date.now() - t0 > ${timeout}) {
          clearInterval(timer);
          resolve('TIMEOUT: ' + text);
        }
      }, 150);
    })
  `);
}

app.on('browser-window-created', (_event, win) => {
  win.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    const text = String(message);
    if (/Parsed number that is too large/.test(text)) return;
    console.log(`[renderer:${level}] ${text} (${path.basename(sourceId)}:${line})`);
  });

  win.webContents.once('did-finish-load', async () => {
    try {
      const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'lalo-e2e-'));
      openPath = path.join(tmp, 'documento.pdf');
      savePath = path.join(tmp, 'copia.pdf');
      exportDir = path.join(tmp, 'imagenes');
      await fs.copyFile(SOURCE, openPath);
      await fs.mkdir(exportDir, { recursive: true });
      const before = await fs.readFile(openPath);
      log('original:', path.basename(SOURCE), before.length, 'bytes, sha', hash(before));

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

      const edits = await win.webContents.executeJavaScript(`
        (async () => {
          const out = {};
          const wait = (ms) => new Promise((r) => setTimeout(r, ms));
          document.querySelector('#btn-rotate').click();
          await wait(500);
          const second = document.querySelector('.thumb[data-index="1"]');
          if (second) {
            second.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            await wait(250);
            document.querySelector('#btn-delete-pages').click();
            await wait(900);
          }
          out.paginas = document.querySelectorAll('.page').length;
          out.estado = document.querySelector('#status-right').textContent;
          return out;
        })()
      `);
      log('ediciones:', JSON.stringify(edits));

      // --- Guardar en el mismo archivo
      await win.webContents.executeJavaScript("document.querySelector('#btn-save').click()");
      log('toast guardar:', await waitForToast(win, '/Guardado|No se pudo|Abre un PDF/'));

      const after = await fs.readFile(openPath);
      log(
        'archivo tras Guardar:',
        after.length,
        'bytes, sha',
        hash(after),
        after.length === before.length && hash(after) === hash(before) ? '(SIN CAMBIOS)' : '(actualizado)',
      );
      const { PDFDocument } = require('pdf-lib');
      const savedDoc = await PDFDocument.load(after);
      log('PDF guardado: paginas =', savedDoc.getPageCount());
      log('copia.pdf existe antes de Guardar como:', await fs.access(savePath).then(() => true, () => false));

      // --- Botón «Guardar como…»
      await win.webContents.executeJavaScript("document.querySelector('#btn-save-as').click()");
      log('toast guardar como:', await waitForToast(win, '/Guardado|No se pudo/'));
      const copy = await fs.readFile(savePath).catch(() => null);
      log('copia.pdf:', copy ? `${copy.length} bytes, sha ${hash(copy)}` : 'AUSENTE');

      // --- Exportar imágenes
      await win.webContents.executeJavaScript("document.querySelector('#btn-export').click()");
      log('toast exportar:', await waitForToast(win, '/exportada|exportadas|No se pudieron|Abre un PDF/'));
      const files = (await fs.readdir(exportDir)).sort();
      log('imagenes exportadas:', files.length, files.slice(0, 3).join(', '));
      if (files.length) {
        const png = await fs.readFile(path.join(exportDir, files[0]));
        log('primera imagen:', png.length, 'bytes, PNG:', png.subarray(1, 4).toString('latin1'));
      }

      await fs.rm(tmp, { recursive: true, force: true });
      app.exit(0);
    } catch (error) {
      console.error('[e2e] FALLO:', error);
      app.exit(1);
    }
  });
});
