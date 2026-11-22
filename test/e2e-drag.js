'use strict';

// Prueba de humo del arrastre de miniaturas fuera de la ventana:
//  1. abre un PDF
//  2. simula arrastrar una miniatura fuera de la ventana
//  3. comprueba que se inicia un arrastre nativo con un PDF real y nombre legible
//  4. repite con varias páginas seleccionadas
//
// Uso: npx electron test/e2e-drag.js [archivo.pdf]

const { app, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const os = require('node:os');

const SOURCE =
  process.argv[2] && process.argv[2].toLowerCase().endsWith('.pdf')
    ? path.resolve(process.argv[2])
    : path.join(__dirname, 'sample.pdf');

let openPath = null;
let lastDrag = null;

const log = (...args) => console.log('[e2e-drag]', ...args);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [openPath] });
dialog.showSaveDialog = async () => ({ canceled: true });

require('../electron/main.js');

async function waitForDrag(timeout = 30000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (lastDrag) return lastDrag;
    await wait(120);
  }
  return null;
}

function simulateDragOut(win, index, endX, endY) {
  return win.webContents.executeJavaScript(`
    (() => {
      const thumb = document.querySelector('.thumb[data-index="${index}"]');
      if (!thumb) return { ok: false, error: 'sin miniatura' };
      const rect = thumb.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      const base = {
        bubbles: true,
        cancelable: true,
        pointerId: 7,
        pointerType: 'mouse',
        isPrimary: true,
        button: 0,
        buttons: 1,
      };
      const fire = (type, cx, cy) =>
        thumb.dispatchEvent(
          new PointerEvent(type, { ...base, clientX: cx, clientY: cy }),
        );
      fire('pointerdown', x, y);
      fire('pointermove', x + 10, y + 10);
      fire('pointermove', ${endX}, ${endY});
      return { ok: true, x, y };
    })()
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
      const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'lalo-drag-e2e-'));
      openPath = path.join(tmp, 'documento.pdf');
      await fs.copyFile(SOURCE, openPath);

      // Sustituye el arrastre nativo real (que bloquearía esperando un drop).
      win.webContents.startDrag = (item) => {
        lastDrag = item;
      };

      const thumbs = await win.webContents.executeJavaScript(`
        new Promise((resolve) => {
          document.querySelector('#btn-open').click();
          const t0 = Date.now();
          const timer = setInterval(() => {
            const n = document.querySelectorAll('.thumb').length;
            if (n > 0) { clearInterval(timer); resolve(n); }
            else if (Date.now() - t0 > 30000) { clearInterval(timer); resolve(-1); }
          }, 150);
        })
      `);
      log('miniaturas:', thumbs);
      if (thumbs <= 0) throw new Error('No se pudo abrir el PDF');

      // --- Arrastrar una sola página (la 2)
      const { PDFDocument } = require('pdf-lib');
      lastDrag = null;
      log('arrastre 1:', JSON.stringify(await simulateDragOut(win, 1, -60, 120)));
      const single = await waitForDrag();
      if (!single) throw new Error('No se inició el arrastre de una página');

      const singleName = path.basename(single.file);
      const singleBytes = await fs.readFile(single.file);
      const singleDoc = await PDFDocument.load(singleBytes);
      log(
        'archivo arrastrado:',
        singleName,
        '·',
        singleBytes.length,
        'bytes ·',
        singleDoc.getPageCount(),
        'página(s) · icono',
        single.icon && !single.icon.isEmpty()
          ? `${single.icon.getSize().width}x${single.icon.getSize().height}`
          : 'AUSENTE',
      );
      if (!/documento - página 2\.pdf$/.test(singleName)) {
        throw new Error(`Nombre poco legible: ${singleName}`);
      }
      if (/textClipping/i.test(singleName)) throw new Error('Sigue generando un .textClipping');
      if (singleBytes.subarray(0, 5).toString('latin1') !== '%PDF-') {
        throw new Error('El archivo arrastrado no es un PDF');
      }
      if (singleDoc.getPageCount() !== 1) throw new Error('El PDF arrastrado no tiene una página');
      if (!single.icon || single.icon.isEmpty()) throw new Error('El arrastre no tiene icono');

      // --- Arrastrar varias páginas seleccionadas (1 y 3)
      await wait(350);
      await win.webContents.executeJavaScript(`
        (() => {
          const first = document.querySelector('.thumb[data-index="0"]');
          const third = document.querySelector('.thumb[data-index="2"]');
          first.dispatchEvent(new MouseEvent('click', { bubbles: true }));
          third.dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true }));
        })()
      `);
      lastDrag = null;
      log('arrastre 2:', JSON.stringify(await simulateDragOut(win, 0, -60, 120)));
      const multi = await waitForDrag();
      if (!multi) throw new Error('No se inició el arrastre de varias páginas');

      const multiName = path.basename(multi.file);
      const multiBytes = await fs.readFile(multi.file);
      const multiDoc = await PDFDocument.load(multiBytes);
      log(
        'archivo arrastrado:',
        multiName,
        '·',
        multiBytes.length,
        'bytes ·',
        multiDoc.getPageCount(),
        'página(s)',
      );
      if (!/documento - páginas 1, 3\.pdf$/.test(multiName)) {
        throw new Error(`Nombre poco legible: ${multiName}`);
      }
      if (multiDoc.getPageCount() !== 2) throw new Error('El PDF arrastrado no tiene dos páginas');

      await fs.rm(path.join(app.getPath('temp'), 'lalo-pdf-converter-drag'), {
        recursive: true,
        force: true,
      });
      await fs.rm(tmp, { recursive: true, force: true });
      log('OK');
      app.exit(0);
    } catch (error) {
      console.error('[e2e-drag] FALLO:', error);
      app.exit(1);
    }
  });
});
