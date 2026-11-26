'use strict';

const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('lalo', {
  platform: process.platform,
  openPdfs: () => ipcRenderer.invoke('dialog:open-pdfs'),
  readFileByPath: (filePath) => ipcRenderer.invoke('file:read-by-path', { filePath }),
  openImages: () => ipcRenderer.invoke('dialog:open-images'),
  savePdf: (defaultName, bytes) => ipcRenderer.invoke('dialog:save-pdf', { defaultName, bytes }),
  savePdfInPlace: (filePath, bytes) => ipcRenderer.invoke('file:write-pdf', { filePath, bytes }),
  prepareDragFile: (fileName, bytes) =>
    ipcRenderer.invoke('file:prepare-drag', { fileName, bytes }),
  armDrag: (filePath, icon) => ipcRenderer.invoke('drag:arm', { filePath, icon }),
  startDrag: (filePath, icon) => ipcRenderer.invoke('drag:start', { filePath, icon }),
  cancelDrag: () => ipcRenderer.invoke('drag:disarm'),
  exportImages: (baseName, images, startFolder) =>
    ipcRenderer.invoke('dialog:export-images', { baseName, images, startFolder }),
  exportWord: (baseName, pages) =>
    ipcRenderer.invoke('dialog:export-word', { baseName, pages }),
  splitPdf: (files, startFolder) =>
    ipcRenderer.invoke('dialog:split-pdf', { files, startFolder }),
  saveSignature: (bytes, defaultName) =>
    ipcRenderer.invoke('dialog:save-signature', { bytes, defaultName }),
  showThumbContextMenu: (count) =>
    ipcRenderer.invoke('thumb:context-menu', { count }),
  pickExportSelection: (defaultName) =>
    ipcRenderer.invoke('dialog:export-selection', { defaultName }),
  showTextContextMenu: (current) =>
    ipcRenderer.invoke('text:context-menu', current),
  setDirtyState: (dirty) => ipcRenderer.send('app:dirty', !!dirty),
  confirmQuit: () => ipcRenderer.send('app:confirm-quit'),
  print: (options) => ipcRenderer.invoke('print:pdf', options || {}),
  showItemInFolder: (filePath) => ipcRenderer.invoke('shell:show-item', filePath),
  showImageContextMenu: (bytes, defaultName, webpBytes) =>
    ipcRenderer.invoke('image:context-menu', { bytes, webpBytes, defaultName }),
  appInfo: () => ipcRenderer.invoke('app:info'),
  pathForFile: (file) => {
    try {
      return webUtils.getPathForFile(file);
    } catch {
      return file?.path || '';
    }
  },
  getPathForFile: (file) => {
    try {
      return webUtils.getPathForFile(file);
    } catch {
      return file?.path || '';
    }
  },
  onMenu: (callback) => {
    const listener = (_event, action, payload) => callback(action, payload);
    ipcRenderer.on('menu-action', listener);
    return () => ipcRenderer.removeListener('menu-action', listener);
  },
  onDragNative: (callback) => {
    const listener = (_event, action, payload) => callback(action, payload);
    ipcRenderer.on('drag:native', listener);
    return () => ipcRenderer.removeListener('drag:native', listener);
  },
  openExternal: (url) => ipcRenderer.invoke('app:open-external', url),
  checkForUpdates: () => ipcRenderer.invoke('app:check-updates'),
});
