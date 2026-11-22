'use strict';

// Dibuja las nuevas formas, mueve/redimensiona una de ellas, crea un cuadro de texto
// con tamaño de letra personalizado y comprueba que todo se guarda y exporta.
// Uso: npx electron test/e2e-shapes.js

const { app, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const os = require('node:os');

let openPath = null;
let exportDir = null;

const log = (...args) => console.log('[e2e]', ...args);

dialog.showOpenDialog = async (_win, options = {}) => {
  if ((options.properties || []).includes('openDirectory')) {
    return { canceled: false, filePaths: [exportDir] };
  }
  return { canceled: false, filePaths: [openPath] };
};

require('../electron/main.js');

app.on('browser-window-created', (_event, win) => {
  win.webContents.once('did-finish-load', async () => {
    try {
      const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'lalo-shapes-'));
      openPath = path.join(tmp, 'documento.pdf');
      exportDir = path.join(tmp, 'png');
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

      const result = await win.webContents.executeJavaScript(`
        (async () => {
          const wait = (ms) => new Promise((r) => setTimeout(r, ms));
          const overlay = document.querySelector('.page-overlay');
          const rect = overlay.getBoundingClientRect();
          const fire = (type, x, y) => {
            overlay.dispatchEvent(new PointerEvent(type, {
              bubbles: true, cancelable: true, button: 0, buttons: 1,
              pointerId: 1, isPrimary: true, pointerType: 'mouse',
              clientX: x, clientY: y,
            }));
          };
          const drag = async (tool, x1, y1, x2, y2) => {
            document.querySelector('.tool-btn[data-tool="' + tool + '"]').click();
            await wait(40);
            fire('pointerdown', x1, y1);
            await wait(30);
            fire('pointermove', x2, y2);
            await wait(30);
            fire('pointerup', x2, y2);
            await wait(80);
          };
          document.querySelector('#btn-markup').click();
          await wait(100);

          const left = rect.left + rect.width * 0.08;
          const top = rect.top + rect.height * 0.12;
          const w = rect.width * 0.22;
          const h = rect.height * 0.12;

          await drag('rect', left, top, left + w, top + h);
          await drag('ellipse', left + w + 24, top, left + w + 24 + w, top + h);
          await drag('line', left, top + h + 28, left + w, top + h + 90);
          await drag('arrow', left + w + 24, top + h + 90, left + w + 24 + w, top + h + 28);

          // Mover la última flecha seleccionada y luego redimensionarla desde su extremo.
          fire('pointerdown', left + w + 24 + w * 0.5, top + h + 60);
          await wait(30);
          fire('pointermove', left + w + 24 + w * 0.5 + 18, top + h + 60 + 12);
          await wait(30);
          fire('pointerup', left + w + 24 + w * 0.5 + 18, top + h + 60 + 12);
          await wait(80);

          // Cuadro de texto con tamaño 24 y dos líneas.
          document.querySelector('.tool-btn[data-tool="text"]').click();
          await wait(40);
          const tx = rect.left + rect.width * 0.1;
          const ty = rect.top + rect.height * 0.55;
          fire('pointerdown', tx, ty);
          await wait(120);
          const input = document.querySelector('#text-editor-input');
          input.value = 'Hola Lalo\\nTexto de prueba';
          input.dispatchEvent(new Event('input', { bubbles: true }));
          const size = document.querySelector('#text-size-select');
          size.value = '24';
          size.dispatchEvent(new Event('change', { bubbles: true }));
          document.querySelector('#text-apply').click();
          await wait(150);

          const textVisible = !document.querySelector('#text-editor').hidden;
          const selected = document.querySelector('.tool-btn[data-tool="select"]').classList.contains('active');

          // Mover el texto recién creado y agrandarlo con el tirador inferior derecho.
          fire('pointerdown', tx + 40, ty + 24);
          await wait(30);
          fire('pointermove', tx + 90, ty + 40);
          await wait(30);
          fire('pointerup', tx + 90, ty + 40);
          await wait(80);

          document.querySelector('#btn-markup-done').click();
          await wait(100);
          return { textVisible, selected };
        })()
      `);
      log('editor visible tras aplicar:', result.textVisible, '· herramienta seleccionar:', result.selected);

      await win.webContents.executeJavaScript("document.querySelector('#btn-save').click()");
      await new Promise((r) => setTimeout(r, 2500));
      const saved = await fs.readFile(openPath).catch(() => null);
      log('guardado:', saved ? `${saved.length} bytes` : 'AUSENTE');

      await win.webContents.executeJavaScript("document.querySelector('#btn-export').click()");
      await new Promise((r) => setTimeout(r, 4000));
      const files = (await fs.readdir(exportDir)).sort();
      log('png:', files.join(', '));
      if (files.length) {
        await fs.copyFile(path.join(exportDir, files[0]), path.join(__dirname, 'shapes.png'));
        log('captura copiada a test/shapes.png');
      }

      await fs.rm(tmp, { recursive: true, force: true });
      app.exit(0);
    } catch (error) {
      console.error('[e2e] FALLO:', error);
      app.exit(1);
    }
  });
});
