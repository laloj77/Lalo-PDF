'use strict';

// Dibuja un resaltado y comprueba que aparece en el PDF guardado y en el PNG exportado.
// Uso: npx electron test/e2e-annotation.js

const { app, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const os = require('node:os');

let openPath = null;
let savePath = null;
let exportDir = null;
let outPng = null;

const log = (...args) => console.log('[e2e]', ...args);

dialog.showOpenDialog = async (_win, options = {}) => {
  if ((options.properties || []).includes('openDirectory')) {
    return { canceled: false, filePaths: [exportDir] };
  }
  return { canceled: false, filePaths: [openPath] };
};
dialog.showSaveDialog = async () => ({ canceled: false, filePath: savePath });

require('../electron/main.js');

app.on('browser-window-created', (_event, win) => {
  win.webContents.once('did-finish-load', async () => {
    try {
      const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'lalo-ann-'));
      openPath = path.join(tmp, 'documento.pdf');
      savePath = path.join(tmp, 'guardado.pdf');
      exportDir = path.join(tmp, 'png');
      outPng = path.join(__dirname, 'highlight.png');
      await fs.copyFile(path.join(__dirname, 'sample.pdf'), openPath);
      await fs.mkdir(exportDir, { recursive: true });

      await win.webContents.executeJavaScript(`
        new Promise((resolve) => {
          document.querySelector('#btn-open').click();
          const t0 = Date.now();
          const timer = setInterval(() => {
            if (document.querySelectorAll('.page').length) { clearInterval(timer); resolve(); }
            else if (Date.now() - t0 > 20000) { clearInterval(timer); resolve(); }
          }, 150);
        })
      `);

      const drawn = await win.webContents.executeJavaScript(`
        (async () => {
          const wait = (ms) => new Promise((r) => setTimeout(r, ms));
          document.querySelector('#btn-markup').click();
          document.querySelector('.tool-btn[data-tool="highlight"]').click();
          const overlay = document.querySelector('.page-overlay');
          const rect = overlay.getBoundingClientRect();
          const x = rect.left + rect.width * 0.15;
          const y = rect.top + rect.height * 0.25;
          const opts = { bubbles: true, cancelable: true, button: 0, buttons: 1, pointerId: 1, isPrimary: true, pointerType: 'mouse' };
          overlay.dispatchEvent(new PointerEvent('pointerdown', { ...opts, clientX: x, clientY: y }));
          await wait(50);
          overlay.dispatchEvent(new PointerEvent('pointermove', { ...opts, clientX: x + rect.width * 0.5, clientY: y + 40 }));
          await wait(50);
          overlay.dispatchEvent(new PointerEvent('pointerup', { ...opts, buttons: 0, clientX: x + rect.width * 0.5, clientY: y + 40 }));
          await wait(100);
          document.querySelector('#btn-markup-done').click();
          return { alto: rect.height, ancho: rect.width };
        })()
      `);
      log('página:', JSON.stringify(drawn));

      await win.webContents.executeJavaScript("document.querySelector('#btn-save').click()");
      await new Promise((r) => setTimeout(r, 2500));
      const saved = await fs.readFile(openPath).catch(() => null);
      log('guardado en el mismo archivo:', saved ? `${saved.length} bytes` : 'AUSENTE');

      await win.webContents.executeJavaScript("document.querySelector('#btn-export').click()");
      await new Promise((r) => setTimeout(r, 4000));
      const files = (await fs.readdir(exportDir)).sort();
      log('png:', files.join(', '));
      if (files.length) {
        await fs.copyFile(path.join(exportDir, files[0]), outPng);
        log('captura copiada a test/highlight.png');
      }

      await fs.rm(tmp, { recursive: true, force: true });
      app.exit(0);
    } catch (error) {
      console.error('[e2e] FALLO:', error);
      app.exit(1);
    }
  });
});
