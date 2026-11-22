'use strict';

// Comprueba que el arrastre dentro de la barra lateral sigue reordenando
// páginas y que no inicia ningún arrastre nativo de archivo.
//
// Uso: npx electron test/e2e-reorder.js [archivo.pdf]

const { app, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const os = require('node:os');

const SOURCE =
  process.argv[2] && process.argv[2].toLowerCase().endsWith('.pdf')
    ? path.resolve(process.argv[2])
    : path.join(__dirname, 'sample.pdf');

let openPath = null;
let nativeDrags = 0;

const log = (...args) => console.log('[e2e-reorder]', ...args);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [openPath] });

require('../electron/main.js');

app.on('browser-window-created', (_event, win) => {
  win.webContents.once('did-finish-load', async () => {
    try {
      const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'lalo-reorder-e2e-'));
      openPath = path.join(tmp, 'documento.pdf');
      await fs.copyFile(SOURCE, openPath);

      win.webContents.startDrag = () => {
        nativeDrags += 1;
      };

      const count = await win.webContents.executeJavaScript(`
        new Promise((resolve) => {
          document.querySelector('#btn-open').click();
          const t0 = Date.now();
          const timer = setInterval(() => {
            const n = document.querySelectorAll('.thumb').length;
            if (n >= 4) { clearInterval(timer); resolve(n); }
            else if (Date.now() - t0 > 30000) { clearInterval(timer); resolve(n); }
          }, 150);
        })
      `);
      log('miniaturas:', count);
      if (count < 4) throw new Error('No se pudieron abrir las 4 páginas');

      const before = await win.webContents.executeJavaScript(
        "Array.from(document.querySelectorAll('.thumb canvas')).map((c) => c.toDataURL())",
      );

      const moved = await win.webContents.executeJavaScript(`
        (() => {
          const from = document.querySelector('.thumb[data-index="0"]');
          const to = document.querySelector('.thumb[data-index="1"]');
          const a = from.getBoundingClientRect();
          const b = to.getBoundingClientRect();
          const base = {
            bubbles: true,
            cancelable: true,
            pointerId: 9,
            pointerType: 'mouse',
            isPrimary: true,
            button: 0,
            buttons: 1,
          };
          const fire = (type, x, y) =>
            from.dispatchEvent(new PointerEvent(type, { ...base, clientX: x, clientY: y }));
          fire('pointerdown', a.left + a.width / 2, a.top + a.height / 2);
          fire('pointermove', a.left + a.width / 2, a.top + a.height / 2 + 12);
          fire('pointermove', b.left + b.width / 2, b.bottom - 6);
          fire('pointerup', b.left + b.width / 2, b.bottom - 6);
          return true;
        })()
      `);
      log('arrastre interno:', moved);
      await wait(600);

      const after = await win.webContents.executeJavaScript(
        "Array.from(document.querySelectorAll('.thumb canvas')).map((c) => c.toDataURL())",
      );

      const expected = [before[1], before[0], before[2], before[3]];
      const ok = expected.every((url, i) => url === after[i]);
      log('orden tras mover la 1.ª detrás de la 2.ª:', ok ? 'correcto' : 'INCORRECTO');
      log('arrastres nativos iniciados:', nativeDrags);

      if (!ok) throw new Error('El orden de las páginas no cambió como se esperaba');
      if (nativeDrags !== 0) throw new Error('Un arrastre interno inició un arrastre nativo');

      await fs.rm(tmp, { recursive: true, force: true });
      log('OK');
      app.exit(0);
    } catch (error) {
      console.error('[e2e-reorder] FALLO:', error);
      app.exit(1);
    }
  });
});
