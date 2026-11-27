'use strict';

const {
  app,
  BrowserWindow,
  Menu,
  clipboard,
  dialog,
  ipcMain,
  nativeImage,
  nativeTheme,
  protocol,
  screen,
  shell,
} = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const { autoUpdater } = require('electron-updater');

const APP_SCHEME = 'lalo';
const SRC_DIR = path.join(__dirname, '..', 'src');

const TITLEBAR_LIGHT = '#f6f6f8';
const TITLEBAR_DARK = '#262629';

function winTitleOverlay() {
  const dark = nativeTheme.shouldUseDarkColors;
  return {
    color: dark ? TITLEBAR_DARK : TITLEBAR_LIGHT,
    symbolColor: dark ? '#f5f5f7' : '#2c2c2e',
    height: 52,
  };
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

if (process.platform === 'win32') {
  app.setAppUserModelId('com.lalo.pdfconverter');
}

app.on('open-file', (event, filePath) => {
  event.preventDefault();
  if (mainWindow && !mainWindow.isDestroyed()) openPathInWindow(filePath);
  else pendingOpenPath = filePath;
});

let mainWindow = null;
let isQuitting = false;
let hasUnsavedChanges = false;
let forceCloseConfirmed = false;
let pendingOpenPath =
  process.argv.slice(1).find((arg) => /\.pdf$/i.test(arg) && !arg.startsWith('-')) || null;

const hasSingleInstanceLock =
  process.platform === 'darwin' || app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.exit(0);
  process.exit(0);
} else if (process.platform !== 'darwin') {
  app.on('second-instance', (_event, argv) => {
    if (isQuitting) return;
    const pdfArg = argv.slice(1).find((arg) => /\.pdf$/i.test(arg) && !arg.startsWith('-'));
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.focus();
      if (pdfArg) openPathInWindow(pdfArg);
    } else if (app.isReady()) {
      if (pdfArg) pendingOpenPath = pdfArg;
      createWindow();
    }
  });
}

// Red de seguridad para el cierre en Windows/Linux.
// Los temporizadores usan unref() para no retrasar la salida si app.quit()
// termina rápido, pero si Chromium se queda colgado, escalan a app.exit(0)
// y finalmente a process.exit(0) para no dejar ningún proceso zombi.
let forceExitTimer = null;
let hardKillTimer = null;

function disarmForceQuit() {
  if (forceExitTimer) {
    clearTimeout(forceExitTimer);
    forceExitTimer = null;
  }
  if (hardKillTimer) {
    clearTimeout(hardKillTimer);
    hardKillTimer = null;
  }
}

function armForceQuit() {
  if (process.platform === 'darwin' || forceExitTimer) return;
  forceExitTimer = setTimeout(() => {
    forceExitTimer = null;
    try {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.destroy();
    } catch {
      /* ventana ya destruida */
    }
    app.exit(0);
  }, 600);
  forceExitTimer.unref();

  hardKillTimer = setTimeout(() => {
    hardKillTimer = null;
    process.exit(0);
  }, 1200);
  hardKillTimer.unref();
}

function cleanupTemp() {
  stopDragWatch();
  try {
    fsSync.rmSync(dragDir(), { recursive: true, force: true });
  } catch {
    /* la carpeta temporal puede estar en uso */
  }
}

async function openPathInWindow(filePath) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try {
    const bytes = await fs.readFile(filePath);
    mainWindow.webContents.send('menu-action', 'open-file', {
      name: path.basename(filePath),
      path: filePath,
      bytes: new Uint8Array(bytes),
    });
  } catch (error) {
    console.error('No se pudo abrir el archivo de inicio', error);
  }
}

function send(action, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('menu-action', action, payload);
  }
}

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about', label: 'Acerca de Lalo PDF' },
              { type: 'separator' },
              { role: 'hide', label: 'Ocultar' },
              { role: 'hideOthers', label: 'Ocultar otros' },
              { role: 'unhide', label: 'Mostrar todo' },
              { type: 'separator' },
              { role: 'quit', label: 'Salir de Lalo PDF' },
            ],
          },
        ]
      : []),
    {
      label: 'Archivo',
      submenu: [
        { label: 'Abrir PDF…', accelerator: 'CmdOrCtrl+O', click: () => send('open') },
        { label: 'Añadir PDF…', accelerator: 'CmdOrCtrl+Shift+O', click: () => send('add-pdf') },
        { label: 'Añadir imágenes…', accelerator: 'CmdOrCtrl+Shift+I', click: () => send('add-images') },
        { type: 'separator' },
        { label: 'Guardar', accelerator: 'CmdOrCtrl+S', click: () => send('save') },
        {
          label: 'Guardar como…',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => send('save-as'),
        },
        {
          label: 'Exportar como imágenes…',
          accelerator: 'CmdOrCtrl+Shift+E',
          click: () => send('export-images'),
        },
        {
          label: 'Exportar a Word (.docx)…',
          click: () => send('export-word'),
        },
        {
          label: 'Dividir PDF…',
          click: () => send('split-pdf'),
        },
        {
          label: 'Comprimir PDF…',
          click: () => send('compress-pdf'),
        },
        {
          label: 'Protección y permisos…',
          accelerator: 'CmdOrCtrl+Shift+L',
          click: () => send('protect'),
        },
        { type: 'separator' },
        { label: 'Imprimir…', accelerator: 'CmdOrCtrl+P', click: () => send('print') },
        { type: 'separator' },
        isMac ? { role: 'close', label: 'Cerrar ventana' } : { role: 'quit', label: 'Salir' },
      ],
    },
    {
      label: 'Edición',
      submenu: [
        { label: 'Deshacer', accelerator: 'CmdOrCtrl+Z', click: () => send('undo') },
        { label: 'Rehacer', accelerator: 'CmdOrCtrl+Shift+Z', click: () => send('redo') },
        { type: 'separator' },
        { role: 'cut', label: 'Cortar' },
        { role: 'copy', label: 'Copiar' },
        { role: 'paste', label: 'Pegar' },
        { role: 'selectAll', label: 'Seleccionar todo' },
        { type: 'separator' },
        { label: 'Eliminar páginas', accelerator: 'Delete', click: () => send('delete-pages') },
        { label: 'Duplicar páginas', accelerator: 'CmdOrCtrl+D', click: () => send('duplicate-pages') },
      ],
    },
    {
      label: 'Ver',
      submenu: [
        { label: 'Barra lateral', accelerator: 'CmdOrCtrl+Alt+S', click: () => send('toggle-sidebar') },
        { type: 'separator' },
        { label: 'Vista continua', accelerator: 'CmdOrCtrl+1', click: () => send('view-continuous') },
        { label: 'Una página', accelerator: 'CmdOrCtrl+2', click: () => send('view-single') },
        { label: 'Dos páginas', accelerator: 'CmdOrCtrl+3', click: () => send('view-two') },
        { type: 'separator' },
        { label: 'Acercar', accelerator: 'CmdOrCtrl+=', click: () => send('zoom-in') },
        { label: 'Alejar', accelerator: 'CmdOrCtrl+-', click: () => send('zoom-out') },
        { label: 'Tamaño real', accelerator: 'CmdOrCtrl+0', click: () => send('zoom-reset') },
        { label: 'Ajustar a la ventana', accelerator: 'CmdOrCtrl+9', click: () => send('fit-width') },
        { type: 'separator' },
        { label: 'Rotar a la derecha', accelerator: 'CmdOrCtrl+R', click: () => send('rotate-right') },
        { label: 'Rotar a la izquierda', accelerator: 'CmdOrCtrl+Shift+R', click: () => send('rotate-left') },
        { type: 'separator' },
        { label: 'Modo presentación', accelerator: 'F5', click: () => send('presentation') },
        { role: 'togglefullscreen', label: 'Pantalla completa' },
        { role: 'toggleDevTools', label: 'Herramientas de desarrollo' },
      ],
    },
    {
      label: 'Herramientas',
      submenu: [
        { label: 'Seleccionar', accelerator: 'CmdOrCtrl+Alt+1', click: () => send('tool-select') },
        { label: 'Resaltar', accelerator: 'CmdOrCtrl+Alt+2', click: () => send('tool-highlight') },
        { label: 'Lápiz', accelerator: 'CmdOrCtrl+Alt+3', click: () => send('tool-pen') },
        { label: 'Rectángulo', accelerator: 'CmdOrCtrl+Alt+4', click: () => send('tool-rect') },
        { label: 'Círculo / elipse', accelerator: 'CmdOrCtrl+Alt+5', click: () => send('tool-ellipse') },
        { label: 'Línea', accelerator: 'CmdOrCtrl+Alt+6', click: () => send('tool-line') },
        { label: 'Flecha', accelerator: 'CmdOrCtrl+Alt+7', click: () => send('tool-arrow') },
        { label: 'Texto', accelerator: 'CmdOrCtrl+Alt+8', click: () => send('tool-text') },
        { label: 'Borrador', accelerator: 'CmdOrCtrl+Alt+9', click: () => send('tool-eraser') },
        { label: 'Firma manuscrita…', click: () => send('signature') },
        { label: 'Marca de agua…', click: () => send('watermark') },
        { label: 'Números de página…', click: () => send('page-numbers') },
        { type: 'separator' },
        { label: 'Buscar en el documento', accelerator: 'CmdOrCtrl+F', click: () => send('search') },
        { label: 'Insertar página en blanco', click: () => send('insert-blank') },
        { label: 'Combinar PDFs…', click: () => send('add-pdf') },
      ],
    },
    {
      role: 'help',
      label: 'Ayuda',
      submenu: [
        { label: 'Atajos de teclado', click: () => send('shortcuts') },
        { label: 'Acerca de Lalo PDF', click: () => send('about') },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 960,
    minHeight: 620,
    show: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? TITLEBAR_DARK : '#f2f2f4',
    title: 'Lalo PDF',
    icon: path.join(__dirname, '../src/icon.png'),
    ...(process.platform === 'win32'
      ? {
          titleBarStyle: 'hidden',
          titleBarOverlay: winTitleOverlay(),
        }
      : { titleBarStyle: 'hiddenInset' }),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
    },
  });

  mainWindow.once('ready-to-show', () => {
    if (!isQuitting && mainWindow && !mainWindow.isDestroyed()) mainWindow.show();
  });
  mainWindow.on('close', (event) => {
    if (hasUnsavedChanges && !forceCloseConfirmed) {
      event.preventDefault();
      if (mainWindow && !mainWindow.isDestroyed()) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        if (!mainWindow.isVisible()) mainWindow.show();
        mainWindow.focus();
      }
      send('prompt-unsaved-close');
      return;
    }
    stopDragWatch();
    if (process.platform === 'darwin') return;
    isQuitting = true;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.hide();
    }
    // Cubre el cierre aunque no llegue a dispararse window-all-closed.
    armForceQuit();
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    console.log(`[renderer:${level}] ${message} (${sourceId}:${line})`);
  });
  mainWindow.webContents.on('did-fail-load', (_event, code, description, url) => {
    console.error('[did-fail-load]', code, description, url);
  });
  mainWindow.webContents.on('context-menu', (_event, params) => {
    if (!params.selectionText && !params.isEditable) return;
    const menu = Menu.buildFromTemplate([
      ...(params.isEditable ? [{ role: 'cut', label: 'Cortar' }] : []),
      ...(params.selectionText ? [{ role: 'copy', label: 'Copiar' }] : []),
      ...(params.isEditable ? [{ role: 'paste', label: 'Pegar' }] : []),
    ]);
    menu.popup({ window: mainWindow });
  });

  await mainWindow.loadURL(`${APP_SCHEME}://app/index.html`);

  mainWindow.webContents.once('did-finish-load', () => {
    if (!pendingOpenPath) return;
    const filePath = pendingOpenPath;
    pendingOpenPath = null;
    openPathInWindow(filePath);
  });
}

function toBuffer(bytes) {
  if (Buffer.isBuffer(bytes)) return bytes;
  if (bytes instanceof Uint8Array) return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes instanceof ArrayBuffer) return Buffer.from(bytes);
  if (ArrayBuffer.isView(bytes)) return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (Array.isArray(bytes)) return Buffer.from(bytes);
  throw new TypeError('Los datos del archivo no son válidos.');
}

function describe(error) {
  if (!error) return 'Error desconocido';
  if (error.code === 'EBUSY' || error.code === 'EPERM' || error.code === 'EACCES') {
    return 'El archivo está abierto en otro programa o no tienes permisos para escribir en esa carpeta.';
  }
  return error.message || String(error);
}

async function writeFileAtomic(target, data) {
  const dir = path.dirname(target);
  const tmp = path.join(dir, `.${path.basename(target)}.${process.pid}.${Date.now()}.tmp`);
  await fs.writeFile(tmp, data);
  try {
    await fs.rename(tmp, target);
  } catch (error) {
    await fs.rm(tmp, { force: true }).catch(() => {});
    // En Windows, renombrar sobre un archivo en uso falla: se intenta escribir directamente.
    await fs.writeFile(target, data);
  }
  const stat = await fs.stat(target);
  if (stat.size !== data.length) {
    throw new Error('El archivo se escribió de forma incompleta.');
  }
}

/* ------------------------------------------------- arrastrar páginas fuera */

// Icono de reserva (64×80) por si el renderer no manda una miniatura.
const FALLBACK_DRAG_ICON =
  'iVBORw0KGgoAAAANSUhEUgAAAEAAAABQCAYAAACpv3NFAAAAiElEQVR42u3coQ0AIAwEwI6EZ/8VahgGXAkjAPfJm8pzbxqZY/7cAAAAwHF4PQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAqvd1XAAAAAAAAAAAAAAAAALAGAQAAAAAAAAAAPFICAADA7gJkGyXsTfBIngAAAABJRU5ErkJggg==';

const dragDir = () => path.join(app.getPath('temp'), 'lalo-pdf-converter-drag');

function safePdfName(name) {
  const cleaned = String(name || 'Documento.pdf')
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/^[.\s]+/, '')
    .replace(/[.\s]+$/, '')
    .trim();
  let base = (cleaned || 'Documento').replace(/\.pdf$/i, '').slice(0, 100) || 'Documento';
  // Nombres reservados de Windows (CON, PRN, AUX, NUL, COM1…, LPT1…).
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(base)) base = `_${base}`;
  return `${base}.pdf`;
}

async function uniquePath(dir, fileName) {
  const ext = path.extname(fileName);
  const stem = fileName.slice(0, fileName.length - ext.length);
  let candidate = path.join(dir, fileName);
  for (let i = 2; i < 500; i += 1) {
    try {
      await fs.access(candidate);
    } catch {
      return candidate;
    }
    candidate = path.join(dir, `${stem} (${i})${ext}`);
  }
  return path.join(dir, `${stem}-${Date.now()}${ext}`);
}

function decodeDragIcon(icon) {
  if (typeof icon === 'string' && icon.startsWith('data:image/')) {
    const image = nativeImage.createFromDataURL(icon);
    if (!image.isEmpty()) return image;
  }
  return nativeImage.createFromBuffer(Buffer.from(FALLBACK_DRAG_ICON, 'base64'));
}

let dragWatch = null;

function stopDragWatch() {
  if (dragWatch && dragWatch.timer) clearInterval(dragWatch.timer);
  dragWatch = null;
}

function startDragWatch(win, filePath, icon) {
  stopDragWatch();
  dragWatch = {
    window: win,
    filePath,
    icon,
    deadline: Date.now() + 15000,
    timer: null,
  };
  dragWatch.timer = setInterval(checkDragWatch, 40);
}

// Vigila el cursor desde el proceso principal: si sale de la ventana mientras
// se arrastra una miniatura, inicia un arrastre nativo de archivo real.
function checkDragWatch() {
  const session = dragWatch;
  if (!session) return;
  if (Date.now() > session.deadline) {
    stopDragWatch();
    return;
  }
  const win = session.window;
  if (!win || win.isDestroyed()) {
    stopDragWatch();
    return;
  }
  if (!win.isVisible() || win.isMinimized()) return;
  const point = screen.getCursorScreenPoint();
  const bounds = win.getBounds();
  const outside =
    point.x < bounds.x ||
    point.y < bounds.y ||
    point.x >= bounds.x + bounds.width ||
    point.y >= bounds.y + bounds.height;
  if (outside) performNativeDrag(session);
}

function performNativeDrag(session) {
  stopDragWatch();
  const win = session.window;
  if (!win || win.isDestroyed() || win.webContents.isDestroyed()) {
    return { ok: false, error: 'La ventana ya no está disponible.' };
  }
  try {
    win.webContents.send('drag:native', 'started', { filePath: session.filePath });
    win.webContents.startDrag({
      file: session.filePath,
      files: [session.filePath],
      icon: session.icon,
    });
    return { ok: true };
  } catch (error) {
    console.error('No se pudo iniciar el arrastre del PDF', error);
    if (!win.webContents.isDestroyed()) {
      win.webContents.send('drag:native', 'failed', { error: describe(error) });
    }
    return { ok: false, error: describe(error) };
  }
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json',
  '.bcmap': 'application/octet-stream',
};

function registerProtocol() {
  protocol.handle(APP_SCHEME, async (request) => {
    try {
      const url = new URL(request.url);
      let pathname = decodeURIComponent(url.pathname);
      if (!pathname || pathname === '/') pathname = '/index.html';
      const filePath = path.normalize(path.join(SRC_DIR, pathname));
      if (!filePath.startsWith(SRC_DIR + path.sep)) {
        return new Response('Forbidden', { status: 403 });
      }
      const data = await fs.readFile(filePath);
      const mime = MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
      return new Response(new Uint8Array(data), {
        status: 200,
        headers: { 'Content-Type': mime },
      });
    } catch (error) {
      return new Response(`Not found: ${error.message}`, { status: 404 });
    }
  });
}

function registerIpc() {
  ipcMain.handle('file:read-by-path', async (_event, { filePath } = {}) => {
    try {
      if (!filePath) return { ok: false };
      const buf = await fs.readFile(filePath);
      return { ok: true, name: path.basename(filePath), bytes: new Uint8Array(buf) };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });

  ipcMain.handle('dialog:open-pdfs', async () => {
    try {
      const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Abrir PDF',
        properties: ['openFile', 'multiSelections'],
        filters: [{ name: 'Documentos PDF', extensions: ['pdf'] }],
      });
      if (result.canceled) return { canceled: true, files: [] };
      const files = [];
      for (const filePath of result.filePaths) {
        const bytes = await fs.readFile(filePath);
        files.push({ path: filePath, name: path.basename(filePath), bytes: new Uint8Array(bytes) });
      }
      return { canceled: false, files };
    } catch (error) {
      console.error('No se pudo abrir el PDF', error);
      return { canceled: false, files: [], error: describe(error) };
    }
  });

  ipcMain.handle('dialog:open-images', async () => {
    try {
      const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Añadir imágenes',
        properties: ['openFile', 'multiSelections'],
        filters: [{ name: 'Imágenes', extensions: ['png', 'jpg', 'jpeg'] }],
      });
      if (result.canceled) return { canceled: true, files: [] };
      const files = [];
      for (const filePath of result.filePaths) {
        const bytes = await fs.readFile(filePath);
        files.push({ path: filePath, name: path.basename(filePath), bytes: new Uint8Array(bytes) });
      }
      return { canceled: false, files };
    } catch (error) {
      console.error('No se pudo abrir la imagen', error);
      return { canceled: false, files: [], error: describe(error) };
    }
  });

  ipcMain.handle('dialog:save-pdf', async (_event, { defaultName, bytes }) => {
    try {
      const result = await dialog.showSaveDialog(mainWindow, {
        title: 'Guardar PDF',
        defaultPath: defaultName || 'Documento.pdf',
        filters: [{ name: 'Documento PDF', extensions: ['pdf'] }],
        properties: ['showOverwriteConfirmation', 'createDirectory'],
      });
      if (result.canceled || !result.filePath) return { canceled: true };
      const target = /\.pdf$/i.test(result.filePath) ? result.filePath : `${result.filePath}.pdf`;
      const data = toBuffer(bytes);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await writeFileAtomic(target, data);
      return {
        canceled: false,
        path: target,
        name: path.basename(target),
        bytes: data.length,
      };
    } catch (error) {
      console.error('No se pudo guardar el PDF', error);
      return { canceled: false, error: describe(error) };
    }
  });

  // Guardar sobre el archivo abierto (sin diálogo)
  ipcMain.handle('file:write-pdf', async (_event, { filePath, bytes }) => {
    try {
      if (typeof filePath !== 'string' || !filePath) {
        return { ok: false, error: 'La ruta del archivo no es válida.' };
      }
      const data = toBuffer(bytes);
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await writeFileAtomic(filePath, data);
      return { ok: true, path: filePath, name: path.basename(filePath), bytes: data.length };
    } catch (error) {
      console.error('No se pudo guardar el PDF', error);
      return { ok: false, error: describe(error) };
    }
  });

  // Prepara el archivo (PDF o imagen JPEG/PNG) en la carpeta temporal para poder
  // arrastrarlo fuera de la app como un archivo real, con nombre legible.
  ipcMain.handle('file:prepare-drag', async (_event, { fileName, bytes }) => {
    try {
      const data = toBuffer(bytes);
      const isImageDrag = /\.(jpe?g|png)$/i.test(String(fileName || ''));
      if (!data.length || (!isImageDrag && data.subarray(0, 5).toString('latin1') !== '%PDF-')) {
        return { ok: false, error: 'Los datos del archivo no son válidos.' };
      }
      const dir = dragDir();
      await fs.mkdir(dir, { recursive: true });
      const cleanName = isImageDrag
        ? `${safePdfName(String(fileName).replace(/\.(jpe?g|png)$/i, '')).replace(/\.pdf$/i, '')}${path.extname(fileName).toLowerCase()}`
        : safePdfName(fileName);
      const target = await uniquePath(dir, cleanName);
      await fs.writeFile(target, data);
      return { ok: true, path: target, name: path.basename(target), bytes: data.length };
    } catch (error) {
      console.error('No se pudo preparar el archivo para arrastrar', error);
      return { ok: false, error: describe(error) };
    }
  });

  // El renderer avisa de que hay un arrastre en curso; el proceso principal
  // comprueba si el cursor sale de la ventana para convertirlo en arrastre nativo.
  ipcMain.handle('drag:arm', (event, { filePath, icon }) => {
    try {
      if (typeof filePath !== 'string' || !filePath) {
        return { ok: false, error: 'La ruta del archivo no es válida.' };
      }
      const win = BrowserWindow.fromWebContents(event.sender);
      if (!win || win.isDestroyed()) return { ok: false, error: 'La ventana no está disponible.' };
      startDragWatch(win, filePath, decodeDragIcon(icon));
      return { ok: true };
    } catch (error) {
      return { ok: false, error: describe(error) };
    }
  });

  ipcMain.handle('drag:start', (event, { filePath, icon }) => {
    try {
      if (typeof filePath !== 'string' || !filePath) {
        return { ok: false, error: 'La ruta del archivo no es válida.' };
      }
      const win = BrowserWindow.fromWebContents(event.sender);
      if (!win || win.isDestroyed()) return { ok: false, error: 'La ventana no está disponible.' };
      return performNativeDrag({ window: win, filePath, icon: decodeDragIcon(icon) });
    } catch (error) {
      console.error('No se pudo iniciar el arrastre del PDF', error);
      return { ok: false, error: describe(error) };
    }
  });

  ipcMain.handle('drag:disarm', () => {
    stopDragWatch();
    return { ok: true };
  });

  ipcMain.handle('dialog:export-images', async (_event, { baseName, images, startFolder }) => {
    try {
      if (!Array.isArray(images) || !images.length) {
        return { canceled: false, error: 'No hay páginas que exportar.' };
      }
      const options = {
        title: 'Elegir carpeta para las imágenes',
        properties: ['openDirectory', 'createDirectory'],
      };
      if (typeof startFolder === 'string' && startFolder) options.defaultPath = startFolder;
      const result = await dialog.showOpenDialog(mainWindow, options);
      if (result.canceled || !result.filePaths[0]) return { canceled: true };
      const folder = result.filePaths[0];
      const safeBase = (baseName || 'pagina')
        .replace(/[\\/:*?"<>|]+/g, '-')
        .replace(/\.pdf$/i, '')
        .trim() || 'pagina';
      await fs.mkdir(folder, { recursive: true });
      const written = [];
      for (let i = 0; i < images.length; i += 1) {
        const ext = images[i].ext || 'png';
        const name = `${safeBase}-${String(i + 1).padStart(2, '0')}.${ext}`;
        const target = path.join(folder, name);
        await fs.writeFile(target, toBuffer(images[i].bytes));
        written.push(target);
      }
      return { canceled: false, folder, written };
    } catch (error) {
      console.error('No se pudieron exportar las imágenes', error);
      return { canceled: false, error: describe(error) };
    }
  });

  ipcMain.handle('dialog:split-pdf', async (_event, { files, startFolder }) => {
    try {
      if (!Array.isArray(files) || !files.length) {
        return { canceled: false, error: 'No hay archivos que guardar.' };
      }
      const options = {
        title: 'Elegir carpeta para los PDFs divididos',
        properties: ['openDirectory', 'createDirectory'],
      };
      if (typeof startFolder === 'string' && startFolder) options.defaultPath = startFolder;
      const result = await dialog.showOpenDialog(mainWindow, options);
      if (result.canceled || !result.filePaths[0]) return { canceled: true };
      const folder = result.filePaths[0];
      const written = [];
      for (const f of files) {
        const target = path.join(folder, safePdfName(f.name));
        await writeFileAtomic(target, toBuffer(f.bytes));
        written.push(target);
      }
      return { canceled: false, folder, written };
    } catch (error) {
      console.error('No se pudo dividir el PDF', error);
      return { canceled: false, error: describe(error) };
    }
  });

  ipcMain.handle('dialog:export-word', async (_event, { baseName, pages, pdfBytes } = {}) => {
    try {
      if (!Array.isArray(pages) || !pages.length) {
        return { canceled: false, error: 'No hay páginas que exportar.' };
      }
      const safeBase =
        (baseName || 'Documento')
          .replace(/[\\/:*?"<>|]+/g, '-')
          .replace(/\.pdf$/i, '')
          .trim() || 'Documento';
      const result = await dialog.showSaveDialog(mainWindow, {
        title: 'Exportar a Microsoft Word',
        defaultPath: `${safeBase}.docx`,
        filters: [{ name: 'Documento de Word (*.docx)', extensions: ['docx'] }],
        properties: ['showOverwriteConfirmation', 'createDirectory'],
      });
      if (result.canceled || !result.filePath) return { canceled: true };
      const target = /\.docx$/i.test(result.filePath)
        ? result.filePath
        : `${result.filePath}.docx`;

      if (pdfBytes && pdfBytes.length) {
        const { execFile } = require('node:child_process');
        const candidates = [
          path.join(process.resourcesPath || '', 'python', 'python.exe'),
          path.join(__dirname, '..', 'vendor-win', 'python', 'python.exe'),
          'python',
          'python3',
        ];
        const tmpPdf = path.join(app.getPath('temp'), `lalo-docx-${Date.now()}.pdf`);
        try {
          await fs.writeFile(tmpPdf, Buffer.from(pdfBytes));
          for (const py of candidates) {
            if (!py) continue;
            if (path.isAbsolute(py) && !fsSync.existsSync(py)) continue;
            const ok = await new Promise((resolve) => {
              execFile(
                py,
                [
                  '-c',
                  'import sys; from pdf2docx import Converter; cv = Converter(sys.argv[1]); cv.convert(sys.argv[2]); cv.close()',
                  tmpPdf,
                  target,
                ],
                { windowsHide: true, timeout: 120000 },
                (err) => resolve(!err),
              );
            });
            if (ok) {
              return { canceled: false, filePath: target, engine: 'pdf2docx' };
            }
          }
        } finally {
          await fs.rm(tmpPdf, { force: true }).catch(() => {});
        }
      }

      const { Document, Packer, Paragraph, TextRun, ImageRun, PageBreak } = require('docx');
      const children = [];
      pages.forEach((blocks, pageIdx) => {
        if (pageIdx > 0) {
          children.push(new Paragraph({ children: [new PageBreak()] }));
        }
        const pageBlocks = Array.isArray(blocks) && blocks.length ? blocks : [];
        if (!pageBlocks.length) {
          children.push(new Paragraph({ children: [new TextRun('')] }));
          return;
        }
        for (const block of pageBlocks) {
          if (block && block.type === 'image' && block.bytes) {
            const imgData = toBuffer(block.bytes);
            const maxW = 540;
            const rawW = Math.max(20, Number(block.width) || 200);
            const rawH = Math.max(20, Number(block.height) || 150);
            const ratio = rawW > maxW ? maxW / rawW : 1;
            children.push(
              new Paragraph({
                children: [
                  new ImageRun({
                    data: imgData,
                    type: 'jpg',
                    transformation: {
                      width: Math.round(rawW * ratio),
                      height: Math.round(rawH * ratio),
                    },
                  }),
                ],
              }),
            );
          } else if (block && Array.isArray(block.runs)) {
            children.push(
              new Paragraph({
                children: block.runs.map(
                  (run) =>
                    new TextRun({
                      text: String(run.text ?? ''),
                      size: Math.round((Number(run.sizePt) || 11) * 2),
                      bold: !!run.bold,
                      italics: !!run.italic,
                    }),
                ),
              }),
            );
          }
        }
      });

      const doc = new Document({
        sections: [{ children }],
      });
      const buffer = await Packer.toBuffer(doc);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await writeFileAtomic(target, buffer);
      return { canceled: false, path: target, name: path.basename(target) };
    } catch (error) {
      console.error('No se pudo exportar a Word', error);
      return { canceled: false, error: describe(error) };
    }
  });

  ipcMain.handle('dialog:save-signature', async (_event, { bytes, defaultName }) => {
    try {
      const result = await dialog.showSaveDialog(mainWindow, {
        title: 'Guardar firma',
        defaultPath: defaultName || 'firma.png',
        filters: [{ name: 'Imagen PNG (*.png)', extensions: ['png'] }],
        properties: ['showOverwriteConfirmation', 'createDirectory'],
      });
      if (result.canceled || !result.filePath) return { canceled: true };
      const target = /\.png$/i.test(result.filePath)
        ? result.filePath
        : `${result.filePath}.png`;
      const data = toBuffer(bytes);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await writeFileAtomic(target, data);
      return { canceled: false, path: target, name: path.basename(target) };
    } catch (error) {
      console.error('No se pudo guardar la firma', error);
      return { canceled: false, error: describe(error) };
    }
  });

  ipcMain.handle('thumb:context-menu', async (event, { count = 1 } = {}) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win.isDestroyed()) return { action: null };
    return await new Promise((resolve) => {
      let resolved = false;
      let clicked = false;
      const done = (payload) => {
        if (resolved) return;
        resolved = true;
        resolve(payload);
      };
      const suffix = count > 1 ? ` (${count} páginas)` : '';
      const menu = Menu.buildFromTemplate([
        {
          label: `Exportar como…${suffix}`,
          click: () => {
            clicked = true;
            done({ action: 'export' });
          },
        },
        { type: 'separator' },
        {
          label: count > 1 ? `Duplicar ${count} páginas` : 'Duplicar página',
          click: () => {
            clicked = true;
            done({ action: 'duplicate' });
          },
        },
        {
          label: 'Rotar a la derecha (90°)',
          click: () => {
            clicked = true;
            done({ action: 'rotate-right' });
          },
        },
        {
          label: 'Rotar a la izquierda (-90°)',
          click: () => {
            clicked = true;
            done({ action: 'rotate-left' });
          },
        },
        {
          label: 'Insertar página en blanco',
          click: () => {
            clicked = true;
            done({ action: 'insert-blank' });
          },
        },
        { type: 'separator' },
        {
          label: count > 1 ? `Eliminar ${count} páginas` : 'Eliminar página',
          click: () => {
            clicked = true;
            done({ action: 'delete' });
          },
        },
      ]);
      menu.popup({
        window: win,
        callback: () => {
          setTimeout(() => {
            if (!clicked) done({ action: null });
          }, 120);
        },
      });
    });
  });

  ipcMain.handle('dialog:export-selection', async (_event, { defaultName }) => {
    try {
      const result = await dialog.showSaveDialog(mainWindow, {
        title: 'Exportar selección como',
        defaultPath: defaultName || 'paginas.pdf',
        filters: [
          { name: 'Documento PDF (*.pdf)', extensions: ['pdf'] },
          { name: 'Imagen JPEG (*.jpg)', extensions: ['jpg', 'jpeg'] },
          { name: 'Imagen PNG (*.png)', extensions: ['png'] },
        ],
        properties: ['showOverwriteConfirmation', 'createDirectory'],
      });
      if (result.canceled || !result.filePath) return { canceled: true };
      const target = /\.(pdf|jpe?g|png)$/i.test(result.filePath)
        ? result.filePath
        : `${result.filePath}.pdf`;
      const ext = path.extname(target).toLowerCase().replace('.', '');
      return {
        canceled: false,
        path: target,
        ext: ext === 'jpeg' ? 'jpg' : ext,
        name: path.basename(target),
      };
    } catch (error) {
      console.error('No se pudo abrir el diálogo de exportación', error);
      return { canceled: false, error: describe(error) };
    }
  });

  ipcMain.handle('text:context-menu', async (event, current = {}) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win.isDestroyed()) return null;
    return await new Promise((resolve) => {
      let resolved = false;
      let clicked = false;
      const done = (payload) => {
        if (resolved) return;
        resolved = true;
        resolve(payload);
      };
      const colors = [
        { label: 'Negro     ⚫', value: '#2c2c2e' },
        { label: 'Azul       🔵', value: '#0a84ff' },
        { label: 'Verde     🟢', value: '#32d74b' },
        { label: 'Rojo       🔴', value: '#ff453a' },
        { label: 'Amarillo  🟡', value: '#ffd60a' },
      ];
      const menu = Menu.buildFromTemplate([
        {
          label: 'Color',
          submenu: colors.map((c) => ({
            label: c.label,
            type: 'checkbox',
            checked: current.color === c.value,
            click: () => {
              clicked = true;
              done({ prop: 'color', value: c.value });
            },
          })),
        },
        {
          label: 'Tipo de texto',
          submenu: [
            {
              label: 'Negrita',
              type: 'checkbox',
              checked: !!current.bold,
              click: () => {
                clicked = true;
                done({ prop: 'bold', value: !current.bold });
              },
            },
            {
              label: 'Cursiva',
              type: 'checkbox',
              checked: !!current.italic,
              click: () => {
                clicked = true;
                done({ prop: 'italic', value: !current.italic });
              },
            },
            {
              label: 'Subrayado',
              type: 'checkbox',
              checked: !!current.underline,
              click: () => {
                clicked = true;
                done({ prop: 'underline', value: !current.underline });
              },
            },
            {
              label: 'Tachado',
              type: 'checkbox',
              checked: !!current.strike,
              click: () => {
                clicked = true;
                done({ prop: 'strike', value: !current.strike });
              },
            },
            { type: 'separator' },
            {
              label: 'Tamaño',
              submenu: [8, 9, 10, 12, 14, 18, 24, 32, 48].map((sz) => ({
                label: String(sz),
                type: 'checkbox',
                checked: (current.size || 14) === sz,
                click: () => {
                  clicked = true;
                  done({ prop: 'size', value: sz });
                },
              })),
            },
          ],
        },
        {
          label: 'Alineación',
          submenu: [
            {
              label: 'Izquierda',
              type: 'checkbox',
              checked: (current.align || 'left') === 'left',
              click: () => {
                clicked = true;
                done({ prop: 'align', value: 'left' });
              },
            },
            {
              label: 'Centro',
              type: 'checkbox',
              checked: current.align === 'center',
              click: () => {
                clicked = true;
                done({ prop: 'align', value: 'center' });
              },
            },
            {
              label: 'Derecha',
              type: 'checkbox',
              checked: current.align === 'right',
              click: () => {
                clicked = true;
                done({ prop: 'align', value: 'right' });
              },
            },
          ],
        },
        {
          label: 'Borde',
          submenu: [
            {
              label: 'Sin borde',
              type: 'checkbox',
              checked: !current.borderColor || current.borderColor === 'none',
              click: () => {
                clicked = true;
                done({ prop: 'borderColor', value: 'none' });
              },
            },
            ...colors.map((c) => ({
              label: c.label,
              type: 'checkbox',
              checked: current.borderColor === c.value,
              click: () => {
                clicked = true;
                done({ prop: 'borderColor', value: c.value });
              },
            })),
            { type: 'separator' },
            ...[
              { w: 1, label: '────────' },
              { w: 2, label: '━━━━━━━━' },
              { w: 3, label: '▄▄▄▄▄▄▄▄' },
              { w: 4, label: '████████' },
            ].map(({ w, label }) => ({
              label,
              type: 'checkbox',
              checked: (current.borderWidth || 2) === w,
              click: () => {
                clicked = true;
                done({ prop: 'borderWidth', value: w });
              },
            })),
            { type: 'separator' },
            {
              label: 'Esquinas rectas',
              type: 'checkbox',
              checked: !(current.borderRadius > 0),
              click: () => {
                clicked = true;
                done({ prop: 'borderRadius', value: 0 });
              },
            },
            {
              label: 'Esquinas redondeadas',
              type: 'checkbox',
              checked: current.borderRadius > 0,
              click: () => {
                clicked = true;
                done({ prop: 'borderRadius', value: 8 });
              },
            },
          ],
        },
      ]);
      menu.popup({
        window: win,
        callback: () => {
          setTimeout(() => {
            if (!clicked) done(null);
          }, 120);
        },
      });
    });
  });

  // Imprime el documento tal y como lo prepara el renderer en #print-root.
  // `toPdf` genera un PDF en la carpeta temporal: se usa en las pruebas para
  // verificar el resultado sin depender de una impresora física.
  ipcMain.handle('print:pdf', async (event, { toPdf = false } = {}) => {
    try {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (!win || win.isDestroyed()) {
        return { ok: false, error: 'La ventana no está disponible.' };
      }
      if (toPdf) {
        const data = await win.webContents.printToPDF({ printBackground: true });
        const target = path.join(app.getPath('temp'), `lalo-print-${Date.now()}.pdf`);
        await fs.writeFile(target, data);
        return { ok: true, path: target, name: path.basename(target), bytes: data.length };
      }
      return await new Promise((resolve) => {
        win.webContents.print({ printBackground: true }, (success, reason) => {
          resolve({
            ok: !!success,
            error: success ? undefined : reason || 'Se canceló la impresión.',
          });
        });
      });
    } catch (error) {
      console.error('No se pudo imprimir el documento', error);
      return { ok: false, error: describe(error) };
    }
  });

  ipcMain.handle('shell:show-item', (_event, filePath) => {
    if (typeof filePath === 'string' && filePath) shell.showItemInFolder(filePath);
  });

  ipcMain.handle('image:context-menu', async (event, { bytes, webpBytes, defaultName }) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win.isDestroyed()) return { action: null };
    const data = toBuffer(bytes);
    return await new Promise((resolve) => {
      let resolved = false;
      let clicked = false;
      const done = (payload) => {
        if (resolved) return;
        resolved = true;
        resolve(payload);
      };
      const menu = Menu.buildFromTemplate([
        {
          label: 'Copiar imagen',
          click: () => {
            clicked = true;
            try {
              const img = nativeImage.createFromBuffer(data);
              clipboard.writeImage(img);
              done({ action: 'copy', ok: true });
            } catch (error) {
              done({ action: 'copy', ok: false, error: describe(error) });
            }
          },
        },
        {
          label: 'Guardar imagen como…',
          click: async () => {
            clicked = true;
            try {
              const result = await dialog.showSaveDialog(win, {
                title: 'Guardar imagen como',
                defaultPath: defaultName || 'imagen.jpg',
                filters: [
                  { name: 'Imagen JPEG (*.jpg)', extensions: ['jpg', 'jpeg'] },
                  { name: 'Imagen PNG (*.png)', extensions: ['png'] },
                  { name: 'Imagen WebP (*.webp)', extensions: ['webp'] },
                  { name: 'Documento PDF (*.pdf)', extensions: ['pdf'] },
                ],
                properties: ['showOverwriteConfirmation', 'createDirectory'],
              });
              if (result.canceled || !result.filePath) {
                done({ action: 'save', canceled: true });
                return;
              }
              const target = /\.(jpe?g|png|webp|pdf)$/i.test(result.filePath)
                ? result.filePath
                : `${result.filePath}.jpg`;
              const ext = path.extname(target).toLowerCase();
              let outBytes = data;
              if (ext === '.pdf') {
                done({ action: 'save-pdf', target, name: path.basename(target) });
                return;
              }
              if (ext === '.png') {
                outBytes = nativeImage.createFromBuffer(data).toPNG();
              } else if (ext === '.webp' && webpBytes) {
                outBytes = toBuffer(webpBytes);
              }
              await fs.mkdir(path.dirname(target), { recursive: true });
              await writeFileAtomic(target, outBytes);
              done({ action: 'save', canceled: false, path: target, name: path.basename(target) });
            } catch (error) {
              done({ action: 'save', ok: false, error: describe(error) });
            }
          },
        },
      ]);
      menu.popup({
        window: win,
        callback: () => {
          setTimeout(() => {
            if (!clicked) done({ action: null });
          }, 120);
        },
      });
    });
  });

  ipcMain.on('app:dirty', (_event, dirty) => {
    hasUnsavedChanges = !!dirty;
  });

  ipcMain.on('app:confirm-quit', () => {
    hasUnsavedChanges = false;
    forceCloseConfirmed = true;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.close();
    } else {
      app.quit();
    }
  });

  ipcMain.handle('app:info', () => ({
    name: app.getName(),
    version: app.getVersion(),
    electron: process.versions.electron,
    platform: process.platform,
  }));

  ipcMain.handle('app:open-external', async (_event, url) => {
    if (typeof url === 'string' && url.startsWith('https://github.com/laloj77/Lalo-PDF')) {
      await shell.openExternal(url);
      return true;
    }
    return false;
  });

  ipcMain.handle('app:check-updates', async () => {
    if (!app.isPackaged) return { ok: false, packaged: false };
    try {
      await autoUpdater.checkForUpdates();
      return { ok: true, packaged: true };
    } catch (error) {
      return { ok: false, packaged: true, error: error.message };
    }
  });

  ipcMain.handle('app:get-latest-version', async () => {
    try {
      const res = await fetch('https://github.com/laloj77/Lalo-PDF/releases/latest', {
        redirect: 'follow',
        headers: { 'User-Agent': 'Lalo-PDF' },
      });
      const tag = String(res.url || '').split('/').pop() || '';
      if (/^v?\d+\.\d+\.\d+/.test(tag)) {
        return { ok: true, version: tag };
      }
      return { ok: false };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });

  ipcMain.handle('app:set-theme', (_event, theme) => {
    if (!mainWindow || mainWindow.isDestroyed()) return false;
    const dark = theme === 'dark';
    if (process.platform === 'win32') {
      mainWindow.setTitleBarOverlay({
        color: dark ? TITLEBAR_DARK : '#f2f2f4',
        symbolColor: dark ? '#f5f5f7' : '#1d1d1f',
        height: 40,
      });
    }
    mainWindow.setBackgroundColor(dark ? TITLEBAR_DARK : '#f2f2f4');
    return true;
  });
}

function setupAutoUpdater() {
  if (!app.isPackaged) return;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', async (info) => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const { response } = await dialog.showMessageBox(mainWindow, {
      type: 'info',
      buttons: ['Actualizar ahora', 'Más tarde'],
      defaultId: 0,
      cancelId: 1,
      title: 'Actualización disponible',
      message: `Nueva versión v${info.version} disponible`,
      detail:
        'Al pulsar "Actualizar ahora", se descargará la nueva versión, se cerrará la app y se instalará automáticamente manteniendo tu configuración.',
    });
    if (response === 0) {
      autoUpdater.downloadUpdate().catch(() => {});
    }
  });

  autoUpdater.on('update-downloaded', () => {
    forceCloseConfirmed = true;
    autoUpdater.quitAndInstall(true, true);
  });

  autoUpdater.on('error', () => {
    /* ignore background update check errors */
  });

  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(() => {});
  }, 4000).unref();
}

app.whenReady().then(async () => {
  fs.rm(dragDir(), { recursive: true, force: true }).catch(() => {});
  registerProtocol();
  registerIpc();
  buildMenu();
  await createWindow();
  setupAutoUpdater();

  nativeTheme.on('updated', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const dark = nativeTheme.shouldUseDarkColors;
    mainWindow.setTitleBarOverlay(winTitleOverlay());
    mainWindow.setBackgroundColor(dark ? TITLEBAR_DARK : '#f2f2f4');
  });

  app.on('activate', () => {
    if (!isQuitting && BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', () => {
  isQuitting = true;
  // Se arma aquí también para cubrir «Salir» del menú, no solo el botón de cerrar.
  armForceQuit();
});

app.on('will-quit', () => {
  cleanupTemp();
});

app.on('quit', () => {
  disarmForceQuit();
  cleanupTemp();
});

app.on('window-all-closed', () => {
  if (process.platform === 'darwin') return;
  isQuitting = true;
  cleanupTemp();
  armForceQuit();
  app.quit();
});
