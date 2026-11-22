'use strict';

// Comprueba los avisos de error de Guardar/Exportar:
//  - sin documento abierto
//  - sin permisos de escritura en la carpeta destino
// Uso: npx electron test/e2e-errors.js

const { app, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const os = require('node:os');

let savePath = null;
let exportDir = null;

const log = (...args) => console.log('[e2e]', ...args);

dialog.showOpenDialog = async (_win, options = {}) => {
  if ((options.properties || []).includes('openDirectory')) {
    return { canceled: false, filePaths: [exportDir] };
  }
  return { canceled: true, filePaths: [] };
};
dialog.showSaveDialog = async () => ({ canceled: false, filePath: savePath });

require('../electron/main.js');

function readToast(win) {
  return win.webContents.executeJavaScript(`
    (() => {
      const toast = document.querySelector('#toast');
      return { hidden: toast.hidden, text: toast.textContent || '' };
    })()
  `);
}

app.on('browser-window-created', (_event, win) => {
  win.webContents.once('did-finish-load', async () => {
    try {
      const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'lalo-err-'));
      exportDir = path.join(tmp, 'imagenes');
      await fs.mkdir(exportDir, { recursive: true });

      // 1) Sin documento
      await win.webContents.executeJavaScript("document.querySelector('#btn-save').click()");
      await new Promise((r) => setTimeout(r, 400));
      log('sin documento, Guardar ->', JSON.stringify(await readToast(win)));
      await win.webContents.executeJavaScript("document.querySelector('#btn-export').click()");
      await new Promise((r) => setTimeout(r, 400));
      log('sin documento, Exportar ->', JSON.stringify(await readToast(win)));

      // 2) Carpeta de solo lectura
      const locked = path.join(tmp, 'bloqueada');
      await fs.mkdir(locked);
      savePath = path.join(locked, 'salida.pdf');
      await fs.chmod(locked, 0o500);

      const sample = await fs.readFile(path.join(__dirname, 'sample.pdf'));
      win.webContents.send('menu-action', 'open-file', {
        name: 'muestra.pdf',
        bytes: new Uint8Array(sample),
      });
      await new Promise((r) => setTimeout(r, 1500));
      log('documento abierto:', await win.webContents.executeJavaScript("document.querySelectorAll('.page').length"));

      await win.webContents.executeJavaScript(`
        document.querySelector('#btn-save').dispatchEvent(
          new MouseEvent('click', { bubbles: true, shiftKey: true })
        )
      `);
      await new Promise((r) => setTimeout(r, 2500));
      log('carpeta bloqueada ->', JSON.stringify(await readToast(win)));

      await fs.chmod(locked, 0o700);
      await fs.rm(tmp, { recursive: true, force: true });
      app.exit(0);
    } catch (error) {
      console.error('[e2e] FALLO:', error);
      app.exit(1);
    }
  });
});
