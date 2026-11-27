(() => {
  'use strict';

  const {
    PDFDocument,
    PDFName,
    PDFArray,
    PDFDict,
    PDFString,
    PDFNumber,
    PDFRawStream,
    decodePDFRawStream,
    StandardFonts,
    degrees,
    rgb,
    LineCapStyle,
  } = window.PDFLib;
  const pdfjsLib = window.pdfjsLib;
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('vendor/pdf.worker.js', document.baseURI).href;

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  const uid = (prefix = 'id') =>
    `${prefix}_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-3)}`;
  const normAngle = (angle) => ((Math.round(angle || 0) % 360) + 360) % 360;
  const isPdf = (file) => /\.pdf$/i.test(file.name || '');
  const isImage = (file) => /\.(png|jpe?g)$/i.test(file.name || '');
  const baseName = (name) => String(name || 'Documento').replace(/\.pdf$/i, '') || 'Documento';

  const platform = window.lalo?.platform || 'web';
  const isMac = platform === 'darwin';
  document.body.classList.add(`platform-${platform}`);

  const FONT_FAMILY = '-apple-system, "Segoe UI", Helvetica, Arial, sans-serif';
  const LINE_HEIGHT = 1.28;
  const HANDLE_RADIUS = 4;
  const HANDLE_HIT = 9;
  const MIN_ANN_SIZE = 0.008;

  const state = {
    sources: new Map(),
    pages: [],
    selected: new Set(),
    anchorIndex: null,
    current: 0,
    viewMode: 'continuous',
    zoomMode: 'fit',
    scale: 1,
    currentScale: 1,
    markupOpen: false,
    tool: 'select',
    color: '#ffd60a',
    textColor: '#2c2c2e',
    strokeWidth: 3,
    fontSize: 14,
    annotations: new Map(),
    formValues: new Map(),
    selection: null,
    textEdit: null,
    history: [],
    future: [],
    pdf: null,
    workingBytes: null,
    fileName: 'Sin título.pdf',
    filePath: null,
    security: null,
    watermark: null,
    pageNumbers: null,
    dirty: false,
    sidebarHidden: false,
    search: { query: '', occurrences: [], index: -1, rects: new Map(), token: 0 },
    drag: null,
    renderToken: 0,
    thumbToken: 0,
    observer: null,
    scrollTimer: null,
  };

  const el = {
    app: $('#app'),
    viewer: $('#viewer'),
    viewerWrap: $('#viewer-wrap'),
    thumbs: $('#thumbs'),
    sidebar: $('#sidebar'),
    pageCount: $('#page-count'),
    statusLeft: $('#status-left'),
    statusRight: $('#status-right'),
    zoomLabel: $('#zoom-label'),
    zoomMenu: $('#zoom-menu'),
    exportMenu: $('#export-menu'),
    markupBar: $('#markup-bar'),
    emptyState: $('#empty-state'),
    searchPanel: $('#search-panel'),
    searchInput: $('#search-input'),
    searchCount: $('#search-count'),
    searchResults: $('#search-results'),
    textEditor: $('#text-editor'),
    textInput: $('#text-editor-input'),
    textHead: $('#text-editor-head'),
    textSize: $('#text-size-select'),
    fontSize: $('#font-size-select'),
    toast: $('#toast'),
    dropOverlay: $('#drop-overlay'),
    shortcutsModal: $('#shortcuts-modal'),
    passwordModal: $('#password-modal'),
    passwordForm: $('#password-form'),
    passwordDesc: $('#password-desc'),
    passwordInput: $('#password-input'),
    passwordError: $('#password-error'),
    protectModal: $('#protect-modal'),
    protectForm: $('#protect-form'),
    protectUserPass: $('#protect-user-pass'),
    protectOwnerPass: $('#protect-owner-pass'),
    protectPrinting: $('#protect-printing'),
    protectModifying: $('#protect-modifying'),
    protectCopying: $('#protect-copying'),
    protectAnnotating: $('#protect-annotating'),
    protectError: $('#protect-error'),
    protectClear: $('#protect-clear'),
    printRoot: $('#print-root'),
    btnSidebar: $('#btn-sidebar'),
    btnMarkup: $('#btn-markup'),
    btnSearch: $('#btn-search'),
    btnProtect: $('#btn-protect'),
    btnPrint: $('#btn-print'),
    btnUndo: $('#btn-undo'),
    btnRedo: $('#btn-redo'),
    btnDeletePages: $('#btn-delete-pages'),
  };

  /* ------------------------------------------------------------------ utils */

  let toastTimer = null;
  function toast(message, duration = 2400) {
    el.toast.textContent = message;
    el.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.toast.hidden = true;
    }, duration);
  }

  let busyCount = 0;
  function setBusy(on) {
    busyCount = Math.max(0, busyCount + (on ? 1 : -1));
    document.body.classList.toggle('busy', busyCount > 0);
  }

  function hexToRgb(hex) {
    const value = parseInt(String(hex || '#ffd60a').slice(1), 16);
    return rgb(((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255);
  }

  function pdfSafe(text) {
    return String(text || '').replace(/[^\u0000-\u00ff]/g, '?');
  }

  function labelForMode() {
    if (state.viewMode === 'single') return 'Una página';
    if (state.viewMode === 'two') return 'Dos páginas';
    return 'Vista continua';
  }

  let autosaveTimer = null;

  function setDirty(value = true) {
    state.dirty = value;
    window.lalo?.setDirtyState?.(value);
    updateStatus();
    if (value && $('#chk-autosave')?.checked && state.filePath && state.pages.length) {
      clearTimeout(autosaveTimer);
      autosaveTimer = setTimeout(() => {
        if (state.dirty && $('#chk-autosave')?.checked && state.filePath) {
          save();
        }
      }, 1500);
    }
  }

  function updateStatus() {
    const total = state.pages.length;
    if (!total) {
      el.statusLeft.textContent = 'Sin documento';
      if ($('#page-jump-wrap')) $('#page-jump-wrap').hidden = true;
      el.statusRight.textContent = '';
      el.pageCount.textContent = '0 páginas';
      if (document.activeElement !== el.zoomLabel) el.zoomLabel.value = '100 %';
      el.emptyState.hidden = false;
      document.title = 'Lalo PDF';
      if (typeof renderRecentFiles === 'function') renderRecentFiles();
      if (typeof renderTabBar === 'function') renderTabBar();
      return;
    }
    if (typeof renderTabBar === 'function') renderTabBar();
    state.current = clamp(state.current, 0, total - 1);
    el.emptyState.hidden = true;
    el.statusLeft.textContent =
      `Página ${state.current + 1} de ${total}` +
      (state.dirty ? '  ·  Cambios sin guardar' : '') +
      (state.fileName ? `  ·  ${state.fileName}` : '');
    const jumpWrap = $('#page-jump-wrap');
    const jumpInput = $('#page-jump');
    if (jumpWrap && jumpInput) {
      jumpWrap.hidden = false;
      jumpInput.max = String(total);
      if (document.activeElement !== jumpInput) jumpInput.value = String(state.current + 1);
    }
    el.statusRight.textContent = `${Math.round(state.currentScale * 100)} %  ·  ${labelForMode()}`;
    el.pageCount.textContent = `${total} página${total === 1 ? '' : 's'}`;
    if (document.activeElement !== el.zoomLabel) {
      el.zoomLabel.value = `${Math.round(state.currentScale * 100)} %`;
    }
    document.title = `${state.dirty ? '● ' : ''}${state.fileName} — Lalo PDF`;
  }

  function colorInUse() {
    const selected = getSelectedAnnotation();
    if (selected && selected.color) return selected.color;
    return state.tool === 'text' ? state.textColor : state.color;
  }

  function updateToolbarState() {
    el.btnSidebar.classList.toggle('active', !state.sidebarHidden);
    el.btnMarkup.classList.toggle('active', state.markupOpen);
    el.btnSearch.classList.toggle('active', !el.searchPanel.hidden);
    if (el.btnProtect) el.btnProtect.classList.toggle('is-protected', !!state.security);
    if (state.markupOpen) {
      el.markupBar.classList.remove('closing');
      el.markupBar.hidden = false;
    } else if (!el.markupBar.hidden && !el.markupBar.classList.contains('closing')) {
      el.markupBar.classList.add('closing');
      setTimeout(() => {
        if (!state.markupOpen) {
          el.markupBar.hidden = true;
          el.markupBar.classList.remove('closing');
        }
      }, 350);
    }
    el.viewer.classList.toggle('markup-open', state.markupOpen);
    el.viewer.classList.toggle('tool-active', state.markupOpen && state.tool !== 'select');
    el.viewer.classList.toggle('eraser', state.markupOpen && state.tool === 'eraser');
    $$('#view-modes button').forEach((button) => {
      button.classList.toggle('active', button.dataset.view === state.viewMode);
    });
    $$('.tool-btn[data-tool]').forEach((button) => {
      button.classList.toggle('active', button.dataset.tool === state.tool);
    });
    const color = colorInUse();
    $$('.swatch').forEach((swatch) => {
      swatch.classList.toggle('active', swatch.dataset.color === color);
    });
    const selected = getSelectedAnnotation();
    const opGroup = $('#signature-opacity-group');
    const opInput = $('#signature-opacity');
    if (opGroup && opInput) {
      const isSig = selected && selected.type === 'signature';
      opGroup.hidden = !isSig;
      if (isSig) opInput.value = String(Math.round((selected.opacity ?? 1) * 100));
    }
    const thickness = selected && selected.width ? selected.width : state.strokeWidth;
    $$('.thickness-btn').forEach((button) => {
      button.classList.toggle('active', Number(button.dataset.width) === thickness);
    });
    const size = selected && selected.type === 'text' ? selected.size : state.fontSize;
    setFontOption(el.fontSize, size || 14);
    const redactBtn = $('#btn-apply-redact');
    if (redactBtn) {
      let hasRedact = false;
      for (const list of state.annotations.values()) {
        if (list && list.some((a) => a.type === 'redact')) {
          hasRedact = true;
          break;
        }
      }
      redactBtn.hidden = !hasRedact;
    }
    updateUndoButtons();
  }

  function updateUndoButtons() {
    const noUndo = state.history.length === 0;
    const noRedo = state.future.length === 0;
    el.btnUndo.disabled = noUndo;
    el.btnRedo.disabled = noRedo;
    const railUndo = $('#btn-rail-undo');
    const railRedo = $('#btn-rail-redo');
    if (railUndo) railUndo.disabled = noUndo;
    if (railRedo) railRedo.disabled = noRedo;
  }

  /* ---------------------------------------------------------------- history */

  function snapshot(structural) {
    return {
      structural,
      pages: JSON.parse(JSON.stringify(state.pages)),
      annotations: Array.from(state.annotations.entries()).map(([key, value]) => [
        key,
        JSON.parse(JSON.stringify(value)),
      ]),
      selected: Array.from(state.selected),
      current: state.current,
      selection: state.selection ? { ...state.selection } : null,
    };
  }

  function pushHistory(structural = true) {
    pushHistoryEntry(snapshot(structural));
  }

  function pushHistoryEntry(entry) {
    state.history.push(entry);
    if (state.history.length > 80) state.history.shift();
    state.future = [];
    updateUndoButtons();
  }

  function clearSelection() {
    if (!state.selection) return;
    state.selection = null;
    redrawAllOverlays();
  }

  async function restoreSnapshot(entry) {
    state.pages = entry.pages;
    state.annotations = new Map(entry.annotations);
    state.selected = new Set(entry.selected);
    state.current = entry.current;
    state.selection = entry.selection ? { ...entry.selection } : null;
    if (entry.structural) {
      await refresh({ preserveScroll: true });
    } else {
      redrawAllOverlays();
      updateThumbSelection();
      updateStatus();
      updateUndoButtons();
    }
  }

  async function undo() {
    const entry = state.history.pop();
    if (!entry) {
      toast('Nada que deshacer');
      return;
    }
    state.future.push({ ...snapshot(entry.structural), structural: entry.structural });
    updateUndoButtons();
    await restoreSnapshot(entry);
    setDirty(true);
    updateUndoButtons();
  }

  async function redo() {
    const entry = state.future.pop();
    if (!entry) {
      toast('Nada que rehacer');
      return;
    }
    state.history.push({ ...snapshot(entry.structural), structural: entry.structural });
    updateUndoButtons();
    await restoreSnapshot(entry);
    setDirty(true);
    updateUndoButtons();
  }

  /* ------------------------------------------------------------ doc model */

  let passwordPromptResolver = null;

  function resolvePasswordPrompt(value) {
    const resolver = passwordPromptResolver;
    passwordPromptResolver = null;
    if (el.passwordModal) el.passwordModal.hidden = true;
    if (resolver) resolver(value);
  }

  function askPdfPassword(fileName, isRetry = false) {
    if (!el.passwordModal || !el.passwordInput) return Promise.resolve(null);
    return new Promise((resolve) => {
      passwordPromptResolver = resolve;
      el.passwordDesc.textContent = `Introduce la contraseña para abrir «${fileName}».`;
      el.passwordError.hidden = !isRetry;
      el.passwordInput.value = '';
      el.passwordModal.hidden = false;
      setTimeout(() => el.passwordInput.focus(), 20);
    });
  }

  async function loadPdfDocumentWithPassword(bytes, fileName) {
    try {
      const doc = await PDFDocument.load(bytes);
      return { doc, password: undefined };
    } catch (error) {
      const msg = String(error?.message || error || '');
      if (!/encrypted|password/i.test(msg)) throw error;
    }

    try {
      const doc = await PDFDocument.load(bytes, { password: '' });
      return { doc, password: '' };
    } catch (error) {
      const msg = String(error?.message || error || '');
      if (!/password/i.test(msg)) throw error;
    }

    let isRetry = false;
    while (true) {
      const password = await askPdfPassword(fileName, isRetry);
      if (password === null) return null;
      try {
        const doc = await PDFDocument.load(bytes, { password });
        return { doc, password };
      } catch (error) {
        const msg = String(error?.message || error || '');
        if (/password/i.test(msg)) {
          isRetry = true;
          continue;
        }
        throw error;
      }
    }
  }

  async function appendSourceFile(file) {
    try {
      const loaded = await loadPdfDocumentWithPassword(file.bytes, file.name);
      if (!loaded) return 0;
      const { doc, password } = loaded;
      const sourceId = uid('src');
      state.sources.set(sourceId, {
        id: sourceId,
        name: file.name,
        bytes: file.bytes,
        password,
        type: 'pdf',
      });
      const pages = doc.getPages();
      for (let index = 0; index < pages.length; index += 1) {
        const page = pages[index];
        const { width, height } = page.getSize();
        const pageId = uid('pg');
        state.pages.push({
          id: pageId,
          kind: 'pdf',
          sourceId,
          srcIndex: index,
          rotation: normAngle(page.getRotation().angle),
          width,
          height,
        });
        try {
          const annotsRef = page.node.get(PDFName.of('Annots'));
          const annotsArr = annotsRef ? doc.context.lookupMaybe(annotsRef, PDFArray) : null;
          if (annotsArr) {
            const restored = [];
            for (let a = 0; a < annotsArr.size(); a += 1) {
              const dict = doc.context.lookupMaybe(annotsArr.get(a), PDFDict);
              if (!dict) continue;
              const raw = dict.get(PDFName.of('LaloData'));
              const str = raw ? doc.context.lookupMaybe(raw, PDFString) : null;
              if (!str) continue;
              try {
                const parsed = JSON.parse(str.decodeText());
                if (parsed && parsed.type) {
                  restored.push({ ...parsed, id: uid('ann') });
                }
              } catch {
                /* ignore malformed annotation */
              }
            }
            if (restored.length) state.annotations.set(pageId, restored);
          }
        } catch {
          /* ignore annotation read errors */
        }
      }
      return pages.length;
    } catch (error) {
      console.error('No se pudo leer el PDF', file.name, error);
      toast(`No se pudo abrir ${file.name}`);
      return 0;
    }
  }

  async function appendImageFile(file) {
    try {
      const imageType = /\.png$/i.test(file.name) ? 'png' : 'jpg';
      const blob = new Blob([file.bytes], {
        type: imageType === 'png' ? 'image/png' : 'image/jpeg',
      });
      const bitmap = await createImageBitmap(blob);
      const factor = Math.min(1, 2200 / Math.max(bitmap.width, bitmap.height));
      const width = Math.max(36, bitmap.width * 0.75 * factor);
      const height = Math.max(36, bitmap.height * 0.75 * factor);
      if (bitmap.close) bitmap.close();
      const sourceId = uid('src');
      state.sources.set(sourceId, {
        id: sourceId,
        name: file.name,
        bytes: file.bytes,
        type: 'image',
        imageType,
      });
      state.pages.push({
        id: uid('pg'),
        kind: 'image',
        sourceId,
        srcIndex: 0,
        rotation: 0,
        width,
        height,
      });
      return 1;
    } catch (error) {
      console.error('No se pudo leer la imagen', file.name, error);
      toast(`No se pudo abrir ${file.name}`);
      return 0;
    }
  }

  async function openFiles(files) {
    if (!files.length) return;
    setBusy(true);
    try {
      state.sources.clear();
      state.pages = [];
      state.annotations = new Map();
      state.formValues = new Map();
      state.selected.clear();
      state.history = [];
      state.future = [];
      state.current = 0;
      state.anchorIndex = null;
      state.zoomMode = 'fit';
      state.security = null;
      state.watermark = null;
      state.fileName = /\.pdf$/i.test(files[0].name)
        ? files[0].name
        : `${baseName(files[0].name)}.pdf`;
      state.filePath = files.length === 1 && files[0].path ? files[0].path : null;
      if (state.filePath) addRecentFile(state.filePath, state.fileName);
      for (const file of files) {
        if (isPdf(file)) await appendSourceFile(file);
        else if (isImage(file)) await appendImageFile(file);
      }
      if (!state.pages.length) {
        toast('No se encontraron páginas en los archivos');
        updateStatus();
        return;
      }
      state.dirty = false;
      clearSearch();
      await refresh({ preserveScroll: false, scrollToCurrent: false });
      toast(
        `${state.pages.length} página${state.pages.length === 1 ? '' : 's'} cargada${
          state.pages.length === 1 ? '' : 's'
        }`,
      );
    } finally {
      setBusy(false);
    }
  }

  async function appendFiles(files) {
    if (!files.length) return;
    if (!state.pages.length) return openFiles(files);
    pushHistory(true);
    let added = 0;
    setBusy(true);
    try {
      for (const file of files) {
        if (isPdf(file)) added += await appendSourceFile(file);
        else if (isImage(file)) added += await appendImageFile(file);
      }
      if (!added) {
        state.history.pop();
        updateUndoButtons();
        return;
      }
      state.dirty = true;
      await refresh({ preserveScroll: true });
      toast(`${added} página${added === 1 ? '' : 's'} añadida${added === 1 ? '' : 's'}`);
    } finally {
      setBusy(false);
    }
  }

  function resolveFormFontSize(daSize, boxHeightPt) {
    const h = Number(boxHeightPt) || 20;
    const fallback = Math.max(8, Math.min(12, h * 0.58));
    if (!daSize || daSize <= 0 || daSize > 13 || daSize >= h * 0.68) {
      return Number(fallback.toFixed(1));
    }
    return daSize;
  }

  function applyFormValuesToDoc(doc) {
    if (!state.formValues || state.formValues.size === 0) return;
    try {
      const form = doc.getForm();
      for (const field of form.getFields()) {
        try {
          if (typeof field.setFontSize === 'function') {
            const da = field.acroField?.getDefaultAppearance?.() || '';
            const m = /([\d.]+)\s+Tf/.exec(da);
            const daSize = m ? parseFloat(m[1]) : 0;
            const widgets = field.acroField?.getWidgets?.() || [];
            const boxH = widgets[0]?.getRectangle?.()?.height || 20;
            field.setFontSize(resolveFormFontSize(daSize, boxH));
          }
        } catch {
          /* ignore appearance resize errors */
        }
      }
      for (const [name, val] of state.formValues.entries()) {
        try {
          const field = form.getField(name);
          if (typeof val === 'boolean') {
            if (val) field.check();
            else field.uncheck();
          } else if (field.setText) {
            field.setText(String(val ?? ''));
          } else if (field.select) {
            field.select(String(val ?? ''));
          }
        } catch {
          /* skip missing or incompatible field */
        }
      }
      form.flatten();
    } catch {
      /* ignore if document has no AcroForm */
    }
  }

  async function buildDocument(models = state.pages, { applyForms = false } = {}) {
    const out = await PDFDocument.create();
    const cache = new Map();
    for (const model of models) {
      if (model.kind === 'blank') {
        const page = out.addPage([model.width, model.height]);
        page.setRotation(degrees(model.rotation || 0));
        continue;
      }
      if (model.kind === 'image') {
        const source = state.sources.get(model.sourceId);
        const image =
          source.imageType === 'png'
            ? await out.embedPng(source.bytes)
            : await out.embedJpg(source.bytes);
        const page = out.addPage([model.width, model.height]);
        page.setRotation(degrees(model.rotation || 0));
        page.drawImage(image, { x: 0, y: 0, width: model.width, height: model.height });
        continue;
      }
      let sourceDoc = cache.get(model.sourceId);
      if (!sourceDoc) {
        const source = state.sources.get(model.sourceId);
        const loadOpts =
          source.password !== undefined ? { password: source.password } : { ignoreEncryption: true };
        sourceDoc = await PDFDocument.load(source.bytes, loadOpts);
        if (applyForms) applyFormValuesToDoc(sourceDoc);
        cache.set(model.sourceId, sourceDoc);
      }
      const [copied] = await out.copyPages(sourceDoc, [model.srcIndex]);
      try {
        const annotsRef = copied.node.get(PDFName.of('Annots'));
        const annotsArr = annotsRef ? out.context.lookupMaybe(annotsRef, PDFArray) : null;
        if (annotsArr) {
          const kept = [];
          for (let a = 0; a < annotsArr.size(); a += 1) {
            const ref = annotsArr.get(a);
            const dict = out.context.lookupMaybe(ref, PDFDict);
            if (dict && dict.get(PDFName.of('LaloData'))) continue;
            kept.push(ref);
          }
          if (kept.length === 0) {
            copied.node.delete(PDFName.of('Annots'));
          } else if (kept.length !== annotsArr.size()) {
            const nextArr = out.context.obj(kept);
            copied.node.set(PDFName.of('Annots'), nextArr);
          }
        }
      } catch {
        /* ignore */
      }
      copied.setRotation(degrees(model.rotation || 0));
      out.addPage(copied);
    }
    return out;
  }

  function mapPoint(nx, ny, width, height, rotation) {
    const swap = rotation % 180 !== 0;
    const displayWidth = swap ? height : width;
    const displayHeight = swap ? width : height;
    const dx = nx * displayWidth;
    const dy = ny * displayHeight;
    if (rotation === 90) return { x: dy, y: dx };
    if (rotation === 180) return { x: width - dx, y: dy };
    if (rotation === 270) return { x: width - dy, y: height - dx };
    return { x: dx, y: height - dy };
  }

  function wrapLines(measure, text, maxWidth) {
    const paragraphs = String(text ?? '').split('\n');
    const lines = [];
    for (const paragraph of paragraphs) {
      const words = paragraph.split(/\s+/).filter(Boolean);
      if (!words.length) {
        lines.push('');
        continue;
      }
      let line = '';
      for (const word of words) {
        const candidate = line ? `${line} ${word}` : word;
        if (!line || !(measure(candidate) > maxWidth)) line = candidate;
        else {
          lines.push(line);
          line = word;
        }
      }
      lines.push(line);
    }
    return lines.length ? lines : [''];
  }

  function textFallbackWidth(annotation) {
    return Math.max(
      (annotation.size || 14) * 2,
      String(annotation.text || '').length * (annotation.size || 14) * 0.55,
    );
  }

  // Media apertura de la punta: unos 25° a cada lado del eje.
  const ARROW_SPREAD = 0.44;

  // Triángulo de la punta: vértice en la punta y dos alas hacia atrás.
  function arrowHeadPoints(tip, angle, size) {
    const back = angle + Math.PI;
    const wing = (offset) => ({
      x: tip.x + Math.cos(back + offset) * size,
      y: tip.y + Math.sin(back + offset) * size,
    });
    return [tip, wing(-ARROW_SPREAD), wing(ARROW_SPREAD)];
  }

  // La punta crece con la longitud y el grosor, con un mínimo visible y un
  // máximo para que no se coma líneas muy largas.
  function arrowHeadSize(thickness, length, unit = 1) {
    const wanted = Math.max(16 * unit, Math.min(length * 0.22, thickness * 5.5));
    return Math.min(wanted, 64 * unit, length * 0.6);
  }

  // Punto donde debe terminar el tallo: justo dentro de la base del triángulo,
  // para que el trazo no asome por la punta.
  function arrowShaftEnd(tip, angle, head) {
    const inset = head * Math.cos(ARROW_SPREAD) * 0.9;
    return {
      x: tip.x - Math.cos(angle) * inset,
      y: tip.y - Math.sin(angle) * inset,
    };
  }

  async function flattenAnnotations(doc, page, model, font) {
    const annotations = state.annotations.get(model.id) || [];
    if (!annotations.length) return;
    const { width, height } = page.getSize();
    const rotation = normAngle(page.getRotation().angle);
    const displayWidth = rotation % 180 === 0 ? width : height;
    const displayHeight = rotation % 180 === 0 ? height : width;
    const toPdf = (nx, ny) => mapPoint(nx, ny, width, height, rotation);

    for (const annotation of annotations) {
      try {
        if (annotation.type === 'signature' && annotation.dataUrl) {
          const p1 = toPdf(annotation.x, annotation.y);
          const p2 = toPdf(annotation.x + annotation.w, annotation.y + annotation.h);
          const box = {
            x: Math.min(p1.x, p2.x),
            y: Math.min(p1.y, p2.y),
            width: Math.abs(p2.x - p1.x),
            height: Math.abs(p2.y - p1.y),
          };
          const base64 = annotation.dataUrl.split(',')[1];
          if (base64) {
            const bin = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
            const png = await doc.embedPng(bin);
            page.drawImage(png, {
              ...box,
              opacity: annotation.opacity ?? 1,
            });
          }
          continue;
        }
        const color = hexToRgb(annotation.color);
        const thickness = annotation.width || 3;
        if (
          annotation.type === 'highlight' ||
          annotation.type === 'rect' ||
          annotation.type === 'ellipse'
        ) {
          const p1 = toPdf(annotation.x, annotation.y);
          const p2 = toPdf(annotation.x + annotation.w, annotation.y + annotation.h);
          const box = {
            x: Math.min(p1.x, p2.x),
            y: Math.min(p1.y, p2.y),
            width: Math.abs(p2.x - p1.x),
            height: Math.abs(p2.y - p1.y),
          };
          if (annotation.type === 'highlight') {
            page.drawRectangle({ ...box, color, opacity: 0.35 });
          } else if (annotation.type === 'ellipse') {
            page.drawEllipse({
              x: box.x + box.width / 2,
              y: box.y + box.height / 2,
              xScale: Math.max(0.1, box.width / 2),
              yScale: Math.max(0.1, box.height / 2),
              borderColor: color,
              borderWidth: thickness,
              opacity: 0,
              borderOpacity: 1,
            });
          } else {
            page.drawRectangle({
              ...box,
              borderColor: color,
              borderWidth: thickness,
              opacity: 0,
              borderOpacity: 1,
            });
          }
        } else if (annotation.type === 'line' || annotation.type === 'arrow') {
          const start = toPdf(annotation.x1, annotation.y1);
          const end = toPdf(annotation.x2, annotation.y2);
          const isArrow = annotation.type === 'arrow';
          const length = Math.hypot(end.x - start.x, end.y - start.y);
          const angle = Math.atan2(end.y - start.y, end.x - start.x);
          const head = isArrow && length > 1 ? arrowHeadSize(thickness, length, 1) : 0;
          page.drawLine({
            start,
            end: head ? arrowShaftEnd(end, angle, head) : end,
            thickness,
            color,
            lineCap: isArrow ? LineCapStyle.Butt : LineCapStyle.Round,
          });
          if (head) {
            const [tip, left, right] = arrowHeadPoints(end, angle, head);
            // El eje Y del path SVG va al revés que el de PDF.
            const rel = (point) =>
              `${(point.x - tip.x).toFixed(3)} ${(-(point.y - tip.y)).toFixed(3)}`;
            page.drawSvgPath(`M 0 0 L ${rel(left)} L ${rel(right)} Z`, {
              x: end.x,
              y: end.y,
              color,
              borderColor: color,
              borderWidth: 0,
            });
          }
        } else if (annotation.type === 'pen') {
          const points = annotation.points || [];
          for (let i = 1; i < points.length; i += 1) {
            page.drawLine({
              start: toPdf(points[i - 1][0], points[i - 1][1]),
              end: toPdf(points[i][0], points[i][1]),
              thickness,
              color,
              lineCap: LineCapStyle.Round,
            });
          }
        } else if (annotation.type === 'text') {
          const size = annotation.size || 14;
          const boxWidth =
            (annotation.w ? annotation.w : textFallbackWidth(annotation) / displayWidth) *
            displayWidth;
          if (annotation.borderColor && annotation.borderColor !== 'none' && annotation.w && annotation.h) {
            const p1 = toPdf(annotation.x, annotation.y);
            const p2 = toPdf(annotation.x + annotation.w, annotation.y + annotation.h);
            page.drawRectangle({
              x: Math.min(p1.x, p2.x),
              y: Math.min(p1.y, p2.y),
              width: Math.abs(p2.x - p1.x),
              height: Math.abs(p2.y - p1.y),
              borderColor: hexToRgb(annotation.borderColor),
              borderWidth: 1.5,
              opacity: 0,
              borderOpacity: 1,
            });
          }
          const lines = wrapLines((value) => font.widthOfTextAtSize(value, size), annotation.text, boxWidth);
          const align = annotation.align || 'left';
          lines.forEach((line, index) => {
            const baseline = clamp(
              annotation.y + (size + index * size * LINE_HEIGHT) / displayHeight,
              0,
              1,
            );
            const lineW = font.widthOfTextAtSize(pdfSafe(line), size);
            let nx = annotation.x;
            if (align === 'center') {
              nx = annotation.x + Math.max(0, (boxWidth - lineW) / 2) / displayWidth;
            } else if (align === 'right') {
              nx = annotation.x + Math.max(0, boxWidth - lineW) / displayWidth;
            }
            const anchor = toPdf(nx, baseline);
            page.drawText(pdfSafe(line), {
              x: anchor.x,
              y: anchor.y,
              size,
              font,
              color,
              rotate: degrees(rotation),
            });
          });
        }
      } catch (error) {
        console.warn('No se pudo aplanar una anotación', error);
      }
    }
  }

  function hexToRgbArray(hex) {
    const clean = String(hex || '#000000').replace('#', '');
    const n = Number.parseInt(clean.length === 3 ? clean.replace(/(.)/g, '$1$1') : clean, 16) || 0;
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }

  function writeNativeAnnotations(doc, page, model) {
    const annotations = state.annotations.get(model.id) || [];
    if (!annotations.length) return;
    const { width, height } = page.getSize();
    const rotation = normAngle(page.getRotation().angle);
    const toPdf = (nx, ny) => mapPoint(nx, ny, width, height, rotation);

    let annotsArr = null;
    const existingRef = page.node.get(PDFName.of('Annots'));
    if (existingRef) {
      annotsArr = doc.context.lookupMaybe(existingRef, PDFArray);
    }
    if (!annotsArr) {
      annotsArr = doc.context.obj([]);
      page.node.set(PDFName.of('Annots'), annotsArr);
    }

    const subtypeMap = {
      highlight: 'Highlight',
      rect: 'Square',
      ellipse: 'Circle',
      line: 'Line',
      arrow: 'Line',
      pen: 'Ink',
      text: 'FreeText',
    };

    for (const ann of annotations) {
      if (ann.type === 'signature') continue;
      const subtype = subtypeMap[ann.type] || 'Square';
      let x1 = 0;
      let y1 = 0;
      let x2 = 0;
      let y2 = 0;
      if (ann.type === 'line' || ann.type === 'arrow') {
        const p1 = toPdf(ann.x1, ann.y1);
        const p2 = toPdf(ann.x2, ann.y2);
        x1 = Math.min(p1.x, p2.x);
        y1 = Math.min(p1.y, p2.y);
        x2 = Math.max(p1.x, p2.x);
        y2 = Math.max(p1.y, p2.y);
      } else if (ann.type === 'pen' && Array.isArray(ann.points) && ann.points.length) {
        const pts = ann.points.map((p) => toPdf(p.x, p.y));
        x1 = Math.min(...pts.map((p) => p.x));
        y1 = Math.min(...pts.map((p) => p.y));
        x2 = Math.max(...pts.map((p) => p.x));
        y2 = Math.max(...pts.map((p) => p.y));
      } else {
        const p1 = toPdf(ann.x || 0, ann.y || 0);
        const p2 = toPdf((ann.x || 0) + (ann.w || 0.1), (ann.y || 0) + (ann.h || 0.05));
        x1 = Math.min(p1.x, p2.x);
        y1 = Math.min(p1.y, p2.y);
        x2 = Math.max(p1.x, p2.x);
        y2 = Math.max(p1.y, p2.y);
      }

      const [r, g, b] = hexToRgbArray(ann.color);
      const { __img, ...serializable } = ann;
      const dict = doc.context.obj({
        Type: 'Annot',
        Subtype: subtype,
        Rect: [x1, y1, x2, y2],
        C: [r, g, b],
        F: 4,
        Contents: PDFString.of(String(ann.text || '')),
        LaloData: PDFString.of(JSON.stringify(serializable)),
      });
      if (ann.type === 'highlight') {
        dict.set(PDFName.of('CA'), PDFNumber.of(0.35));
      }
      const ref = doc.context.register(dict);
      annotsArr.push(ref);
    }
  }

  async function composePdf(models = state.pages, { editableAnnotations = false, applyForms = true } = {}) {
    const doc = await buildDocument(models, { applyForms });
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const pages = doc.getPages();
    for (let i = 0; i < pages.length; i += 1) {
      if (editableAnnotations) {
        writeNativeAnnotations(doc, pages[i], models[i]);
        const sigOnly = {
          ...models[i],
        };
        const list = state.annotations.get(models[i].id) || [];
        const sigs = list.filter((a) => a.type === 'signature');
        if (sigs.length) {
          const orig = state.annotations.get(models[i].id);
          state.annotations.set(models[i].id, sigs);
          await flattenAnnotations(doc, pages[i], sigOnly, font);
          state.annotations.set(models[i].id, orig);
        }
      } else {
        await flattenAnnotations(doc, pages[i], models[i], font);
      }
      if (state.watermark && (state.watermark.text || state.watermark.dataUrl)) {
        const wm = state.watermark;
        const page = pages[i];
        const { width, height } = page.getSize();
        const rad = (-wm.rotation * Math.PI) / 180;
        const cx = width / 2;
        const cy = height / 2;
        if (wm.kind === 'image' && wm.dataUrl) {
          const base64 = wm.dataUrl.split(',')[1];
          if (base64) {
            const bin = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
            const img =
              wm.imageType === 'png' ? await doc.embedPng(bin) : await doc.embedJpg(bin);
            const targetW = Math.max(24, (width * (wm.size || 54)) / 120);
            const targetH = targetW * (img.height / img.width);
            const x = cx - (targetW / 2) * Math.cos(rad) + (targetH / 2) * Math.sin(rad);
            const y = cy - (targetW / 2) * Math.sin(rad) - (targetH / 2) * Math.cos(rad);
            page.drawImage(img, {
              x,
              y,
              width: targetW,
              height: targetH,
              opacity: wm.opacity,
              rotate: degrees(-wm.rotation),
            });
          }
        } else if (wm.text) {
          const textWidth = font.widthOfTextAtSize(wm.text, wm.size);
          const x = cx - (textWidth / 2) * Math.cos(rad) + (wm.size / 3) * Math.sin(rad);
          const y = cy - (textWidth / 2) * Math.sin(rad) - (wm.size / 3) * Math.cos(rad);
          page.drawText(wm.text, {
            x,
            y,
            size: wm.size,
            font,
            color: hexToRgb(wm.color),
            opacity: wm.opacity,
            rotate: degrees(-wm.rotation),
          });
        }
      }
      if (state.pageNumbers) {
        const pn = state.pageNumbers;
        const pageNum1Based = i + 1;
        if (pageNum1Based >= pn.from && pageNum1Based <= pn.to) {
          const displayNum = pn.start + (pageNum1Based - pn.from);
          const totalDisplay = pn.start + (pn.to - pn.from);
          const label =
            pn.format === 'page-n'
              ? `Página ${displayNum}`
              : pn.format === 'n-of-total'
                ? `${displayNum} / ${totalDisplay}`
                : String(displayNum);
          const page = pages[i];
          const { width, height } = page.getSize();
          const sz = pn.size || 11;
          const tw = font.widthOfTextAtSize(label, sz);
          const marginX = 32;
          const marginY = 24;
          const x =
            pn.hpos === 'left'
              ? marginX
              : pn.hpos === 'right'
                ? Math.max(marginX, width - marginX - tw)
                : Math.max(marginX, (width - tw) / 2);
          const y = pn.vpos === 'top' ? height - marginY - sz : marginY;
          page.drawText(label, {
            x,
            y,
            size: sz,
            font,
            color: rgb(0.2, 0.2, 0.22),
          });
        }
      }
    }
    return doc;
  }

  async function composeBytes(models = state.pages, { encrypt = false, editableAnnotations = false } = {}) {
    const doc = await composePdf(models, { editableAnnotations });
    if (encrypt && state.security) {
      const sec = state.security;
      const ownerPassword =
        sec.ownerPassword ||
        sec.userPassword ||
        Math.random().toString(36).slice(2) + Date.now().toString(36);
      doc.encrypt({
        userPassword: sec.userPassword || '',
        ownerPassword,
        permissions: {
          printing: sec.printing === 'none' ? false : sec.printing || 'highResolution',
          modifying: !!sec.modifying,
          copying: !!sec.copying,
          annotating: !!sec.annotating,
          fillingForms: !!sec.annotating,
          contentAccessibility: true,
          documentAssembly: !!sec.modifying,
        },
      });
    }
    return doc.save({ useObjectStreams: false });
  }

  function markSaved(name) {
    if (name) state.fileName = name;
    state.dirty = false;
    window.lalo?.setDirtyState?.(false);
    updateStatus();
    toast(`Guardado: ${state.fileName}`);
  }

  function showError(prefix, error) {
    console.error(prefix, error);
    const detail = (error && (error.message || error.error)) || 'Error desconocido';
    toast(`${prefix}: ${detail}`, 6000);
  }

  function downloadBlob(bytes, filename, type) {
    const blob = new Blob([bytes], { type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  function folderOf(filePath) {
    return String(filePath || '').replace(/[\\/][^\\/]*$/, '');
  }

  function hasAnnotations() {
    for (const annotations of state.annotations.values()) {
      if (annotations && annotations.length) return true;
    }
    return false;
  }

  async function save() {
    if (!state.pages.length) {
      toast('Abre un PDF antes de guardar');
      return;
    }
    if (!state.filePath || !window.lalo?.savePdfInPlace) {
      await saveAs();
      return;
    }
    setBusy(true);
    toast('Guardando…', 1500);
    try {
      const bytes = await composeBytes(state.pages, { encrypt: true, editableAnnotations: true });
      const result = await window.lalo.savePdfInPlace(state.filePath, bytes);
      if (!result || result.ok === false) {
        throw new Error((result && result.error) || 'No se pudo escribir el archivo');
      }
      markSaved(result.name || state.fileName);
    } catch (error) {
      showError('No se pudo guardar', error);
    } finally {
      setBusy(false);
    }
  }

  async function saveAs() {
    if (!state.pages.length) {
      toast('Abre un PDF antes de guardar');
      return;
    }
    if (!window.lalo?.savePdf) {
      try {
        const bytes = await composeBytes(state.pages, { encrypt: true, editableAnnotations: true });
        downloadBlob(bytes, state.fileName || 'Documento.pdf', 'application/pdf');
        markSaved();
      } catch (error) {
        showError('No se pudo guardar', error);
      }
      return;
    }
    setBusy(true);
    try {
      const bytes = await composeBytes(state.pages, { encrypt: true, editableAnnotations: true });
      const result = await window.lalo.savePdf(state.fileName || 'Documento.pdf', bytes);
      if (!result || result.canceled) return;
      if (result.error) throw new Error(result.error);
      state.filePath = result.path || state.filePath;
      if (state.filePath) addRecentFile(state.filePath, state.fileName);
      markSaved(result.name || state.fileName);
    } catch (error) {
      showError('No se pudo guardar', error);
    } finally {
      setBusy(false);
    }
  }

  async function exportImages(format = 'png') {
    if (!state.pages.length) {
      toast('Abre un PDF antes de exportar');
      return;
    }
    const ext = format === 'jpg' ? 'jpg' : 'png';
    const mime = ext === 'jpg' ? 'image/jpeg' : 'image/png';
    setBusy(true);
    try {
      // workingBytes ya está compuesto y actualizado; solo hace falta recomponer
      // cuando hay anotaciones nuevas que aún no forman parte de esos bytes.
      const bytes =
        state.workingBytes && !hasAnnotations() ? state.workingBytes : await composeBytes();
      const pdf = await pdfjsLib.getDocument({ data: bytes.slice() }).promise;
      const images = [];
      try {
        for (let i = 1; i <= pdf.numPages; i += 1) {
          if (pdf.numPages > 1) toast(`Exportando imagen ${i} de ${pdf.numPages}…`, 60000);
          const page = await pdf.getPage(i);
          const base = page.getViewport({ scale: 1 });
          const scale = Math.min(2, 2600 / Math.max(base.width, base.height));
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement('canvas');
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          await page.render({ canvasContext: ctx, viewport }).promise;
          const blob = await new Promise((resolve) => canvas.toBlob(resolve, mime, 0.92));
          if (!blob) throw new Error('No se pudo generar la imagen de la página ' + i);
          images.push({ ext, bytes: new Uint8Array(await blob.arrayBuffer()) });
        }
      } finally {
        await pdf.destroy().catch(() => {});
      }

      const name = baseName(state.fileName);

      if (!window.lalo?.exportImages) {
        images.forEach((image, index) => {
          downloadBlob(
            image.bytes,
            `${name}-${String(index + 1).padStart(2, '0')}.${image.ext}`,
            'image/png',
          );
        });
        toast(`${images.length} imagen${images.length === 1 ? '' : 'es'} descargada${images.length === 1 ? '' : 's'}`);
        return;
      }

      const result = await window.lalo.exportImages(name, images, folderOf(state.filePath));
      if (!result || result.canceled) return;
      if (result.error) throw new Error(result.error);
      toast(
        `${images.length} imagen${images.length === 1 ? '' : 'es'} exportada${
          images.length === 1 ? '' : 's'
        }${result.folder ? ` en ${result.folder}` : ''}`,
        4200,
      );
    } catch (error) {
      showError('No se pudieron exportar las imágenes', error);
    } finally {
      setBusy(false);
    }
  }

  function extractPageStyledBlocks(textContent, viewportHeight) {
    const items = (textContent?.items || []).filter((item) => item && typeof item.str === 'string');
    const styles = textContent?.styles || {};
    if (!items.length) return [];

    const lines = [];
    let currentRuns = [];
    let lastY = null;

    const flushLine = () => {
      const joined = currentRuns.map((r) => r.text).join('').trim();
      if (joined) {
        lines.push({
          type: 'text',
          y: lastY !== null ? viewportHeight - lastY : 0,
          runs: currentRuns,
        });
      }
      currentRuns = [];
    };

    for (const item of items) {
      const y = Array.isArray(item.transform) ? item.transform[5] : null;
      const fontHeight = Array.isArray(item.transform)
        ? Math.hypot(item.transform[2] || 0, item.transform[3] || 0) ||
          Math.abs(item.transform[0] || 0) ||
          11
        : 11;
      const sizePt = clamp(Math.round(fontHeight), 7, 48);
      const style = styles[item.fontName] || {};
      const fontDesc = `${item.fontName || ''} ${style.fontFamily || ''}`.toLowerCase();
      const bold = /bold|black|heavy|semibold|demibold/.test(fontDesc);
      const italic = /italic|oblique/.test(fontDesc);

      if (lastY !== null && y !== null && Math.abs(y - lastY) > 4) {
        flushLine();
      } else if (currentRuns.length && item.str) {
        const prev = currentRuns[currentRuns.length - 1];
        if (!prev.text.endsWith(' ') && !item.str.startsWith(' ')) {
          prev.text += ' ';
        }
      }

      if (item.str) {
        const prev = currentRuns[currentRuns.length - 1];
        if (
          prev &&
          prev.sizePt === sizePt &&
          prev.bold === bold &&
          prev.italic === italic
        ) {
          prev.text += item.str;
        } else {
          currentRuns.push({ text: item.str, sizePt, bold, italic });
        }
      }

      if (y !== null) lastY = y;
      if (item.hasEOL) {
        flushLine();
        lastY = null;
      }
    }
    flushLine();
    return lines;
  }

  async function exportWord() {
    if (!state.pages.length) {
      toast('Abre un PDF antes de exportar');
      return;
    }
    if (!window.lalo?.exportWord) {
      toast('La exportación a Word solo está disponible en la app de escritorio');
      return;
    }
    setBusy(true);
    try {
      const pdfBytes = await composeBytes(state.pages, { editableAnnotations: false });
      const pdf = await pdfjsLib.getDocument({ data: pdfBytes.slice() }).promise;
      const pages = [];
      try {
        for (let i = 1; i <= pdf.numPages; i += 1) {
          if (pdf.numPages > 1) toast(`Extrayendo contenido ${i} de ${pdf.numPages}…`, 60000);
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: 1 });
          const content = await page.getTextContent();
          const blocks = extractPageStyledBlocks(content, viewport.height);

          try {
            const opList = await page.getOperatorList();
            const imageRects = extractPageImageRects(opList, viewport);
            for (const rect of imageRects) {
              const { bytes: imgBytes } = await renderCropAsJpeg(page, rect, 1);
              blocks.push({
                type: 'image',
                y: rect.top,
                width: rect.width,
                height: rect.height,
                bytes: imgBytes,
              });
            }
          } catch {
            /* ignorar si no se pueden extraer imágenes de esta página */
          }

          blocks.sort((a, b) => a.y - b.y);
          pages.push(blocks);
        }
      } finally {
        await pdf.destroy();
      }
      const name = (state.fileName || 'Documento').replace(/\.pdf$/i, '');
      const result = await window.lalo.exportWord(name, pages, pdfBytes);
      if (!result || result.canceled) return;
      if (result.error) throw new Error(result.error);
      toast(
        `Word guardado: ${result.name || 'documento.docx'}${result.engine === 'pdf2docx' ? ' (clonado fiel)' : ' (básico)'}`,
        6000,
      );
    } catch (error) {
      showError('No se pudo exportar a Word', error);
    } finally {
      setBusy(false);
    }
  }

  // Imprime el documento tal como se ve: se compone el PDF (incluidos los
  // reordenamientos y las anotaciones), se dibuja cada página en un canvas y
  // se deja el resultado en #print-root, que es lo único que muestra @media
  // print. El proceso principal se encarga de abrir el diálogo del sistema.
  async function printPdf() {
    if (!state.pages.length) {
      toast('Abre un PDF antes de imprimir');
      return;
    }
    if (!window.lalo?.print) {
      toast('La impresión no está disponible en esta versión');
      return;
    }
    setBusy(true);
    toast('Preparando impresión…', 2000);
    let style = null;
    try {
      const bytes = await composeBytes();
      const pdf = await pdfjsLib.getDocument({ data: bytes.slice() }).promise;
      const root = el.printRoot;
      root.innerHTML = '';
      try {
        // El tamaño de hoja debe coincidir con la primera página: sin un
        // @page explícito Chromium parte cada lienzo en dos hojas al imprimir.
        const firstView = (await pdf.getPage(1)).getViewport({ scale: 1 });
        const sheetW = firstView.width * (25.4 / 96);
        const sheetH = firstView.height * (25.4 / 96);
        style = document.createElement('style');
        style.textContent = `
          @page { size: ${sheetW}mm ${sheetH}mm; margin: 0; }
          #print-root .print-page {
            width: ${sheetW}mm;
            height: ${sheetH}mm;
            margin: 0 auto;
            break-after: page;
            page-break-after: page;
          }
          #print-root .print-page:last-child {
            break-after: auto;
            page-break-after: auto;
          }
        `;
        document.head.appendChild(style);

        for (let i = 1; i <= pdf.numPages; i += 1) {
          const page = await pdf.getPage(i);
          const base = page.getViewport({ scale: 1 });
          const scale = Math.min(2.2, 1700 / Math.max(base.width, base.height));
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement('canvas');
          canvas.className = 'print-page';
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          // Si una página tiene otro tamaño, se ajusta dentro de la hoja sin
          // deformarla (la mayoría de los PDF usan el mismo tamaño en todas).
          const wMm = base.width * (25.4 / 96);
          const hMm = base.height * (25.4 / 96);
          const fit = Math.min(sheetW / wMm, sheetH / hMm);
          if (fit < 0.999) {
            canvas.style.width = `${wMm * fit}mm`;
            canvas.style.height = `${hMm * fit}mm`;
            canvas.style.marginTop = `${(sheetH - hMm * fit) / 2}mm`;
          }
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          await page.render({ canvasContext: ctx, viewport }).promise;
          root.appendChild(canvas);
        }
        const result = await window.lalo.print();
        if (result && result.ok === false) {
          const reason = String(result.error || 'No se pudo imprimir');
          if (!/cancel|cancelad/i.test(reason)) showError('No se pudo imprimir', result);
        }
      } finally {
        await pdf.destroy().catch(() => {});
        root.innerHTML = '';
        if (style) style.remove();
      }
    } catch (error) {
      showError('No se pudo imprimir', error);
    } finally {
      setBusy(false);
    }
  }

  /* ------------------------------------------------------------- rendering */

  let refreshQueue = Promise.resolve();

  function refresh(options = {}) {
    refreshQueue = refreshQueue
      .then(() => doRefresh(options))
      .catch((error) => {
        console.error(error);
        setBusy(false);
        toast('No se pudo procesar el documento');
      });
    return refreshQueue;
  }

  async function doRefresh({ preserveScroll = true, scrollToCurrent = false, silent = false } = {}) {
    if (!state.pages.length) {
      if (state.pdf) {
        state.pdf.destroy();
        state.pdf = null;
      }
      state.workingBytes = null;
      if (state.observer) {
        state.observer.disconnect();
        state.observer = null;
      }
      state.thumbToken += 1;
      el.viewer.innerHTML = '';
      el.thumbs.innerHTML = '';
      const ol = $('#outline-list');
      if (ol) ol.innerHTML = '';
      updateStatus();
      updateToolbarState();
      return;
    }

    if (!silent) setBusy(true);
    const token = ++state.renderToken;
    const thumbToken = ++state.thumbToken;
    const oldTop = el.viewer.scrollTop;
    const oldHeight = el.viewer.scrollHeight || 1;
    const oldScale = state.currentScale || 1;
    try {
      const doc = await buildDocument();
      const bytes = await doc.save();
      if (token !== state.renderToken) return;
      state.workingBytes = bytes;

      const pdf = await pdfjsLib.getDocument({ data: bytes.slice() }).promise;
      if (token !== state.renderToken) {
        pdf.destroy();
        return;
      }
      if (state.pdf) state.pdf.destroy();
      state.pdf = pdf;
      state.current = clamp(state.current, 0, state.pages.length - 1);

      await renderViewer({
        token,
        preserveScroll,
        scrollToCurrent,
        oldTop,
        oldHeight,
        oldScale,
      });
      if (token !== state.renderToken) return;
      await renderThumbs(thumbToken);
      if (token !== state.renderToken) return;
      renderOutline(pdf).catch(() => {});

      updateStatus();
      updateToolbarState();

      if (state.search.query && !el.searchPanel.hidden) {
        runSearch(state.search.query, { silent: true });
      }
    } finally {
      setBusy(false);
    }
  }

  function computeFitScale(baseViewport, count) {
    const availWidth = Math.max(180, el.viewer.clientWidth - 76);
    const availHeight = Math.max(180, el.viewer.clientHeight - 56);
    const twoUp = state.viewMode === 'two' && count > 1;
    const widthScale = (twoUp ? (availWidth - 4) / 2 : availWidth) / baseViewport.width;
    const heightScale = availHeight / baseViewport.height;
    const scale = state.viewMode === 'continuous' ? widthScale : Math.min(widthScale, heightScale);
    return clamp(scale, 0.1, 8);
  }

  function computeScale(baseViewport, count) {
    if (state.zoomMode === 'custom') return clamp(state.scale, 0.1, 8);
    return computeFitScale(baseViewport, count);
  }

  async function renderViewer({
    token,
    preserveScroll = true,
    scrollToCurrent = false,
    oldTop = 0,
    oldHeight = 1,
  } = {}) {
    if (token === undefined) token = ++state.renderToken;
    const pdf = state.pdf;
    if (!pdf) return;
    const total = state.pages.length;
    let indices;
    if (state.viewMode === 'single') {
      indices = [clamp(state.current, 0, total - 1)];
    } else if (state.viewMode === 'two') {
      const start = state.current - (state.current % 2);
      indices = [start, start + 1].filter((index) => index < total);
    } else {
      indices = state.pages.map((_, index) => index);
    }
    if (!indices.length) return;

    const firstPage = await pdf.getPage(indices[0] + 1);
    if (token !== state.renderToken) return;
    const baseViewport = firstPage.getViewport({ scale: 1 });
    state.lastFitScale = computeFitScale(baseViewport, indices.length);
    const scale = computeScale(baseViewport, indices.length);
    state.currentScale = scale;
    const availW = Math.max(180, el.viewer.clientWidth - 76);

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (state.observer) state.observer.disconnect();
    el.viewer.innerHTML = '';

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.target.__render) entry.target.__render();
        }
      },
      { root: el.viewer, rootMargin: '800px 0px' },
    );
    state.observer = observer;

    let spread = null;
    let maxRenderedWidth = 0;
    for (const index of indices) {
      if (token !== state.renderToken) {
        observer.disconnect();
        return;
      }
      const page = await pdf.getPage(index + 1);
      let pageScale = scale;
      if (state.viewMode !== 'two') {
        const p1 = page.getViewport({ scale: 1 });
        if (state.zoomMode === 'fit') {
          pageScale = Math.min(scale, availW / p1.width);
        } else if (state.lastFitScale > 0) {
          const maxCoherentW = availW * Math.max(1, scale / state.lastFitScale);
          pageScale = Math.min(scale, maxCoherentW / p1.width);
        }
      }
      const viewport = page.getViewport({ scale: pageScale });
      maxRenderedWidth = Math.max(maxRenderedWidth, viewport.width);
      const pageEl = buildPageElement(index, page, viewport, pageScale, dpr);
      if (state.viewMode === 'two' && indices.length > 1) {
        if (!spread) {
          spread = document.createElement('div');
          spread.className = 'spread';
          el.viewer.append(spread);
        }
        spread.append(pageEl);
      } else {
        el.viewer.append(pageEl);
      }
      observer.observe(pageEl);
    }

    const twoUpWidth = spread ? spread.scrollWidth : maxRenderedWidth;
    const needX =
      (state.zoomMode === 'custom' && maxRenderedWidth > el.viewer.clientWidth - 8) ||
      (state.viewMode === 'two' && twoUpWidth > el.viewer.clientWidth - 8);
    el.viewer.classList.toggle('allow-x-scroll', needX);
    if (!needX) el.viewer.scrollLeft = 0;

    if (state.viewMode === 'continuous' && preserveScroll && !scrollToCurrent) {
      const ratio = oldTop / Math.max(1, oldHeight);
      el.viewer.scrollTop = ratio * el.viewer.scrollHeight;
    } else if (scrollToCurrent) {
      const target = el.viewer.querySelector(`.page[data-index="${state.current}"]`);
      if (target) target.scrollIntoView({ block: 'center' });
    } else {
      el.viewer.scrollTop = 0;
    }

    updateThumbSelection();
    updateStatus();
  }

  function extractPageImageRects(opList, viewport) {
    const OPS = pdfjsLib.OPS;
    const Util = pdfjsLib.Util;
    const stack = [];
    let ctm = [1, 0, 0, 1, 0, 0];
    const rects = [];

    for (let i = 0; i < opList.fnArray.length; i += 1) {
      const fn = opList.fnArray[i];
      const args = opList.argsArray[i];
      if (fn === OPS.save) {
        stack.push(ctm.slice());
      } else if (fn === OPS.restore) {
        if (stack.length) ctm = stack.pop();
      } else if (fn === OPS.transform && args && args.length === 6) {
        ctm = Util.transform(ctm, args);
      } else if (fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject) {
        const corners = [
          Util.applyTransform([0, 0], ctm),
          Util.applyTransform([1, 0], ctm),
          Util.applyTransform([0, 1], ctm),
          Util.applyTransform([1, 1], ctm),
        ];
        const xs = corners.map((p) => p[0]);
        const ys = corners.map((p) => p[1]);
        const pdfMinX = Math.min(...xs);
        const pdfMinY = Math.min(...ys);
        const pdfMaxX = Math.max(...xs);
        const pdfMaxY = Math.max(...ys);
        const vpRect = viewport.convertToViewportRectangle([pdfMinX, pdfMinY, pdfMaxX, pdfMaxY]);
        const left = Math.max(0, Math.min(vpRect[0], vpRect[2]));
        const top = Math.max(0, Math.min(vpRect[1], vpRect[3]));
        const right = Math.min(viewport.width, Math.max(vpRect[0], vpRect[2]));
        const bottom = Math.min(viewport.height, Math.max(vpRect[1], vpRect[3]));
        const width = right - left;
        const height = bottom - top;
        if (width >= 24 && height >= 24) {
          rects.push({ left, top, width, height });
        }
      }
    }
    return rects;
  }

  async function renderCropAsJpeg(page, rect, viewportScale) {
    const targetScale = Math.min(3, Math.max(2, 1600 / Math.max(rect.width, rect.height))) * viewportScale;
    const hiViewport = page.getViewport({ scale: targetScale });
    const ratio = targetScale / viewportScale;
    const cropX = Math.max(0, Math.floor(rect.left * ratio));
    const cropY = Math.max(0, Math.floor(rect.top * ratio));
    const cropW = Math.max(1, Math.floor(rect.width * ratio));
    const cropH = Math.max(1, Math.floor(rect.height * ratio));

    const fullCanvas = document.createElement('canvas');
    fullCanvas.width = Math.max(1, Math.floor(hiViewport.width));
    fullCanvas.height = Math.max(1, Math.floor(hiViewport.height));
    const fullCtx = fullCanvas.getContext('2d');
    fullCtx.fillStyle = '#ffffff';
    fullCtx.fillRect(0, 0, fullCanvas.width, fullCanvas.height);
    await page.render({ canvasContext: fullCtx, viewport: hiViewport }).promise;

    const cropCanvas = document.createElement('canvas');
    cropCanvas.width = cropW;
    cropCanvas.height = cropH;
    const cropCtx = cropCanvas.getContext('2d');
    cropCtx.fillStyle = '#ffffff';
    cropCtx.fillRect(0, 0, cropW, cropH);
    cropCtx.drawImage(fullCanvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

    const blob = await new Promise((resolve) => cropCanvas.toBlob(resolve, 'image/jpeg', 0.92));
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const webpBlob = await new Promise((resolve) => cropCanvas.toBlob(resolve, 'image/webp', 0.92));
    const webpBytes = webpBlob ? new Uint8Array(await webpBlob.arrayBuffer()) : null;

    const iconSize = 72;
    const iconRatio = Math.min(iconSize / cropW, iconSize / cropH, 1);
    const iconCanvas = document.createElement('canvas');
    iconCanvas.width = Math.max(16, Math.round(cropW * iconRatio));
    iconCanvas.height = Math.max(16, Math.round(cropH * iconRatio));
    iconCanvas.getContext('2d').drawImage(cropCanvas, 0, 0, iconCanvas.width, iconCanvas.height);
    return { bytes, webpBytes, icon: iconCanvas.toDataURL('image/png') };
  }

  function clearSelectedPdfImage() {
    $$('.page-image-hit.selected', el.viewer).forEach((node) => node.classList.remove('selected'));
  }

  function attachImageHitEvents(hit, page, rect, pageIndex, imageIndex, viewportScale) {
    let cachedJpeg = null;
    const getJpeg = () => {
      if (!cachedJpeg) cachedJpeg = renderCropAsJpeg(page, rect, viewportScale);
      return cachedJpeg;
    };
    const stem = baseName(state.fileName || 'Documento');
    const fileName = `${stem} - p${pageIndex + 1} img${imageIndex + 1}.jpg`;

    hit.addEventListener('click', (event) => {
      if (state.markupOpen) return;
      event.stopPropagation();
      clearSelectedPdfImage();
      hit.classList.add('selected');
    });

    hit.addEventListener('contextmenu', async (event) => {
      if (state.markupOpen) return;
      event.preventDefault();
      event.stopPropagation();
      clearSelectedPdfImage();
      hit.classList.add('selected');
      try {
        const { bytes, webpBytes } = await getJpeg();
        if (window.lalo?.showImageContextMenu) {
          const res = await window.lalo.showImageContextMenu(bytes, fileName, webpBytes);
          if (res?.action === 'copy' && res.ok) {
            toast('Imagen copiada al portapapeles');
          } else if (res?.action === 'save-pdf' && res.target) {
            const pdfDoc = await PDFDocument.create();
            const jpgImage = await pdfDoc.embedJpg(bytes);
            const pdfPage = pdfDoc.addPage([jpgImage.width, jpgImage.height]);
            pdfPage.drawImage(jpgImage, {
              x: 0,
              y: 0,
              width: jpgImage.width,
              height: jpgImage.height,
            });
            const pdfBytes = await pdfDoc.save();
            const written = await window.lalo.savePdfInPlace(res.target, pdfBytes);
            if (!written || written.ok === false) {
              throw new Error(written?.error || 'No se pudo guardar el PDF');
            }
            toast(`Imagen guardada: ${res.name}`);
          } else if (res?.action === 'save' && !res.canceled && res.name) {
            toast(`Imagen guardada: ${res.name}`);
          }
        }
      } catch (error) {
        showError('No se pudo procesar la imagen', error);
      }
    });

    hit.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || state.markupOpen) return;
      event.stopPropagation();
      clearSelectedPdfImage();
      hit.classList.add('selected');

      const startX = event.clientX;
      const startY = event.clientY;
      let started = false;
      let nativeStarted = false;
      let preparedPromise = null;

      const onMove = async (moveEvent) => {
        if (nativeStarted) return;
        if (!started) {
          if (Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY) < 5) return;
          started = true;
          preparedPromise = (async () => {
            if (!window.lalo?.prepareDragFile) return null;
            const { bytes, icon } = await getJpeg();
            const res = await window.lalo.prepareDragFile(fileName, bytes);
            if (!res || !res.ok) return null;
            return { path: res.path, icon };
          })();
          preparedPromise.then((prep) => {
            if (prep && started && !nativeStarted) {
              window.lalo?.armDrag?.(prep.path, prep.icon);
            }
          });
        }
        const outOfWindow =
          moveEvent.clientX <= 0 ||
          moveEvent.clientY <= 0 ||
          moveEvent.clientX >= window.innerWidth - 1 ||
          moveEvent.clientY >= window.innerHeight - 1;
        if (outOfWindow && preparedPromise) {
          nativeStarted = true;
          cleanup();
          const prep = await preparedPromise;
          if (prep && window.lalo?.startDrag) {
            await window.lalo.startDrag(prep.path, prep.icon);
          }
        }
      };

      const cleanup = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
      };

      const onUp = () => {
        if (!nativeStarted) window.lalo?.cancelDrag?.();
        started = false;
        cleanup();
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    });
  }

  function buildPageElement(index, page, viewport, scale, dpr) {
    const model = state.pages[index];
    const wrapper = document.createElement('div');
    wrapper.className = 'page';
    wrapper.dataset.index = String(index);
    wrapper.dataset.pageId = model.id;
    wrapper.style.width = `${viewport.width}px`;
    wrapper.style.height = `${viewport.height}px`;

    const canvas = document.createElement('canvas');
    canvas.className = 'page-canvas';
    canvas.width = Math.max(1, Math.floor(viewport.width * dpr));
    canvas.height = Math.max(1, Math.floor(viewport.height * dpr));
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;

    const overlay = document.createElement('canvas');
    overlay.className = 'page-overlay';
    overlay.width = canvas.width;
    overlay.height = canvas.height;
    overlay.style.width = `${viewport.width}px`;
    overlay.style.height = `${viewport.height}px`;
    overlay.dataset.pageId = model.id;
    overlay.dataset.index = String(index);
    overlay.__dpr = dpr;
    overlay.__scale = scale;

    paintOverlay(overlay, model.id, viewport.width, viewport.height);
    attachOverlayEvents(overlay, index, scale);

    const textLayer = document.createElement('div');
    textLayer.className = 'textLayer';
    textLayer.style.setProperty('--scale-factor', String(viewport.scale));

    const imageLayer = document.createElement('div');
    imageLayer.className = 'page-image-layer';

    const formLayer = document.createElement('div');
    formLayer.className = 'form-layer';

    const badge = document.createElement('span');
    badge.className = 'page-badge';
    badge.textContent = String(index + 1);

    wrapper.append(canvas, overlay, textLayer, imageLayer, formLayer, badge);

    let rendered = false;
    let rendering = false;
    wrapper.__render = async () => {
      if (rendered || rendering) return;
      rendering = true;
      try {
        const ctx = canvas.getContext('2d');
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({
          canvasContext: ctx,
          viewport,
          transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
        }).promise;
        const textContent = await page.getTextContent();
        textLayer.innerHTML = '';
        textLayer.style.setProperty('--scale-factor', String(viewport.scale));
        await pdfjsLib.renderTextLayer({
          textContentSource: textContent,
          container: textLayer,
          viewport,
          textDivs: [],
        }).promise;
        formLayer.innerHTML = '';
        try {
          const anns = await page.getAnnotations();
          for (const ann of anns) {
            if (ann.subtype !== 'Widget' || !ann.rect) continue;
            const [vx1, vy1, vx2, vy2] = viewport.convertToViewportRectangle(ann.rect);
            const left = Math.min(vx1, vx2);
            const top = Math.min(vy1, vy2);
            const width = Math.max(8, Math.abs(vx2 - vx1));
            const height = Math.max(8, Math.abs(vy2 - vy1));
            const name = ann.fieldName || ann.id;
            const rectHeightPt = Math.abs(ann.rect[3] - ann.rect[1]) || 20;
            const daFontSize = Number(ann.defaultAppearanceData?.fontSize) || 0;
            const fieldFontPx = Math.max(
              8,
              resolveFormFontSize(daFontSize, rectHeightPt) * viewport.scale,
            );

            let input = null;
            if (ann.fieldType === 'Tx') {
              input = document.createElement(ann.multiLine ? 'textarea' : 'input');
              if (!ann.multiLine) input.type = 'text';
              input.className = 'form-field';
              input.value = state.formValues.has(name)
                ? state.formValues.get(name)
                : ann.fieldValue || '';
              input.style.fontSize = `${fieldFontPx}px`;
              input.addEventListener('input', () => {
                state.formValues.set(name, input.value);
                setDirty(true);
              });
            } else if (ann.fieldType === 'Btn' && ann.checkBox) {
              input = document.createElement('input');
              input.type = 'checkbox';
              input.className = 'form-field form-field-check';
              input.checked = state.formValues.has(name)
                ? Boolean(state.formValues.get(name))
                : Boolean(ann.fieldValue && ann.fieldValue !== 'Off');
              input.addEventListener('change', () => {
                state.formValues.set(name, input.checked);
                setDirty(true);
              });
            } else if (ann.fieldType === 'Ch' && Array.isArray(ann.options)) {
              input = document.createElement('select');
              input.className = 'form-field';
              for (const opt of ann.options) {
                const o = document.createElement('option');
                o.value = opt.exportValue ?? opt.displayValue ?? '';
                o.textContent = opt.displayValue ?? opt.exportValue ?? '';
                input.appendChild(o);
              }
              const curVal = state.formValues.has(name)
                ? state.formValues.get(name)
                : Array.isArray(ann.fieldValue)
                  ? ann.fieldValue[0]
                  : ann.fieldValue || '';
              if (curVal) input.value = curVal;
              input.style.fontSize = `${fieldFontPx}px`;
              input.addEventListener('change', () => {
                state.formValues.set(name, input.value);
                setDirty(true);
              });
            }
            if (input) {
              input.style.left = `${left}px`;
              input.style.top = `${top}px`;
              input.style.width = `${width}px`;
              input.style.height = `${height}px`;
              formLayer.appendChild(input);
            }
          }
        } catch {
          /* ignore form widget errors */
        }
        imageLayer.innerHTML = '';
        try {
          const opList = await page.getOperatorList();
          const imageRects = extractPageImageRects(opList, viewport);
          imageRects.forEach((rect, imgIndex) => {
            const hit = document.createElement('div');
            hit.className = 'page-image-hit';
            hit.style.left = `${rect.left}px`;
            hit.style.top = `${rect.top}px`;
            hit.style.width = `${rect.width}px`;
            hit.style.height = `${rect.height}px`;
            hit.title = 'Clic para seleccionar · Arrastra fuera para guardar JPEG · Clic derecho para opciones';
            attachImageHitEvents(hit, page, rect, index, imgIndex, viewport.scale);
            imageLayer.append(hit);
          });
        } catch {
          /* ignorar si no se pueden listar operadores de imagen */
        }
        rendered = true;
      } catch (error) {
        if (error?.name !== 'RenderingCancelledException') {
          console.warn('Error al dibujar una página', error);
        }
      } finally {
        rendering = false;
      }
    };

    return wrapper;
  }

  function annotationBounds(annotation, width, height, scale) {
    if (!annotation) return { x: 0, y: 0, w: 0, h: 0 };
    if (annotation.type === 'line' || annotation.type === 'arrow') {
      const x1 = annotation.x1 * width;
      const y1 = annotation.y1 * height;
      const x2 = annotation.x2 * width;
      const y2 = annotation.y2 * height;
      return {
        x: Math.min(x1, x2),
        y: Math.min(y1, y2),
        w: Math.abs(x2 - x1),
        h: Math.abs(y2 - y1),
      };
    }
    if (annotation.type === 'text' && !annotation.w) {
      return {
        x: annotation.x * width,
        y: annotation.y * height,
        w: textFallbackWidth(annotation) * scale,
        h: (annotation.size || 14) * LINE_HEIGHT * scale,
      };
    }
    return {
      x: annotation.x * width,
      y: annotation.y * height,
      w: annotation.w * width,
      h: annotation.h * height,
    };
  }

  function drawAnn(ctx, annotation, width, height, scale) {
    if (!annotation) return;
    const thickness = Math.max(1, (annotation.width || 3) * scale);
    ctx.save();
    if (annotation.type === 'highlight') {
      ctx.globalAlpha = 0.38;
      ctx.fillStyle = annotation.color;
      ctx.fillRect(
        annotation.x * width,
        annotation.y * height,
        annotation.w * width,
        annotation.h * height,
      );
    } else if (annotation.type === 'redact') {
      ctx.fillStyle = '#000000';
      ctx.fillRect(annotation.x * width, annotation.y * height, annotation.w * width, annotation.h * height);
      ctx.strokeStyle = '#ff453a';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(annotation.x * width, annotation.y * height, annotation.w * width, annotation.h * height);
    } else if (annotation.type === 'rect') {
      ctx.strokeStyle = annotation.color;
      ctx.lineWidth = thickness;
      ctx.strokeRect(
        annotation.x * width,
        annotation.y * height,
        annotation.w * width,
        annotation.h * height,
      );
    } else if (annotation.type === 'ellipse') {
      ctx.strokeStyle = annotation.color;
      ctx.lineWidth = thickness;
      ctx.beginPath();
      ctx.ellipse(
        (annotation.x + annotation.w / 2) * width,
        (annotation.y + annotation.h / 2) * height,
        Math.max(0.5, (annotation.w * width) / 2),
        Math.max(0.5, (annotation.h * height) / 2),
        0,
        0,
        Math.PI * 2,
      );
      ctx.stroke();
    } else if (annotation.type === 'line' || annotation.type === 'arrow') {
      const start = { x: annotation.x1 * width, y: annotation.y1 * height };
      const end = { x: annotation.x2 * width, y: annotation.y2 * height };
      const isArrow = annotation.type === 'arrow';
      const length = Math.hypot(end.x - start.x, end.y - start.y);
      const angle = Math.atan2(end.y - start.y, end.x - start.x);
      const head = isArrow && length > 1 ? arrowHeadSize(thickness, length, scale) : 0;
      ctx.strokeStyle = annotation.color;
      ctx.fillStyle = annotation.color;
      ctx.lineWidth = thickness;
      ctx.lineCap = isArrow ? 'butt' : 'round';
      ctx.lineJoin = 'round';
      const shaftEnd = head ? arrowShaftEnd(end, angle, head) : end;
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(shaftEnd.x, shaftEnd.y);
      ctx.stroke();
      if (head) {
        const [tip, left, right] = arrowHeadPoints(end, angle, head);
        ctx.beginPath();
        ctx.moveTo(tip.x, tip.y);
        ctx.lineTo(left.x, left.y);
        ctx.lineTo(right.x, right.y);
        ctx.closePath();
        ctx.fill();
      }
    } else if (annotation.type === 'pen') {
      const points = annotation.points || [];
      if (points.length > 1) {
        ctx.strokeStyle = annotation.color;
        ctx.lineWidth = thickness;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        points.forEach(([x, y], i) => {
          if (i === 0) ctx.moveTo(x * width, y * height);
          else ctx.lineTo(x * width, y * height);
        });
        ctx.stroke();
      }
    } else if (annotation.type === 'signature' && annotation.dataUrl) {
      let img = annotation.__img;
      if (!img) {
        img = new Image();
        img.src = annotation.dataUrl;
        img.onload = () => redrawAllOverlays();
        annotation.__img = img;
      }
      if (img.complete && img.naturalWidth) {
        ctx.save();
        ctx.globalAlpha = annotation.opacity ?? 1;
        ctx.drawImage(img, annotation.x * width, annotation.y * height, annotation.w * width, annotation.h * height);
        ctx.restore();
      }
    } else if (annotation.type === 'text') {
      const size = Math.max(6, (annotation.size || 14) * scale);
      const box = annotationBounds(annotation, width, height, scale);
      const lineHeight = size * LINE_HEIGHT;
      if (annotation.borderColor && annotation.borderColor !== 'none') {
        ctx.strokeStyle = annotation.borderColor;
        ctx.lineWidth = Math.max(1, (annotation.borderWidth || 2) * scale);
        const r = Math.min((annotation.borderRadius || 0) * scale, box.w / 2, box.h / 2);
        if (r > 0 && ctx.roundRect) {
          ctx.beginPath();
          ctx.roundRect(box.x, box.y, Math.max(1, box.w), Math.max(1, box.h), r);
          ctx.stroke();
        } else {
          ctx.strokeRect(box.x, box.y, Math.max(1, box.w), Math.max(1, box.h));
        }
      }
      ctx.fillStyle = annotation.color;
      ctx.font = `${annotation.italic ? 'italic ' : ''}${annotation.bold ? 'bold ' : ''}${size}px ${FONT_FAMILY}`;
      ctx.textBaseline = 'top';
      const align = annotation.align || 'left';
      ctx.textAlign = align;
      const textX =
        align === 'center' ? box.x + box.w / 2 : align === 'right' ? box.x + box.w : box.x;
      ctx.save();
      ctx.beginPath();
      ctx.rect(box.x, box.y, Math.max(1, box.w), Math.max(1, box.h));
      ctx.clip();
      const lines = wrapLines(
        (value) => ctx.measureText(value).width,
        annotation.text,
        Math.max(8, box.w),
      );
      lines.forEach((line, index) => {
        const y = box.y + index * lineHeight;
        if (y > box.y + box.h + lineHeight) return;
        ctx.fillText(line, textX, y);
        if (annotation.underline || annotation.strike) {
          const lw = ctx.measureText(line).width;
          const lx =
            align === 'center' ? textX - lw / 2 : align === 'right' ? textX - lw : textX;
          ctx.strokeStyle = annotation.color;
          ctx.lineWidth = Math.max(1, size * 0.07);
          if (annotation.underline) {
            ctx.beginPath();
            ctx.moveTo(lx, y + size * 1.02);
            ctx.lineTo(lx + lw, y + size * 1.02);
            ctx.stroke();
          }
          if (annotation.strike) {
            ctx.beginPath();
            ctx.moveTo(lx, y + size * 0.55);
            ctx.lineTo(lx + lw, y + size * 0.55);
            ctx.stroke();
          }
        }
      });
      ctx.restore();
    }
    ctx.restore();
  }

  function annotationHandles(annotation, width, height, scale) {
    if (annotation.type === 'line' || annotation.type === 'arrow') {
      return [
        { id: 'p1', x: annotation.x1 * width, y: annotation.y1 * height },
        { id: 'p2', x: annotation.x2 * width, y: annotation.y2 * height },
      ];
    }
    const box = annotationBounds(annotation, width, height, scale);
    const { x, y, w, h } = box;
    return [
      { id: 'nw', x, y },
      { id: 'n', x: x + w / 2, y },
      { id: 'ne', x: x + w, y },
      { id: 'e', x: x + w, y: y + h / 2 },
      { id: 'se', x: x + w, y: y + h },
      { id: 's', x: x + w / 2, y: y + h },
      { id: 'sw', x, y: y + h },
      { id: 'w', x, y: y + h / 2 },
    ];
  }

  const HANDLE_CURSORS = {
    nw: 'nwse-resize',
    n: 'ns-resize',
    ne: 'nesw-resize',
    e: 'ew-resize',
    se: 'nwse-resize',
    s: 'ns-resize',
    sw: 'nesw-resize',
    w: 'ew-resize',
    p1: 'crosshair',
    p2: 'crosshair',
  };

  function drawSelection(ctx, annotation, width, height, scale) {
    const box = annotationBounds(annotation, width, height, scale);
    ctx.save();
    ctx.strokeStyle = '#0a84ff';
    ctx.lineWidth = 1.2;
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(box.x - 1.5, box.y - 1.5, box.w + 3, box.h + 3);
    ctx.setLineDash([]);
    for (const handle of annotationHandles(annotation, width, height, scale)) {
      ctx.beginPath();
      ctx.arc(handle.x, handle.y, HANDLE_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.strokeStyle = '#0a84ff';
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }
    ctx.restore();
  }

  function paintCompareOverlay(canvas, pageId, width, height, extra) {
    const ctx = canvas.getContext('2d');
    const dpr = canvas.__dpr || 1;
    const scale = canvas.__scale || 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (state.pageNumbers) {
      const pn = state.pageNumbers;
      const pageIndex = Number(canvas.dataset.index);
      const pageNum1Based = pageIndex + 1;
      if (pageNum1Based >= pn.from && pageNum1Based <= pn.to) {
        const displayNum = pn.start + (pageNum1Based - pn.from);
        const totalDisplay = pn.start + (pn.to - pn.from);
        const label =
          pn.format === 'page-n'
            ? `Página ${displayNum}`
            : pn.format === 'n-of-total'
              ? `${displayNum} / ${totalDisplay}`
              : String(displayNum);
        const sz = Math.max(7, (pn.size || 11) * scale);
        const marginX = 32 * scale;
        const marginY = 24 * scale;
        ctx.save();
        ctx.fillStyle = '#333338';
        ctx.font = `${sz}px ${FONT_FAMILY}`;
        ctx.textBaseline = pn.vpos === 'top' ? 'top' : 'bottom';
        ctx.textAlign = pn.hpos;
        const x =
          pn.hpos === 'left' ? marginX : pn.hpos === 'right' ? width - marginX : width / 2;
        const y = pn.vpos === 'top' ? marginY : height - marginY;
        ctx.fillText(label, x, y);
        ctx.restore();
      }
    }

    if (state.watermark && (state.watermark.text || state.watermark.dataUrl)) {
      const wm = state.watermark;
      ctx.save();
      ctx.globalAlpha = wm.opacity;
      ctx.translate(width / 2, height / 2);
      ctx.rotate((wm.rotation * Math.PI) / 180);
      if (wm.kind === 'image' && wm.dataUrl) {
        let img = wm.__img;
        if (!img || img.src !== wm.dataUrl) {
          img = new Image();
          img.src = wm.dataUrl;
          img.onload = () => redrawAllOverlays();
          wm.__img = img;
        }
        if (img.complete && img.naturalWidth) {
          const targetW = Math.max(24, (width * (wm.size || 54)) / 120);
          const targetH = targetW * (img.naturalHeight / img.naturalWidth);
          ctx.drawImage(img, -targetW / 2, -targetH / 2, targetW, targetH);
        }
      } else if (wm.text) {
        ctx.fillStyle = wm.color;
        ctx.font = `600 ${Math.max(8, wm.size * scale)}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(wm.text, 0, 0);
      }
      ctx.restore();
    }

    const annotations = state.annotations.get(pageId) || [];
    for (const annotation of annotations) drawAnn(ctx, annotation, width, height, scale);
    if (extra) drawAnn(ctx, extra, width, height, scale);
    if (state.selection && state.selection.pageId === pageId) {
      const selected = annotations.find((annotation) => annotation.id === state.selection.id);
      if (selected) drawSelection(ctx, selected, width, height, scale);
    }

    const rects = state.search.rects.get(pageId);
    if (rects) {
      for (const rect of rects) {
        const active = rect.occ === state.search.index;
        ctx.fillStyle = active ? 'rgba(255, 159, 10, 0.55)' : 'rgba(255, 214, 10, 0.35)';
        ctx.fillRect(rect.x * width, rect.y * height, rect.w * width, rect.h * height);
        if (active) {
          ctx.strokeStyle = 'rgba(255, 159, 10, 0.95)';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(rect.x * width, rect.y * height, rect.w * width, rect.h * height);
        }
      }
    }
  }

  function redrawPage(pageId) {
    const overlay = el.viewer.querySelector(`.page-overlay[data-page-id="${pageId}"]`);
    if (!overlay) return;
    const width = parseFloat(overlay.style.width) || overlay.offsetWidth;
    const height = parseFloat(overlay.style.height) || overlay.offsetHeight;
    const extra = state.drag && state.drag.pageId === pageId ? state.drag.ann : null;
    paintOverlay(overlay, pageId, width, height, extra);
  }

  function redrawAllOverlays() {
    $$('.page-overlay', el.viewer).forEach((overlay) => {
      const pageId = overlay.dataset.pageId;
      const width = parseFloat(overlay.style.width) || overlay.offsetWidth;
      const height = parseFloat(overlay.style.height) || overlay.offsetHeight;
      paintOverlay(overlay, pageId, width, height);
    });
  }

  function flashPage(index) {
    const pageEl = el.viewer.querySelector(`.page[data-index="${index}"]`);
    if (!pageEl) return;
    pageEl.classList.remove('search-hit');
    void pageEl.offsetWidth;
    pageEl.classList.add('search-hit');
    setTimeout(() => pageEl.classList.remove('search-hit'), 1000);
  }

  function goToPage(index, { flash = false } = {}) {
    if (!state.pages.length) return;
    state.current = clamp(index, 0, state.pages.length - 1);
    if (state.viewMode === 'single' || state.viewMode === 'two') {
      const token = ++state.renderToken;
      renderViewer({ token, preserveScroll: false, scrollToCurrent: true });
    } else {
      const pageEl = el.viewer.querySelector(`.page[data-index="${state.current}"]`);
      if (pageEl) pageEl.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
    updateThumbSelection();
    updateStatus();
    if (flash) setTimeout(() => flashPage(state.current), 200);
  }

  function navigate(delta) {
    const step = state.viewMode === 'two' ? 2 : 1;
    goToPage(state.current + delta * step);
  }

  function updateCurrentFromScroll() {
    if (state.viewMode !== 'continuous' || !state.pdf) return;
    const pages = $$('.page', el.viewer);
    if (!pages.length) return;
    const viewerRect = el.viewer.getBoundingClientRect();
    const middle = viewerRect.top + el.viewer.clientHeight * 0.4;
    let best = state.current;
    let bestDistance = Infinity;
    for (const pageEl of pages) {
      const rect = pageEl.getBoundingClientRect();
      const distance = Math.abs((rect.top + rect.bottom) / 2 - middle);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = Number(pageEl.dataset.index);
      }
    }
    if (best !== state.current) {
      state.current = best;
      updateThumbSelection();
      updateStatus();
    }
  }

  function updateThumbSelection(scroll = true) {
    $$('.thumb', el.thumbs).forEach((thumb) => {
      const index = Number(thumb.dataset.index);
      const model = state.pages[index];
      thumb.classList.toggle('selected', !!model && state.selected.has(model.id));
      thumb.classList.toggle('current', index === state.current);
    });
    if (scroll) {
      const current = el.thumbs.querySelector(`.thumb[data-index="${state.current}"]`);
      if (current) current.scrollIntoView({ block: 'nearest' });
    }
  }

  async function renderThumbs(token) {
    const pdf = state.pdf;
    if (!pdf) return;
    el.thumbs.innerHTML = '';
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    for (let index = 0; index < state.pages.length; index += 1) {
      if (token !== state.thumbToken) return;
      let page;
      try {
        page = await pdf.getPage(index + 1);
      } catch {
        return;
      }
      const base = page.getViewport({ scale: 1 });
      const scale = 360 / base.width;
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.floor(viewport.width * dpr));
      canvas.height = Math.max(1, Math.floor(viewport.height * dpr));
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      try {
        await page.render({
          canvasContext: ctx,
          viewport,
          transform: [dpr, 0, 0, dpr, 0, 0],
        }).promise;
      } catch {
        /* página no disponible */
      }
      if (token !== state.thumbToken) return;

      const thumb = document.createElement('div');
      thumb.className = 'thumb';
      thumb.dataset.index = String(index);
      thumb.title = 'Arrastra fuera de la ventana para guardar la página como PDF';
      // Sin arrastre HTML: el arrastre se gestiona con punteros para poder
      // generar un PDF real al salir de la ventana.
      thumb.draggable = false;
      const frame = document.createElement('div');
      frame.className = 'thumb-frame';
      const num = document.createElement('span');
      num.className = 'thumb-num';
      num.textContent = String(index + 1);
      frame.append(canvas, num);
      thumb.append(frame);
      bindThumbEvents(thumb, index);
      el.thumbs.append(thumb);
    }
    updateThumbSelection(false);
  }

  // === PART 2B ===
  /* ------------------------------------------------------------- thumbnails */

  let thumbPointer = null;
  let suppressThumbClick = false;

  function clearDropMarkers() {
    $$('.thumb', el.thumbs).forEach((thumb) => {
      thumb.classList.remove('drop-before', 'drop-after');
    });
  }

  function markDraggingThumbs(ids) {
    $$('.thumb', el.thumbs).forEach((thumb) => {
      const model = state.pages[Number(thumb.dataset.index)];
      thumb.classList.toggle('dragging', !!model && ids.has(model.id));
    });
  }

  function releaseThumbPointer(drag) {
    try {
      drag.element.releasePointerCapture(drag.pointerId);
    } catch {
      /* ignore */
    }
  }

  function finishThumbPointer(suppressClick) {
    const drag = thumbPointer;
    thumbPointer = null;
    clearDropMarkers();
    $$('.thumb.dragging', el.thumbs).forEach((thumb) => thumb.classList.remove('dragging'));
    el.thumbs.classList.remove('drag-active');
    document.body.classList.remove('thumb-dragging');
    if (drag) {
      drag.done = true;
      releaseThumbPointer(drag);
      const cancel = window.lalo?.cancelDrag?.();
      if (cancel && cancel.catch) cancel.catch(() => {});
    }
    if (suppressClick) {
      suppressThumbClick = true;
      setTimeout(() => {
        suppressThumbClick = false;
      }, 200);
    }
  }

  function isOutsideWindow(x, y) {
    return x < 0 || y < 0 || x >= window.innerWidth || y >= window.innerHeight;
  }

  function thumbDropTargetAt(x, y) {
    const node = document.elementFromPoint(x, y);
    const thumb = node && node.closest ? node.closest('.thumb') : null;
    if (!thumb || !el.thumbs.contains(thumb)) return null;
    const rect = thumb.getBoundingClientRect();
    return {
      index: Number(thumb.dataset.index),
      after: y > rect.top + rect.height / 2,
      thumb,
    };
  }

  function updateThumbDropTarget(x, y) {
    const target = thumbDropTargetAt(x, y);
    clearDropMarkers();
    if (target) target.thumb.classList.add(target.after ? 'drop-after' : 'drop-before');
    return target;
  }

  function autoScrollThumbs(y) {
    const rect = el.thumbs.getBoundingClientRect();
    const edge = 34;
    if (y < rect.top + edge) el.thumbs.scrollTop -= 14;
    else if (y > rect.bottom - edge) el.thumbs.scrollTop += 14;
  }

  // Nombre legible del PDF que se genera al arrastrar: «documento - página 3.pdf».
  function dragFileName(models) {
    const numbers = models
      .map((model) => state.pages.indexOf(model) + 1)
      .filter((number) => number > 0)
      .sort((a, b) => a - b);
    const doc = baseName(state.fileName).slice(0, 80);
    if (numbers.length === 1) return `${doc} - página ${numbers[0]}.pdf`;
    if (!numbers.length) return `${doc}.pdf`;
    const contiguous = numbers.every((number, i) => i === 0 || number === numbers[i - 1] + 1);
    if (contiguous) return `${doc} - páginas ${numbers[0]}-${numbers[numbers.length - 1]}.pdf`;
    return `${doc} - páginas ${numbers.join(', ')}.pdf`;
  }

  function makeDragIcon(models) {
    try {
      const firstIndex = state.pages.indexOf(models[0]);
      const source = el.thumbs.querySelector(`.thumb[data-index="${firstIndex}"] canvas`);
      const width = 96;
      const height = 120;
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      const pad = 8;
      let dw = width - pad * 2;
      let dh = height - pad * 2;
      if (source && source.width && source.height) {
        const ratio = Math.min(dw / source.width, dh / source.height);
        dw = Math.max(1, source.width * ratio);
        dh = Math.max(1, source.height * ratio);
      }
      const x = (width - dw) / 2;
      const y = (height - dh) / 2;
      ctx.save();
      ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
      ctx.shadowBlur = 8;
      ctx.shadowOffsetY = 3;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x, y, dw, dh);
      ctx.restore();
      if (source) ctx.drawImage(source, x, y, dw, dh);
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.28)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, Math.max(0, dw - 1), Math.max(0, dh - 1));
      if (models.length > 1) {
        const label = String(models.length);
        ctx.font = '600 10px "Segoe UI", -apple-system, Helvetica, sans-serif';
        const tw = ctx.measureText(label).width + 10;
        const bx = width - tw - 4;
        const by = height - 18;
        ctx.fillStyle = '#ff3b30';
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(bx, by, tw, 14, 7);
        else ctx.rect(bx, by, tw, 14);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, bx + tw / 2, by + 7.5);
      }
      return canvas.toDataURL('image/png');
    } catch {
      return '';
    }
  }

  async function prepareDragFile(models) {
    if (!window.lalo?.prepareDragFile) return null;
    const bytes = await composeBytes(models);
    const result = await window.lalo.prepareDragFile(dragFileName(models), bytes);
    if (!result || result.ok === false) {
      throw new Error((result && result.error) || 'No se pudo preparar el PDF.');
    }
    return result;
  }

  function activateThumbDrag(drag) {
    drag.active = true;
    const model = state.pages[drag.index];
    if (!model) return;
    if (!state.selected.has(model.id)) {
      state.selected = new Set([model.id]);
      state.anchorIndex = drag.index;
      updateThumbSelection(false);
    }
    drag.ids = new Set(state.selected);
    drag.models = state.pages.filter((page) => drag.ids.has(page.id));
    el.thumbs.classList.add('drag-active');
    document.body.classList.add('thumb-dragging');
    markDraggingThumbs(drag.ids);

    // Se prepara el PDF mientras el usuario arrastra, para que al salir de la
    // ventana el arrastre nativo empiece al instante.
    drag.prepared = prepareDragFile(drag.models)
      .then((result) => {
        if (result && drag.active && !drag.done && !drag.native) {
          const armed = window.lalo?.armDrag?.(result.path, makeDragIcon(drag.models));
          if (armed && armed.catch) armed.catch(() => {});
        }
        return result;
      })
      .catch((error) => {
        console.error('No se pudo preparar el PDF para arrastrar', error);
        return null;
      });
  }

  async function startExternalThumbDrag(drag) {
    if (!drag.active || drag.native) return;
    drag.native = true;
    clearDropMarkers();
    $$('.thumb.dragging', el.thumbs).forEach((thumb) => thumb.classList.remove('dragging'));
    el.thumbs.classList.remove('drag-active');
    document.body.classList.remove('thumb-dragging');

    if (!window.lalo?.startDrag) {
      try {
        const bytes = await composeBytes(drag.models);
        downloadBlob(bytes, dragFileName(drag.models), 'application/pdf');
        toast(`PDF descargado: ${dragFileName(drag.models)}`);
      } catch (error) {
        showError('No se pudo exportar el PDF', error);
      }
      if (thumbPointer === drag) finishThumbPointer(true);
      return;
    }

    try {
      const prepared = await drag.prepared;
      if (!prepared) throw new Error('No se pudo preparar el PDF.');
      const result = await window.lalo.startDrag(prepared.path, makeDragIcon(drag.models));
      if (result && result.ok === false) {
        throw new Error(result.error || 'No se pudo iniciar el arrastre.');
      }
    } catch (error) {
      showError('No se pudo arrastrar el PDF', error);
    } finally {
      if (thumbPointer === drag) finishThumbPointer(true);
    }
  }

  function bindThumbEvents(thumb, index) {
    thumb.addEventListener('click', (event) => {
      if (suppressThumbClick) return;
      selectPage(index, event);
      goToPage(index);
    });

    thumb.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      const model = state.pages[index];
      if (!model) return;
      if (thumbPointer) finishThumbPointer(false);
      thumbPointer = {
        element: thumb,
        pointerId: event.pointerId,
        index,
        startX: event.clientX,
        startY: event.clientY,
        active: false,
        native: false,
        done: false,
        ids: null,
        models: null,
        prepared: null,
        target: null,
      };
      try {
        thumb.setPointerCapture(event.pointerId);
      } catch {
        /* ignore */
      }
    });

    thumb.addEventListener('pointermove', (event) => {
      const drag = thumbPointer;
      if (!drag || drag.pointerId !== event.pointerId) return;
      if (!drag.active) {
        if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 5) return;
        activateThumbDrag(drag);
      }
      if (!drag.active || drag.native) return;
      if (isOutsideWindow(event.clientX, event.clientY)) {
        startExternalThumbDrag(drag);
        return;
      }
      autoScrollThumbs(event.clientY);
      drag.target = updateThumbDropTarget(event.clientX, event.clientY);
    });

    thumb.addEventListener('pointerup', (event) => {
      const drag = thumbPointer;
      if (!drag || drag.pointerId !== event.pointerId) return;
      if (!drag.active) {
        thumbPointer = null;
        releaseThumbPointer(drag);
        return;
      }
      if (drag.native) {
        finishThumbPointer(false);
        return;
      }
      const outside = isOutsideWindow(event.clientX, event.clientY);
      const target = drag.target;
      const ids = drag.ids;
      finishThumbPointer(true);
      if (outside || !target) return;
      movePages(ids, target.index + (target.after ? 1 : 0));
    });

    thumb.addEventListener('pointercancel', () => {
      const drag = thumbPointer;
      if (!drag) return;
      if (drag.active) finishThumbPointer(true);
      else {
        thumbPointer = null;
        releaseThumbPointer(drag);
      }
    });
  }

  function selectPage(index, event) {
    const model = state.pages[index];
    if (!model) return;
    state.current = index;
    if (event && event.shiftKey && state.anchorIndex != null) {
      const start = Math.min(state.anchorIndex, index);
      const end = Math.max(state.anchorIndex, index);
      state.selected = new Set(state.pages.slice(start, end + 1).map((page) => page.id));
    } else if (event && (event.ctrlKey || event.metaKey)) {
      if (state.selected.has(model.id)) state.selected.delete(model.id);
      else state.selected.add(model.id);
      state.anchorIndex = index;
    } else {
      state.selected = new Set([model.id]);
      state.anchorIndex = index;
    }
    updateThumbSelection();
    updateStatus();
  }

  function movePages(ids, targetIndex) {
    const moving = state.pages.filter((page) => ids.has(page.id));
    if (!moving.length) return;
    const rest = state.pages.filter((page) => !ids.has(page.id));
    const before = state.pages
      .slice(0, targetIndex)
      .filter((page) => !ids.has(page.id)).length;
    const insertAt = clamp(before, 0, rest.length);
    const next = [...rest.slice(0, insertAt), ...moving, ...rest.slice(insertAt)];
    if (next.every((page, index) => page.id === state.pages[index].id)) return;
    pushHistory(true);
    state.pages = next;
    state.current = state.pages.findIndex((page) => page.id === moving[0].id);
    state.dirty = true;
    refresh({ preserveScroll: true });
  }

  /* ------------------------------------------------------------ annotations */

  function getAnnotation(pageId, id) {
    return (state.annotations.get(pageId) || []).find((annotation) => annotation.id === id) || null;
  }

  function getSelectedAnnotation() {
    if (!state.selection) return null;
    return getAnnotation(state.selection.pageId, state.selection.id);
  }

  function distanceToSegment(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lengthSq = dx * dx + dy * dy;
    if (!lengthSq) return Math.hypot(px - x1, py - y1);
    const t = clamp(((px - x1) * dx + (py - y1) * dy) / lengthSq, 0, 1);
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
  }

  function hitAnnotation(annotation, px, py, width, height, scale) {
    const thickness = (annotation.width || 3) * scale;
    if (annotation.type === 'line' || annotation.type === 'arrow') {
      return (
        distanceToSegment(
          px,
          py,
          annotation.x1 * width,
          annotation.y1 * height,
          annotation.x2 * width,
          annotation.y2 * height,
        ) <=
        Math.max(7, thickness / 2 + 5)
      );
    }
    if (annotation.type === 'pen') {
      return (annotation.points || []).some(
        ([x, y]) => Math.hypot(x * width - px, y * height - py) <= Math.max(6, thickness / 2 + 4),
      );
    }
    const box = annotationBounds(annotation, width, height, scale);
    return (
      px >= box.x - 4 &&
      px <= box.x + box.w + 4 &&
      py >= box.y - 4 &&
      py <= box.y + box.h + 4
    );
  }

  function findAnnotationAt(pageId, nx, ny, width, height, scale) {
    const annotations = state.annotations.get(pageId) || [];
    const px = nx * width;
    const py = ny * height;
    for (let i = annotations.length - 1; i >= 0; i -= 1) {
      if (hitAnnotation(annotations[i], px, py, width, height, scale)) return annotations[i];
    }
    return null;
  }

  function ensureTextGeometry(annotation, width, height, scale) {
    if (annotation.type !== 'text' || annotation.w) return;
    const box = annotationBounds(annotation, width, height, scale);
    annotation.x = box.x / width;
    annotation.y = box.y / height;
    annotation.w = Math.max(0.04, box.w / width);
    annotation.h = Math.max(0.02, box.h / height);
  }

  function attachOverlayEvents(overlay, index, scale) {
    const pageId = state.pages[index].id;
    let drawing = null;
    let gesture = null;

    const pointFor = (event) => {
      const rect = overlay.getBoundingClientRect();
      return {
        rect,
        nx: clamp((event.clientX - rect.left) / rect.width, 0, 1),
        ny: clamp((event.clientY - rect.top) / rect.height, 0, 1),
        px: event.clientX - rect.left,
        py: event.clientY - rect.top,
      };
    };

    const selectedHere = () => {
      if (!state.selection || state.selection.pageId !== pageId) return null;
      return getAnnotation(pageId, state.selection.id);
    };

    const focusPage = () => {
      if (state.current === index) return;
      state.current = index;
      updateThumbSelection();
      updateStatus();
    };

    overlay.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      if (!state.markupOpen) {
        selectPage(index, event);
        return;
      }

      const point = pointFor(event);

      if (state.tool === 'select') {
        const selected = selectedHere();
        if (selected) {
          ensureTextGeometry(selected, point.rect.width, point.rect.height, scale);
          const handle = annotationHandles(
            selected,
            point.rect.width,
            point.rect.height,
            scale,
          ).find((item) => Math.hypot(item.x - point.px, item.y - point.py) <= HANDLE_HIT);
          if (handle) {
            event.preventDefault();
            try {
              overlay.setPointerCapture(event.pointerId);
            } catch {
              /* ignore */
            }
            gesture = {
              kind: 'resize',
              annotation: selected,
              handle: handle.id,
              before: snapshot(false),
              changed: false,
              start: point,
              origin: { ...selected },
              overlay,
            };
            return;
          }
        }

        const hit = findAnnotationAt(pageId, point.nx, point.ny, point.rect.width, point.rect.height, scale);
        if (hit) {
          event.preventDefault();
          ensureTextGeometry(hit, point.rect.width, point.rect.height, scale);
          state.selection = { pageId, id: hit.id };
          focusPage();
          updateToolbarState();
          try {
            overlay.setPointerCapture(event.pointerId);
          } catch {
            /* ignore */
          }
          gesture = {
            kind: 'move',
            annotation: hit,
            before: snapshot(false),
            changed: false,
            start: point,
            origin: { ...hit },
            overlay,
          };
          paintOverlay(overlay, pageId, point.rect.width, point.rect.height);
          return;
        }

        state.selection = null;
        updateToolbarState();
        selectPage(index, event);
        paintOverlay(overlay, pageId, point.rect.width, point.rect.height);
        return;
      }

      event.preventDefault();
      try {
        overlay.setPointerCapture(event.pointerId);
      } catch {
        /* ignore */
      }

      if (state.tool === 'eraser') {
        eraseAt(pageId, point.nx, point.ny, overlay);
        return;
      }
      if (state.tool === 'text') {
        focusPage();
        openTextEditor(pageId, point.nx, point.ny, overlay);
        return;
      }

      const base = { id: uid('ann'), color: state.color, width: state.strokeWidth };
      let annotation;
      if (state.tool === 'highlight') {
        annotation = { ...base, type: 'highlight', x: point.nx, y: point.ny, w: 0, h: 0 };
      } else if (state.tool === 'rect' || state.tool === 'ellipse' || state.tool === 'redact') {
        annotation = { ...base, type: state.tool, x: point.nx, y: point.ny, w: 0, h: 0 };
      } else if (state.tool === 'line' || state.tool === 'arrow') {
        annotation = {
          ...base,
          type: state.tool,
          x1: point.nx,
          y1: point.ny,
          x2: point.nx,
          y2: point.ny,
        };
      } else {
        annotation = { ...base, type: 'pen', points: [[point.nx, point.ny]] };
      }
      drawing = {
        annotation,
        start: { nx: point.nx, ny: point.ny },
        overlay,
        pageId,
        width: point.rect.width,
        height: point.rect.height,
      };
      state.drag = { pageId, ann: annotation };
      paintOverlay(overlay, pageId, point.rect.width, point.rect.height, annotation);
    });

    overlay.addEventListener('pointermove', (event) => {
      if (drawing) {
        const rect = overlay.getBoundingClientRect();
        const nx = clamp((event.clientX - rect.left) / rect.width, 0, 1);
        const ny = clamp((event.clientY - rect.top) / rect.height, 0, 1);
        const annotation = drawing.annotation;
        if (annotation.type === 'pen') {
          const points = annotation.points;
          const last = points[points.length - 1];
          if (Math.hypot(nx - last[0], ny - last[1]) > 0.0015) points.push([nx, ny]);
        } else if (annotation.type === 'line' || annotation.type === 'arrow') {
          annotation.x2 = nx;
          annotation.y2 = ny;
        } else {
          annotation.x = Math.min(drawing.start.nx, nx);
          annotation.y = Math.min(drawing.start.ny, ny);
          annotation.w = Math.abs(nx - drawing.start.nx);
          annotation.h = Math.abs(ny - drawing.start.ny);
        }
        paintOverlay(overlay, pageId, rect.width, rect.height, annotation);
        return;
      }

      if (gesture) {
        const point = pointFor(event);
        const annotation = gesture.annotation;
        const dx = point.nx - gesture.start.nx;
        const dy = point.ny - gesture.start.ny;
        if (!gesture.changed && Math.hypot(dx * point.rect.width, dy * point.rect.height) < 1.5) {
          return;
        }
        if (!gesture.changed) {
          gesture.changed = true;
          pushHistoryEntry(gesture.before);
        }

        if (gesture.kind === 'move') {
          const origin = gesture.origin;
          if (annotation.type === 'line' || annotation.type === 'arrow') {
            const ddx = clamp(dx, -Math.min(origin.x1, origin.x2), 1 - Math.max(origin.x1, origin.x2));
            const ddy = clamp(dy, -Math.min(origin.y1, origin.y2), 1 - Math.max(origin.y1, origin.y2));
            annotation.x1 = origin.x1 + ddx;
            annotation.y1 = origin.y1 + ddy;
            annotation.x2 = origin.x2 + ddx;
            annotation.y2 = origin.y2 + ddy;
          } else {
            annotation.x = clamp(origin.x + dx, 0, Math.max(0, 1 - origin.w));
            annotation.y = clamp(origin.y + dy, 0, Math.max(0, 1 - origin.h));
          }
        } else {
          const origin = gesture.origin;
          if (annotation.type === 'line' || annotation.type === 'arrow') {
            if (gesture.handle === 'p1') {
              annotation.x1 = point.nx;
              annotation.y1 = point.ny;
            } else {
              annotation.x2 = point.nx;
              annotation.y2 = point.ny;
            }
          } else {
            const minW = Math.max(MIN_ANN_SIZE, 8 / point.rect.width);
            const minH = Math.max(MIN_ANN_SIZE, 8 / point.rect.height);
            let left = origin.x;
            let top = origin.y;
            let right = origin.x + origin.w;
            let bottom = origin.y + origin.h;
            if (gesture.handle.includes('w')) left = Math.min(point.nx, right - minW);
            if (gesture.handle.includes('e')) right = Math.max(point.nx, left + minW);
            if (gesture.handle.includes('n')) top = Math.min(point.ny, bottom - minH);
            if (gesture.handle.includes('s')) bottom = Math.max(point.ny, top + minH);
            annotation.x = clamp(left, 0, 1 - minW);
            annotation.y = clamp(top, 0, 1 - minH);
            annotation.w = Math.max(minW, right - annotation.x);
            annotation.h = Math.max(minH, bottom - annotation.y);
          }
        }
        paintOverlay(overlay, pageId, point.rect.width, point.rect.height);
        return;
      }

      if (!state.markupOpen || state.tool !== 'select') return;
      const point = pointFor(event);
      let cursor = 'default';
      const selected = selectedHere();
      if (selected) {
        const handle = annotationHandles(
          selected,
          point.rect.width,
          point.rect.height,
          scale,
        ).find((item) => Math.hypot(item.x - point.px, item.y - point.py) <= HANDLE_HIT);
        if (handle) cursor = HANDLE_CURSORS[handle.id] || 'default';
      }
      if (cursor === 'default') {
        const hit = findAnnotationAt(
          pageId,
          point.nx,
          point.ny,
          point.rect.width,
          point.rect.height,
          scale,
        );
        if (hit) cursor = 'move';
      }
      overlay.style.cursor = cursor;
    });

    const finish = (event) => {
      if (gesture) {
        const current = gesture;
        gesture = null;
        try {
          overlay.releasePointerCapture(event.pointerId);
        } catch {
          /* ignore */
        }
        if (current.changed) setDirty(true);
        const rect = overlay.getBoundingClientRect();
        paintOverlay(overlay, pageId, rect.width, rect.height);
        return;
      }
      if (!drawing) return;
      const current = drawing;
      drawing = null;
      state.drag = null;
      try {
        overlay.releasePointerCapture(event.pointerId);
      } catch {
        /* ignore */
      }
      const annotation = current.annotation;
      const isLine = annotation.type === 'line' || annotation.type === 'arrow';
      const tooSmall = isLine
        ? Math.hypot(annotation.x2 - annotation.x1, annotation.y2 - annotation.y1) < 0.006
        : (annotation.type === 'highlight' ||
            annotation.type === 'rect' ||
            annotation.type === 'redact' ||
            annotation.type === 'ellipse') &&
          (annotation.w < 0.004 || annotation.h < 0.004);
      const emptyPen = annotation.type === 'pen' && annotation.points.length < 2;
      if (tooSmall || emptyPen) {
        paintOverlay(overlay, pageId, current.width, current.height);
        return;
      }
      pushHistory(false);
      const annotations = state.annotations.get(pageId) || [];
      annotations.push(annotation);
      state.annotations.set(pageId, annotations);
      setDirty(true);

      // Tras dibujar una forma queda seleccionada para moverla o redimensionarla.
      if (
        annotation.type === 'rect' ||
        annotation.type === 'redact' ||
        annotation.type === 'ellipse' ||
        isLine
      ) {
        state.selection = { pageId, id: annotation.id };
        state.tool = 'select';
        updateToolbarState();
      }
      paintOverlay(overlay, pageId, current.width, current.height);
    };

    overlay.addEventListener('pointerup', finish);
    overlay.addEventListener('pointercancel', finish);

    overlay.addEventListener('dblclick', (event) => {
      if (!state.markupOpen || state.tool !== 'select') return;
      const point = pointFor(event);
      const hit = findAnnotationAt(pageId, point.nx, point.ny, point.rect.width, point.rect.height, scale);
      if (!hit || hit.type !== 'text') return;
      event.preventDefault();
      state.selection = { pageId, id: hit.id };
      openTextEditor(pageId, point.nx, point.ny, overlay, hit);
    });
  }

  function eraseAt(pageId, nx, ny, overlay) {
    const annotations = state.annotations.get(pageId) || [];
    const width = parseFloat(overlay.style.width) || overlay.offsetWidth;
    const height = parseFloat(overlay.style.height) || overlay.offsetHeight;
    const scale = overlay.__scale || 1;
    for (let i = annotations.length - 1; i >= 0; i -= 1) {
      const annotation = annotations[i];
      if (!hitAnnotation(annotation, nx * width, ny * height, width, height, scale)) continue;
      pushHistory(false);
      annotations.splice(i, 1);
      state.annotations.set(pageId, annotations);
      if (state.selection && state.selection.id === annotation.id) state.selection = null;
      paintOverlay(overlay, pageId, width, height);
      setDirty(true);
      return;
    }
  }

  function setFontOption(select, size) {
    if (!select) return;
    const value = String(Math.round(size));
    let option = Array.from(select.options).find((item) => item.value === value);
    if (!option) {
      option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      select.append(option);
    }
    select.value = value;
  }

  function openTextEditor(pageId, nx, ny, overlay, annotation = null) {
    const pageRect = overlay.getBoundingClientRect();
    const wrapRect = el.viewerWrap.getBoundingClientRect();
    const scale = overlay.__scale || 1;
    const size = annotation ? annotation.size || 14 : state.fontSize;
    const editing = !!annotation;

    el.textEditor.hidden = false;
    state.textEdit = {
      pageId,
      annotationId: annotation ? annotation.id : null,
      scale,
    };

    if (editing) {
      if (annotation.color) state.textColor = annotation.color;
      ensureTextGeometry(annotation, pageRect.width, pageRect.height, scale);
      el.textEditor.style.left = `${pageRect.left - wrapRect.left + annotation.x * pageRect.width}px`;
      el.textEditor.style.top = `${pageRect.top - wrapRect.top + annotation.y * pageRect.height}px`;
      el.textInput.style.width = `${Math.max(150, annotation.w * pageRect.width)}px`;
      el.textInput.style.height = `${Math.max(54, annotation.h * pageRect.height)}px`;
      el.textInput.value = annotation.text || '';
    } else {
      const left = clamp(
        pageRect.left - wrapRect.left + nx * pageRect.width,
        8,
        Math.max(8, wrapRect.width - 220),
      );
      const top = clamp(
        pageRect.top - wrapRect.top + ny * pageRect.height,
        8,
        Math.max(8, wrapRect.height - 170),
      );
      el.textEditor.style.left = `${left}px`;
      el.textEditor.style.top = `${top}px`;
      el.textInput.style.width = `${clamp(240 * scale, 170, 360)}px`;
      el.textInput.style.height = `${clamp(92 * scale, 64, 140)}px`;
      el.textInput.value = '';
    }

    el.textInput.style.fontSize = `${Math.max(8, size * scale)}px`;
    setFontOption(el.textSize, size);
    setFontOption(el.fontSize, size);
    requestAnimationFrame(() => {
      el.textInput.focus();
      el.textInput.setSelectionRange(el.textInput.value.length, el.textInput.value.length);
    });
  }

  function closeTextEditor() {
    state.textEdit = null;
    el.textEditor.hidden = true;
    el.textInput.blur();
  }

  function commitText() {
    const pending = state.textEdit;
    if (!pending) {
      el.textEditor.hidden = true;
      return;
    }
    const overlay = el.viewer.querySelector(`.page-overlay[data-page-id="${pending.pageId}"]`);
    if (!overlay) {
      closeTextEditor();
      return;
    }
    const pageRect = overlay.getBoundingClientRect();
    const inputRect = el.textInput.getBoundingClientRect();
    const text = el.textInput.value.replace(/\s+$/, '');
    const size = Number(el.textSize.value) || state.fontSize;
    const align = $('#text-align-select')?.value || 'left';
    const borderColor = $('#text-border-select')?.value || 'none';
    const borderWidth = Number($('.te-bw-btn.active')?.dataset.bw) || 2;
    const borderRadius = Number($('#text-border-radius')?.value) || 0;
    const bold = $('#te-bold')?.classList.contains('active') || false;
    const italic = $('#te-italic')?.classList.contains('active') || false;
    const underline = $('#te-underline')?.classList.contains('active') || false;
    const strike = $('#te-strike')?.classList.contains('active') || false;
    state.fontSize = size;

    const x = clamp((inputRect.left - pageRect.left) / pageRect.width, 0, 0.98);
    const y = clamp((inputRect.top - pageRect.top) / pageRect.height, 0, 0.98);
    const w = clamp(inputRect.width / pageRect.width, 0.03, 1 - x);
    const h = clamp(inputRect.height / pageRect.height, 0.02, 1 - y);

    const annotations = state.annotations.get(pending.pageId) || [];
    const existing = pending.annotationId
      ? annotations.find((annotation) => annotation.id === pending.annotationId)
      : null;

    pushHistory(false);
    let changed = false;
    let selectedId = existing ? existing.id : null;

    if (existing) {
      if (!text.trim()) {
        const index = annotations.indexOf(existing);
        if (index >= 0) annotations.splice(index, 1);
        state.selection = null;
        changed = true;
      } else {
        Object.assign(existing, {
          x,
          y,
          w,
          h,
          text,
          size,
          align,
          borderColor,
          borderWidth,
          borderRadius,
          bold,
          italic,
          underline,
          strike,
        });
        existing.color = state.textColor;
        changed = true;
      }
    } else if (text.trim()) {
      const id = uid('ann');
      annotations.push({
        id,
        type: 'text',
        x,
        y,
        w,
        h,
        text,
        size,
        align,
        borderColor,
        borderWidth,
        borderRadius,
        bold,
        italic,
        underline,
        strike,
        color: state.textColor,
        width: state.strokeWidth,
      });
      selectedId = id;
      changed = true;
    }

    state.annotations.set(pending.pageId, annotations);
    closeTextEditor();

    if (!changed) {
      updateToolbarState();
      return;
    }

    state.tool = 'select';
    if (selectedId && getAnnotation(pending.pageId, selectedId)) {
      state.selection = { pageId: pending.pageId, id: selectedId };
    }
    updateToolbarState();
    redrawPage(pending.pageId);
    setDirty(true);
  }

  function cancelTextInput() {
    if (!state.textEdit) {
      el.textEditor.hidden = true;
      return;
    }
    closeTextEditor();
  }

  function deleteSelection() {
    const selected = getSelectedAnnotation();
    if (!selected) return false;
    const annotations = state.annotations.get(state.selection.pageId) || [];
    const index = annotations.indexOf(selected);
    if (index < 0) return false;
    pushHistory(false);
    annotations.splice(index, 1);
    state.annotations.set(state.selection.pageId, annotations);
    state.selection = null;
    updateToolbarState();
    redrawAllOverlays();
    setDirty(true);
    return true;
  }

  function nudgeSelection(dx, dy) {
    const selected = getSelectedAnnotation();
    if (!selected) return;
    pushHistory(false);
    if (selected.type === 'line' || selected.type === 'arrow') {
      selected.x1 = clamp(selected.x1 + dx, 0, 1);
      selected.y1 = clamp(selected.y1 + dy, 0, 1);
      selected.x2 = clamp(selected.x2 + dx, 0, 1);
      selected.y2 = clamp(selected.y2 + dy, 0, 1);
    } else {
      selected.x = clamp(selected.x + dx, 0, Math.max(0, 1 - selected.w));
      selected.y = clamp(selected.y + dy, 0, Math.max(0, 1 - selected.h));
    }
    redrawAllOverlays();
    setDirty(true);
  }

  /* ----------------------------------------------------------- page actions */

  async function rotatePages(delta) {
    if (!state.pages.length) return;
    const ids = state.selected.size
      ? state.selected
      : new Set([state.pages[state.current].id]);
    pushHistory(true);
    for (const page of state.pages) {
      if (ids.has(page.id)) page.rotation = normAngle((page.rotation || 0) + delta);
    }
    state.dirty = true;

    const animated = [];
    for (const pageEl of $$('.page', el.viewer)) {
      const idx = Number(pageEl.dataset.index);
      const model = state.pages[idx];
      if (model && ids.has(model.id)) {
        pageEl.style.transition = 'transform 0.24s cubic-bezier(0.2, 0.8, 0.2, 1)';
        pageEl.style.transform = `rotate(${delta}deg)`;
        animated.push(pageEl);
      }
    }
    if (animated.length) {
      await new Promise((r) => setTimeout(r, 240));
    }
    refresh({ preserveScroll: true, silent: true });
  }

  function deletePages() {
    if (!state.pages.length) return;
    const ids = state.selected.size
      ? state.selected
      : new Set([state.pages[state.current].id]);
    pushHistory(true);
    state.pages = state.pages.filter((page) => !ids.has(page.id));
    state.selected.clear();
    state.current = clamp(state.current, 0, Math.max(0, state.pages.length - 1));
    state.dirty = true;
    refresh({ preserveScroll: true });
  }

  function duplicatePages() {
    if (!state.pages.length) return;
    const ids = state.selected.size
      ? state.selected
      : new Set([state.pages[state.current].id]);
    pushHistory(true);
    const copies = [];
    for (const page of state.pages) {
      if (ids.has(page.id)) {
        copies.push({ after: page.id, model: { ...page, id: uid('pg') } });
      }
    }
    for (const copy of copies) {
      const index = state.pages.findIndex((page) => page.id === copy.after);
      if (index < 0) continue;
      state.pages.splice(index + 1, 0, copy.model);
      const annotations = state.annotations.get(copy.after);
      if (annotations) {
        state.annotations.set(copy.model.id, JSON.parse(JSON.stringify(annotations)));
      }
    }
    state.selected = new Set(copies.map((copy) => copy.model.id));
    state.dirty = true;
    refresh({ preserveScroll: true });
  }

  async function insertBlankPage() {
    if (!state.pages.length) return;
    let width = 595.28;
    let height = 841.89;
    try {
      const page = await state.pdf.getPage(state.current + 1);
      const viewport = page.getViewport({ scale: 1 });
      width = viewport.width;
      height = viewport.height;
    } catch {
      /* usa A4 */
    }
    pushHistory(true);
    state.pages.splice(state.current + 1, 0, {
      id: uid('pg'),
      kind: 'blank',
      sourceId: null,
      srcIndex: 0,
      rotation: 0,
      width,
      height,
    });
    state.current += 1;
    state.selected = new Set([state.pages[state.current].id]);
    state.dirty = true;
    await refresh({ preserveScroll: true });
  }

  // === PART 3B ===
  /* ----------------------------------------------------------------- search */

  let searchTimer = null;

  function clearSearch() {
    state.search.token += 1;
    state.search.occurrences = [];
    state.search.index = -1;
    state.search.rects.clear();
    if (el.searchResults) el.searchResults.innerHTML = '';
    if (el.searchCount) el.searchCount.textContent = '';
    redrawAllOverlays();
  }

  async function runSearch(query) {
    state.search.query = query;
    const token = ++state.search.token;
    const needle = query.trim().toLowerCase();
    if (!needle) {
      clearSearch();
      return;
    }
    const pdf = state.pdf;
    if (!pdf) return;

    const occurrences = [];
    const rects = new Map();

    for (let i = 0; i < state.pages.length; i += 1) {
      if (token !== state.search.token) return;
      let page;
      try {
        page = await pdf.getPage(i + 1);
      } catch {
        continue;
      }
      let content;
      try {
        content = await page.getTextContent();
      } catch {
        continue;
      }
      const viewport = page.getViewport({ scale: 1 });
      const pageId = state.pages[i].id;

      for (const item of content.items) {
        if (!item.str) continue;
        const haystack = item.str.toLowerCase();
        let from = 0;
        while (from <= haystack.length) {
          const at = haystack.indexOf(needle, from);
          if (at < 0) break;
          const transform = pdfjsLib.Util.transform(viewport.transform, item.transform);
          const height = Math.hypot(transform[2], transform[3]) || item.height || 10;
          const itemWidth = Math.max((item.width || 0) * viewport.scale, 6);
          const length = Math.max(item.str.length, 1);
          const offset = (at / length) * itemWidth;
          const width = Math.max((needle.length / length) * itemWidth, 4);
          const rect = {
            x: clamp((transform[4] + offset) / viewport.width, 0, 1),
            y: clamp((transform[5] - height) / viewport.height, 0, 1),
            w: clamp(width / viewport.width, 0.002, 1),
            h: clamp(height / viewport.height, 0.002, 1),
            occ: occurrences.length,
          };
          occurrences.push({
            pageIndex: i,
            pageId,
            rect: { x: rect.x, y: rect.y, w: rect.w, h: rect.h },
            snippet: item.str.slice(Math.max(0, at - 24), at + needle.length + 36),
          });
          const list = rects.get(pageId) || [];
          list.push(rect);
          rects.set(pageId, list);
          from = at + needle.length;
          if (occurrences.length >= 400) break;
        }
        if (occurrences.length >= 400) break;
      }
      if (occurrences.length >= 400) break;
    }

    if (token !== state.search.token) return;
    state.search.occurrences = occurrences;
    state.search.rects = rects;
    state.search.index = occurrences.length ? 0 : -1;
    renderSearchResults();
    redrawAllOverlays();
  }

  function renderSearchResults() {
    const list = state.search.occurrences;
    el.searchResults.innerHTML = '';
    if (!list.length) {
      el.searchCount.textContent = state.search.query.trim() ? '0' : '';
      if (state.search.query.trim()) {
        const empty = document.createElement('div');
        empty.className = 'search-empty';
        empty.textContent = 'Sin resultados';
        el.searchResults.append(empty);
      }
      return;
    }
    el.searchCount.textContent = `${state.search.index + 1} de ${list.length}`;
    const fragment = document.createDocumentFragment();
    list.slice(0, 300).forEach((occurrence, index) => {
      const item = document.createElement('button');
      item.className = `search-result${index === state.search.index ? ' active' : ''}`;
      const pageLabel = document.createElement('span');
      pageLabel.className = 'sr-page';
      pageLabel.textContent = `Página ${occurrence.pageIndex + 1}`;
      const text = document.createElement('span');
      text.className = 'sr-text';
      text.textContent = occurrence.snippet;
      item.append(pageLabel, text);
      item.addEventListener('click', () => jumpToOccurrence(index));
      fragment.append(item);
    });
    el.searchResults.append(fragment);
  }

  function jumpToOccurrence(index) {
    const list = state.search.occurrences;
    if (!list.length) return;
    const next = ((index % list.length) + list.length) % list.length;
    state.search.index = next;
    const occurrence = list[next];
    el.searchCount.textContent = `${next + 1} de ${list.length}`;
    goToPage(occurrence.pageIndex, { flash: true });
    renderSearchResults();
    redrawAllOverlays();
  }

  function searchNext() {
    jumpToOccurrence(state.search.index + 1);
  }

  function searchPrev() {
    jumpToOccurrence(state.search.index - 1);
  }

  function openSearch() {
    if (!state.pages.length) return;
    el.searchPanel.hidden = false;
    updateToolbarState();
    el.searchInput.focus();
    el.searchInput.select();
    if (state.search.query) runSearch(state.search.query);
  }

  function closeSearch() {
    el.searchPanel.hidden = true;
    el.searchInput.value = '';
    state.search.query = '';
    clearSearch();
    updateToolbarState();
  }

  /* ------------------------------------------------------- view and tools */

  function setViewMode(mode) {
    if (!['continuous', 'single', 'two'].includes(mode)) return;
    state.viewMode = mode;
    updateToolbarState();
    if (!state.pdf) return;
    const token = ++state.renderToken;
    renderViewer({ token, preserveScroll: false, scrollToCurrent: true });
  }

  function zoomTo(scale) {
    if (!state.pages.length) return;
    state.zoomMode = 'custom';
    state.scale = clamp(scale, 0.1, 8);
    const token = ++state.renderToken;
    renderViewer({
      token,
      preserveScroll: true,
      oldTop: el.viewer.scrollTop,
      oldHeight: el.viewer.scrollHeight,
    });
  }

  function zoomIn() {
    zoomTo((state.currentScale || 1) * 1.25);
  }

  function zoomOut() {
    const cur = state.currentScale || 1;
    const next = cur / 1.25;
    const fit = state.lastFitScale;
    if (fit && cur > fit * 1.02 && next <= fit * 1.03) {
      fitWidth();
      return;
    }
    zoomTo(next);
  }

  function zoomReset() {
    zoomTo(1);
  }

  function fitWidth() {
    if (!state.pages.length) return;
    state.zoomMode = 'fit';
    const token = ++state.renderToken;
    renderViewer({
      token,
      preserveScroll: true,
      oldTop: el.viewer.scrollTop,
      oldHeight: el.viewer.scrollHeight,
    });
  }

  function setTool(tool) {
    if (state.textEdit) commitText();
    state.tool = tool;
    if (tool !== 'select') state.selection = null;
    if (!state.markupOpen) state.markupOpen = true;
    updateToolbarState();
    redrawAllOverlays();
  }

  function toggleMarkup(force) {
    state.markupOpen = force === undefined ? !state.markupOpen : force;
    if (!state.markupOpen) {
      if (state.textEdit) commitText();
      state.tool = 'select';
      state.selection = null;
    }
    updateToolbarState();
    redrawAllOverlays();
  }

  function toggleSidebar() {
    state.sidebarHidden = !state.sidebarHidden;
    el.app.classList.toggle('sidebar-hidden', state.sidebarHidden);
    updateToolbarState();
  }

  /* --------------------------------------------------------------- dialogs */

  async function openPdfDialog() {
    try {
      const result = await window.lalo.openPdfs();
      if (result.error) throw new Error(result.error);
      if (!result.canceled) await openFiles(result.files);
    } catch (error) {
      console.error(error);
      toast(`No se pudo abrir el archivo: ${error.message}`, 6000);
    }
  }

  async function addPdfDialog() {
    try {
      const result = await window.lalo.openPdfs();
      if (result.error) throw new Error(result.error);
      if (!result.canceled) await appendFiles(result.files);
    } catch (error) {
      console.error(error);
      toast(`No se pudo añadir el archivo: ${error.message}`, 6000);
    }
  }

  async function addImagesDialog() {
    try {
      const result = await window.lalo.openImages();
      if (result.error) throw new Error(result.error);
      if (!result.canceled) await appendFiles(result.files);
    } catch (error) {
      console.error(error);
      toast(`No se pudo añadir la imagen: ${error.message}`, 6000);
    }
  }

  async function handleDroppedFiles(files) {
    const prepared = [];
    for (const file of files) {
      if (!isPdf(file) && !isImage(file)) continue;
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        let filePath = '';
        try {
          filePath = window.lalo?.pathForFile?.(file) || file.path || '';
        } catch {
          filePath = '';
        }
        prepared.push({ name: file.name, bytes, path: filePath });
      } catch (error) {
        console.error(error);
      }
    }
    if (!prepared.length) {
      toast('Solo se admiten archivos PDF, PNG y JPG');
      return;
    }
    if (!state.pages.length) await openFiles(prepared);
    else await appendFiles(prepared);
  }

  async function showAbout() {
    let info = null;
    try {
      info = await window.lalo.appInfo();
    } catch {
      /* ignore */
    }
    toast(
      info
        ? `Lalo PDF ${info.version} · Electron ${info.electron}`
        : 'Lalo PDF',
      4200,
    );
  }

  /* -------------------------------------------------------------- bindings */

  function bindUI() {
    $('#btn-sidebar').addEventListener('click', toggleSidebar);
    $('#btn-open').addEventListener('click', openPdfDialog);
    $('#empty-open').addEventListener('click', openPdfDialog);
    $('#empty-add').addEventListener('click', addImagesDialog);
    $('#btn-add-pages').addEventListener('click', addPdfDialog);
    $('#btn-delete-pages').addEventListener('click', deletePages);

    $('#btn-zoom-out').addEventListener('click', zoomOut);
    $('#btn-zoom-in').addEventListener('click', zoomIn);

    const openZoomMenu = () => {
      if (!el.zoomMenu) return;
      const pct = Math.round((state.currentScale || 1) * 100);
      $$('.zoom-option', el.zoomMenu).forEach((opt) => {
        const val = opt.dataset.zoom;
        opt.classList.toggle(
          'active',
          val === 'fit' ? state.zoomMode === 'fit' : Number(val) === pct && state.zoomMode !== 'fit',
        );
      });
      el.zoomMenu.hidden = false;
    };

    const closeZoomMenu = () => {
      if (el.zoomMenu) el.zoomMenu.hidden = true;
    };

    const commitZoomInput = () => {
      const raw = String(el.zoomLabel.value || '').replace('%', '').trim();
      const num = Number.parseFloat(raw.replace(',', '.'));
      if (Number.isFinite(num) && num > 0 && state.pages.length) {
        const clamped = clamp(num, 10, 500);
        zoomTo(clamped / 100);
      } else {
        el.zoomLabel.value = `${Math.round((state.currentScale || 1) * 100)} %`;
      }
    };

    el.zoomLabel.addEventListener('focus', () => {
      el.zoomLabel.select();
      openZoomMenu();
    });
    el.zoomLabel.addEventListener('click', () => {
      openZoomMenu();
    });
    el.zoomLabel.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        closeZoomMenu();
        commitZoomInput();
        el.zoomLabel.blur();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        closeZoomMenu();
        el.zoomLabel.value = `${Math.round((state.currentScale || 1) * 100)} %`;
        el.zoomLabel.blur();
      }
    });
    el.zoomLabel.addEventListener('blur', () => {
      setTimeout(() => {
        if (!el.zoomMenu || el.zoomMenu.hidden) commitZoomInput();
      }, 150);
    });
    if (el.zoomMenu) {
      el.zoomMenu.addEventListener('mousedown', (event) => {
        event.preventDefault();
      });
      el.zoomMenu.addEventListener('click', (event) => {
        const option = event.target.closest('.zoom-option');
        if (!option) return;
        const val = option.dataset.zoom;
        closeZoomMenu();
        if (val === 'fit') fitWidth();
        else zoomTo(Number(val) / 100);
        el.zoomLabel.blur();
      });
    }
    document.addEventListener('mousedown', (event) => {
      if (el.zoomMenu && !el.zoomMenu.hidden && !event.target.closest('.zoom-group')) {
        closeZoomMenu();
      }
    });
    $('#btn-rotate').addEventListener('click', () => rotatePages(90));
    el.btnMarkup.addEventListener('click', () => toggleMarkup());
    el.btnSearch.addEventListener('click', openSearch);
    el.btnPrint.addEventListener('click', printPdf);
    $('#btn-export').addEventListener('click', (event) => {
      event.stopPropagation();
      if (!el.exportMenu) {
        exportImages();
        return;
      }
      el.exportMenu.hidden = !el.exportMenu.hidden;
    });
    if (el.exportMenu) {
      el.exportMenu.addEventListener('click', (event) => {
        const option = event.target.closest('.export-option');
        if (!option) return;
        el.exportMenu.hidden = true;
        if (option.dataset.export === 'docx') exportWord();
        else if (option.dataset.export === 'jpg') exportImages('jpg');
        else exportImages('png');
      });
      document.addEventListener('mousedown', (event) => {
        if (!el.exportMenu.hidden && !event.target.closest('.export-group')) {
          el.exportMenu.hidden = true;
        }
      });
    }
    $('#btn-save-as').addEventListener('click', saveAs);
    $('#btn-save').addEventListener('click', (event) => {
      if (event.shiftKey) saveAs();
      else save();
    });

    $$('#view-modes button').forEach((button) => {
      button.addEventListener('click', () => setViewMode(button.dataset.view));
    });
    $$('.tool-btn[data-tool]').forEach((button) => {
      button.addEventListener('click', () => setTool(button.dataset.tool));
    });
    $$('.swatch').forEach((swatch) => {
      swatch.addEventListener('click', () => {
        const color = swatch.dataset.color;
        const selected = getSelectedAnnotation();
        if (state.tool === 'text' || (selected && selected.type === 'text')) {
          state.textColor = color;
        } else {
          state.color = color;
        }
        if (selected) {
          pushHistory(false);
          selected.color = color;
          if (selected.type === 'text') state.textColor = color;
          redrawPage(state.selection.pageId);
          setDirty(true);
        }
        updateToolbarState();
      });
    });
    $$('.thickness-btn').forEach((button) => {
      button.addEventListener('click', () => {
        const width = Number(button.dataset.width) || 3;
        state.strokeWidth = width;
        const selected = getSelectedAnnotation();
        if (selected && selected.type !== 'highlight') {
          pushHistory(false);
          selected.width = width;
          redrawPage(state.selection.pageId);
          setDirty(true);
        }
        updateToolbarState();
      });
    });
    el.fontSize.addEventListener('change', () => {
      const size = Number(el.fontSize.value) || 14;
      state.fontSize = size;
      const selected = getSelectedAnnotation();
      if (selected && selected.type === 'text') {
        pushHistory(false);
        selected.size = size;
        redrawPage(state.selection.pageId);
        setDirty(true);
      }
      updateToolbarState();
    });
    el.btnUndo.addEventListener('click', undo);
    el.btnRedo.addEventListener('click', redo);
    $('#btn-rail-undo')?.addEventListener('click', undo);
    $('#btn-rail-redo')?.addEventListener('click', redo);
    $('#btn-markup-done').addEventListener('click', () => toggleMarkup(false));

    el.searchInput.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => runSearch(el.searchInput.value), 220);
    });
    el.searchInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        if (event.shiftKey) searchPrev();
        else searchNext();
      } else if (event.key === 'Escape') {
        closeSearch();
      }
    });
    $('#search-next').addEventListener('click', searchNext);
    $('#search-prev').addEventListener('click', searchPrev);
    $('#search-close').addEventListener('click', closeSearch);

    el.textInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        commitText();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        cancelTextInput();
      }
    });
    el.textSize.addEventListener('change', () => {
      const size = Number(el.textSize.value) || 14;
      state.fontSize = size;
      if (state.textEdit) {
        el.textInput.style.fontSize = `${Math.max(8, size * (state.textEdit.scale || 1))}px`;
      }
      setFontOption(el.fontSize, size);
      updateToolbarState();
    });
    $('#text-apply').addEventListener('click', commitText);
    $('#text-cancel').addEventListener('click', cancelTextInput);

    let editorDrag = null;
    el.textHead.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || event.target.closest('button, select, label')) return;
      const rect = el.textEditor.getBoundingClientRect();
      const wrapRect = el.viewerWrap.getBoundingClientRect();
      editorDrag = {
        startX: event.clientX,
        startY: event.clientY,
        left: rect.left - wrapRect.left,
        top: rect.top - wrapRect.top,
        wrapRect,
      };
      event.preventDefault();
      try {
        el.textHead.setPointerCapture(event.pointerId);
      } catch {
        /* ignore */
      }
    });
    el.textHead.addEventListener('pointermove', (event) => {
      if (!editorDrag) return;
      const left = clamp(
        editorDrag.left + event.clientX - editorDrag.startX,
        0,
        Math.max(0, editorDrag.wrapRect.width - 90),
      );
      const top = clamp(
        editorDrag.top + event.clientY - editorDrag.startY,
        0,
        Math.max(0, editorDrag.wrapRect.height - 40),
      );
      el.textEditor.style.left = `${left}px`;
      el.textEditor.style.top = `${top}px`;
    });
    const stopEditorDrag = (event) => {
      if (!editorDrag) return;
      editorDrag = null;
      try {
        el.textHead.releasePointerCapture(event.pointerId);
      } catch {
        /* ignore */
      }
    };
    el.textHead.addEventListener('pointerup', stopEditorDrag);
    el.textHead.addEventListener('pointercancel', stopEditorDrag);

    // Al pulsar fuera del cuadro de texto se confirma automáticamente,
    // salvo que el clic sea en sus propios controles.
    document.addEventListener(
      'pointerdown',
      (event) => {
        if (el.textEditor.hidden) return;
        if (el.textEditor.contains(event.target)) return;
        commitText();
      },
      true,
    );

    $('#shortcuts-close').addEventListener('click', () => {
      el.shortcutsModal.hidden = true;
    });
    el.shortcutsModal.addEventListener('click', (event) => {
      if (event.target === el.shortcutsModal) el.shortcutsModal.hidden = true;
    });

    let suppressThumbContextMenu = false;
    el.thumbs.addEventListener('pointerdown', (event) => {
      if (event.button !== 2) return;
      const thumb = event.target.closest('.thumb');
      if (!thumb || !state.pages.length) return;
      const startX = event.clientX;
      const startY = event.clientY;
      let leftWindow = false;

      const onMove = (moveEvent) => {
        if (
          moveEvent.clientX <= 0 ||
          moveEvent.clientY <= 0 ||
          moveEvent.clientX >= window.innerWidth - 1 ||
          moveEvent.clientY >= window.innerHeight - 1
        ) {
          leftWindow = true;
        }
      };

      const onUp = async (upEvent) => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
        const moved = Math.hypot(upEvent.clientX - startX, upEvent.clientY - startY);
        if (!leftWindow || moved < 10) return;

        suppressThumbContextMenu = true;
        setTimeout(() => { suppressThumbContextMenu = false; }, 200);

        const index = Number(thumb.dataset.index);
        const clickedModel = state.pages[index];
        if (!clickedModel) return;
        if (!state.selected.has(clickedModel.id)) {
          state.selected.clear();
          state.selected.add(clickedModel.id);
          state.anchorIndex = index;
          state.current = index;
          updateThumbSelection();
          updateStatus();
        }
        const selectedModels = state.pages.filter((p) => state.selected.has(p.id));
        if (!selectedModels.length || !window.lalo?.pickExportSelection) return;

        const defaultName = dragFileName(selectedModels);
        const picked = await window.lalo.pickExportSelection(defaultName);
        if (!picked || picked.canceled || picked.error) return;
        setBusy(true);
        try {
          const bytes = await composeBytes(selectedModels);
          if (picked.ext === 'pdf') {
            const written = await window.lalo.savePdfInPlace(picked.path, bytes);
            if (!written || written.ok === false) throw new Error(written?.error || 'Error al guardar');
            toast(`PDF guardado: ${picked.name}`);
          } else {
            const ext = picked.ext === 'png' ? 'png' : 'jpg';
            const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
            const pdf = await pdfjsLib.getDocument({ data: bytes.slice() }).promise;
            try {
              const baseTarget = picked.path.replace(/\.(png|jpe?g)$/i, '');
              for (let i = 1; i <= pdf.numPages; i += 1) {
                const page = await pdf.getPage(i);
                const base = page.getViewport({ scale: 1 });
                const scale = Math.min(2, 2600 / Math.max(base.width, base.height));
                const viewport = page.getViewport({ scale });
                const canvas = document.createElement('canvas');
                canvas.width = Math.ceil(viewport.width);
                canvas.height = Math.ceil(viewport.height);
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                await page.render({ canvasContext: ctx, viewport }).promise;
                const blob = await new Promise((resolve) => canvas.toBlob(resolve, mime, 0.92));
                const imgBytes = new Uint8Array(await blob.arrayBuffer());
                const targetPath =
                  pdf.numPages === 1
                    ? picked.path
                    : `${baseTarget}-${String(i).padStart(2, '0')}.${ext}`;
                await window.lalo.savePdfInPlace(targetPath, imgBytes);
              }
              toast(pdf.numPages === 1 ? `Imagen guardada: ${picked.name}` : `${pdf.numPages} imágenes exportadas`);
            } finally {
              await pdf.destroy().catch(() => {});
            }
          }
        } catch (error) {
          showError('No se pudo exportar', error);
        } finally {
          setBusy(false);
        }
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    });

    el.thumbs.addEventListener('contextmenu', async (event) => {
      if (suppressThumbContextMenu) {
        event.preventDefault();
        return;
      }
      const thumb = event.target.closest('.thumb');
      if (!thumb || !state.pages.length || !window.lalo?.showThumbContextMenu) return;
      event.preventDefault();
      event.stopPropagation();

      const index = Number(thumb.dataset.index);
      const clickedModel = state.pages[index];
      if (!clickedModel) return;

      if (!state.selected.has(clickedModel.id)) {
        state.selected.clear();
        state.selected.add(clickedModel.id);
        state.anchorIndex = index;
        state.current = index;
        updateThumbSelection();
        updateStatus();
      }

      const selectedModels = state.pages.filter((p) => state.selected.has(p.id));
      if (!selectedModels.length) return;

      const res = await window.lalo.showThumbContextMenu(selectedModels.length);
      if (!res || !res.action) return;

      if (res.action === 'delete') {
        deletePages();
        return;
      }
      if (res.action === 'duplicate') {
        duplicatePages();
        return;
      }
      if (res.action === 'rotate-right') {
        rotatePages(90);
        return;
      }
      if (res.action === 'rotate-left') {
        rotatePages(-90);
        return;
      }
      if (res.action === 'insert-blank') {
        insertBlankPage();
        return;
      }

      if (res.action === 'export') {
        const defaultName = dragFileName(selectedModels);
        const picked = await window.lalo.pickExportSelection(defaultName);
        if (!picked || picked.canceled) return;
        if (picked.error) {
          showError('No se pudo exportar', new Error(picked.error));
          return;
        }
        setBusy(true);
        try {
          const bytes = await composeBytes(selectedModels);
          if (picked.ext === 'pdf') {
            const written = await window.lalo.savePdfInPlace(picked.path, bytes);
            if (!written || written.ok === false) {
              throw new Error(written?.error || 'No se pudo guardar el PDF');
            }
            toast(`PDF guardado: ${picked.name}`);
          } else {
            const ext = picked.ext === 'png' ? 'png' : 'jpg';
            const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
            const pdf = await pdfjsLib.getDocument({ data: bytes.slice() }).promise;
            try {
              const baseTarget = picked.path.replace(/\.(png|jpe?g)$/i, '');
              for (let i = 1; i <= pdf.numPages; i += 1) {
                const page = await pdf.getPage(i);
                const base = page.getViewport({ scale: 1 });
                const scale = Math.min(2, 2600 / Math.max(base.width, base.height));
                const viewport = page.getViewport({ scale });
                const canvas = document.createElement('canvas');
                canvas.width = Math.ceil(viewport.width);
                canvas.height = Math.ceil(viewport.height);
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                await page.render({ canvasContext: ctx, viewport }).promise;
                const blob = await new Promise((resolve) => canvas.toBlob(resolve, mime, 0.92));
                if (!blob) throw new Error('No se pudo generar la imagen');
                const imgBytes = new Uint8Array(await blob.arrayBuffer());
                const targetPath =
                  pdf.numPages === 1
                    ? picked.path
                    : `${baseTarget}-${String(i).padStart(2, '0')}.${ext}`;
                const written = await window.lalo.savePdfInPlace(targetPath, imgBytes);
                if (!written || written.ok === false) {
                  throw new Error(written?.error || 'No se pudo guardar la imagen');
                }
              }
              toast(
                pdf.numPages === 1
                  ? `Imagen guardada: ${picked.name}`
                  : `${pdf.numPages} imágenes exportadas`,
              );
            } finally {
              await pdf.destroy().catch(() => {});
            }
          }
        } catch (error) {
          showError('No se pudo exportar', error);
        } finally {
          setBusy(false);
        }
      }
    });

    const syncTextEditorPreview = () => {
      if (!el.textInput) return;
      const align = $('#text-align-select')?.value || 'left';
      const borderColor = $('#text-border-select')?.value || 'none';
      const borderWidth = Number($('.te-bw-btn.active')?.dataset.bw) || 2;
      const borderRadius = Number($('#text-border-radius')?.value) || 0;
      const bold = $('#te-bold')?.classList.contains('active');
      const italic = $('#te-italic')?.classList.contains('active');
      const underline = $('#te-underline')?.classList.contains('active');
      const strike = $('#te-strike')?.classList.contains('active');

      el.textInput.style.textAlign = align;
      el.textInput.style.fontWeight = bold ? 'bold' : 'normal';
      el.textInput.style.fontStyle = italic ? 'italic' : 'normal';
      const deco = [];
      if (underline) deco.push('underline');
      if (strike) deco.push('line-through');
      el.textInput.style.textDecoration = deco.length ? deco.join(' ') : 'none';
      if (borderColor && borderColor !== 'none') {
        el.textInput.style.border = `${borderWidth}px solid ${borderColor}`;
        el.textInput.style.borderRadius = `${borderRadius}px`;
      } else {
        el.textInput.style.border = '';
        el.textInput.style.borderRadius = '';
      }
    };

    $$('.te-fmt-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        btn.classList.toggle('active');
        syncTextEditorPreview();
      });
    });
    $$('.te-bw-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        $$('.te-bw-btn').forEach((b) => b.classList.toggle('active', b === btn));
        syncTextEditorPreview();
      });
    });
    $('#text-align-select')?.addEventListener('change', syncTextEditorPreview);
    $('#text-border-select')?.addEventListener('change', syncTextEditorPreview);
    $('#text-border-radius')?.addEventListener('change', syncTextEditorPreview);

    el.viewer.addEventListener('contextmenu', async (event) => {
      if (!state.markupOpen || !window.lalo?.showTextContextMenu) return;
      const overlay = event.target.closest('.page-overlay');
      if (!overlay) return;
      const pageId = overlay.dataset.pageId;
      const rect = overlay.getBoundingClientRect();
      const nx = clamp((event.clientX - rect.left) / rect.width, 0, 1);
      const ny = clamp((event.clientY - rect.top) / rect.height, 0, 1);
      const scale = overlay.__scale || 1;
      const hit = findAnnotationAt(pageId, nx, ny, rect.width, rect.height, scale);
      if (!hit || hit.type !== 'text') return;
      event.preventDefault();
      event.stopPropagation();
      state.selection = { pageId, id: hit.id };
      redrawPage(pageId);
      const res = await window.lalo.showTextContextMenu(hit);
      if (!res || !res.prop) return;
      pushHistory(false);
      hit[res.prop] = res.value;
      redrawPage(pageId);
      setDirty(true);
    });

    el.viewer.addEventListener('pointerdown', (event) => {
      if (!event.target.closest('.page-image-hit')) clearSelectedPdfImage();
    });
    el.viewer.addEventListener('scroll', () => {
      if (state.viewMode !== 'continuous') return;
      clearTimeout(state.scrollTimer);
      state.scrollTimer = setTimeout(updateCurrentFromScroll, 90);
    });

    // El proceso principal avisa cuando empieza un arrastre nativo de archivo.
    if (window.lalo?.onDragNative) {
      window.lalo.onDragNative((action, payload) => {
        if (action === 'started') {
          if (thumbPointer) finishThumbPointer(true);
        } else if (action === 'failed') {
          showError(
            'No se pudo arrastrar el PDF',
            new Error((payload && payload.error) || 'Error desconocido'),
          );
          if (thumbPointer) finishThumbPointer(true);
        }
      });
    }
    window.addEventListener('blur', () => {
      if (thumbPointer && !thumbPointer.native) finishThumbPointer(true);
    });

    let dragDepth = 0;
    window.addEventListener('dragenter', (event) => {
      const types = Array.from(event.dataTransfer?.types || []);
      if (!types.includes('Files')) return;
      event.preventDefault();
      dragDepth += 1;
      el.dropOverlay.hidden = false;
    });
    window.addEventListener('dragleave', () => {
      dragDepth = Math.max(0, dragDepth - 1);
      if (!dragDepth) el.dropOverlay.hidden = true;
    });
    window.addEventListener('dragover', (event) => {
      const types = Array.from(event.dataTransfer?.types || []);
      if (!types.includes('Files')) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    });
    window.addEventListener('drop', async (event) => {
      dragDepth = 0;
      el.dropOverlay.hidden = true;
      const files = Array.from(event.dataTransfer?.files || []);
      if (!files.length) return;
      event.preventDefault();
      await handleDroppedFiles(files);
    });

    window.addEventListener('keydown', (event) => {
      const target = event.target;
      const typing =
        target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA');
      if (event.key === 'Escape') {
        if (el.passwordModal && !el.passwordModal.hidden) {
          resolvePasswordPrompt(null);
          return;
        }
        if (el.protectModal && !el.protectModal.hidden) {
          el.protectModal.hidden = true;
          return;
        }
        if (!el.shortcutsModal.hidden) {
          el.shortcutsModal.hidden = true;
          return;
        }
        if (!el.textEditor.hidden) {
          cancelTextInput();
          return;
        }
        if (!el.searchPanel.hidden) {
          closeSearch();
          return;
        }
        if (state.textEdit) {
          cancelTextInput();
          return;
        }
        if (state.selection) {
          state.selection = null;
          updateToolbarState();
          redrawAllOverlays();
          return;
        }
        if (state.markupOpen) {
          toggleMarkup(false);
          return;
        }
      }
      if (typing) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (state.selection && (event.key === 'Delete' || event.key === 'Backspace')) {
        event.preventDefault();
        if (deleteSelection()) return;
      }
      if (state.selection && event.key.startsWith('Arrow')) {
        event.preventDefault();
        const step = event.shiftKey ? 0.01 : 0.002;
        if (event.key === 'ArrowRight') nudgeSelection(step, 0);
        else if (event.key === 'ArrowLeft') nudgeSelection(-step, 0);
        else if (event.key === 'ArrowUp') nudgeSelection(0, -step);
        else if (event.key === 'ArrowDown') nudgeSelection(0, step);
        return;
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        navigate(1);
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        navigate(-1);
      } else if (event.key === '+' || event.key === '=') {
        zoomIn();
      } else if (event.key === '-') {
        zoomOut();
      } else if (/^[1-9]$/.test(event.key) && state.markupOpen) {
        const tools = [
          'select',
          'highlight',
          'pen',
          'rect',
          'ellipse',
          'line',
          'arrow',
          'text',
          'eraser',
        ];
        setTool(tools[Number(event.key) - 1]);
      }
    });

    let resizeTimer = null;
    const resizeObserver = new ResizeObserver(() => {
      if (state.zoomMode !== 'fit' || !state.pdf) return;
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        const token = ++state.renderToken;
        renderViewer({
          token,
          preserveScroll: true,
          oldTop: el.viewer.scrollTop,
          oldHeight: el.viewer.scrollHeight,
        });
      }, 180);
    });
    resizeObserver.observe(el.viewerWrap);
  }

  function bindMenu() {
    if (!window.lalo?.onMenu) return;
    window.lalo.onMenu((action, payload) => {
      switch (action) {
        case 'open':
          openPdfDialog();
          break;
        case 'open-file':
          if (payload && payload.bytes) {
            (async () => {
              if (payload.path) {
                ensureActiveTab();
                const existing = docTabs.find((t) => t.filePath === payload.path);
                if (existing) {
                  await switchTab(existing.id);
                  return;
                }
              }
              if (state.pages.length > 0) {
                await createNewTab();
              }
              await openFiles([payload]);
            })().catch((err) => showError('No se pudo abrir el archivo', err));
          }
          break;
        case 'add-pdf':
          addPdfDialog();
          break;
        case 'add-images':
          addImagesDialog();
          break;
        case 'save':
          save();
          break;
        case 'save-as':
          saveAs();
          break;
        case 'save-and-quit':
          save().then(() => {
            if (!state.dirty) window.lalo?.confirmQuit?.();
          });
          break;
        case 'save-as-and-quit':
          saveAs().then(() => {
            if (!state.dirty) window.lalo?.confirmQuit?.();
          });
          break;
        case 'prompt-unsaved-close':
          if ($('#unsaved-modal')) $('#unsaved-modal').hidden = false;
          break;
        case 'export-images':
          exportImages();
          break;
        case 'export-word':
          exportWord();
          break;
        case 'split-pdf':
          openSplitModal();
          break;
        case 'compress-pdf':
          openCompressModal();
          break;
        case 'print':
          printPdf();
          break;
        case 'undo':
          undo();
          break;
        case 'redo':
          redo();
          break;
        case 'delete-pages':
          deletePages();
          break;
        case 'duplicate-pages':
          duplicatePages();
          break;
        case 'toggle-sidebar':
          toggleSidebar();
          break;
        case 'view-continuous':
          setViewMode('continuous');
          break;
        case 'view-single':
          setViewMode('single');
          break;
        case 'view-two':
          setViewMode('two');
          break;
        case 'zoom-in':
          zoomIn();
          break;
        case 'zoom-out':
          zoomOut();
          break;
        case 'zoom-reset':
          zoomReset();
          break;
        case 'fit-width':
          fitWidth();
          break;
        case 'presentation':
          togglePresentation();
          break;
        case 'rotate-right':
          rotatePages(90);
          break;
        case 'rotate-left':
          rotatePages(-90);
          break;
        case 'tool-select':
          setTool('select');
          break;
        case 'tool-highlight':
          setTool('highlight');
          break;
        case 'tool-pen':
          setTool('pen');
          break;
        case 'tool-rect':
          setTool('rect');
          break;
        case 'tool-ellipse':
          setTool('ellipse');
          break;
        case 'tool-line':
          setTool('line');
          break;
        case 'tool-arrow':
          setTool('arrow');
          break;
        case 'tool-text':
          setTool('text');
          break;
        case 'tool-eraser':
          setTool('eraser');
          break;
        case 'search':
          openSearch();
          break;
        case 'insert-blank':
          insertBlankPage();
          break;
        case 'signature':
          openSignatureModal();
          break;
        case 'watermark':
          openWatermarkModal();
          break;
        case 'page-numbers':
          openPageNumbersModal();
          break;
        case 'protect':
          openProtectModal();
          break;
        case 'shortcuts':
          el.shortcutsModal.hidden = false;
          break;
        case 'about':
          showAbout();
          break;
        default:
          break;
      }
    });
  }

  function openProtectModal() {
    if (!state.pages.length) {
      toast('Abre un PDF antes de configurar la protección');
      return;
    }
    const sec = state.security;
    el.protectUserPass.value = sec?.userPassword || '';
    el.protectOwnerPass.value = sec?.ownerPassword || '';
    el.protectPrinting.value = sec?.printing || 'highResolution';
    el.protectModifying.checked = sec ? !!sec.modifying : true;
    el.protectCopying.checked = sec ? !!sec.copying : true;
    el.protectAnnotating.checked = sec ? !!sec.annotating : true;
    el.protectError.hidden = true;
    el.protectClear.hidden = !sec;
    el.protectModal.hidden = false;
    setTimeout(() => el.protectUserPass.focus(), 20);
  }

  function applyProtectForm() {
    const userPassword = el.protectUserPass.value;
    const ownerPassword = el.protectOwnerPass.value;
    const printing = el.protectPrinting.value;
    const modifying = el.protectModifying.checked;
    const copying = el.protectCopying.checked;
    const annotating = el.protectAnnotating.checked;
    const hasRestrictions =
      printing !== 'highResolution' || !modifying || !copying || !annotating;

    if (!userPassword && !ownerPassword && !hasRestrictions) {
      el.protectError.textContent = 'Introduce una contraseña o restringe algún permiso.';
      el.protectError.hidden = false;
      return false;
    }

    state.security = {
      userPassword,
      ownerPassword,
      printing,
      modifying,
      copying,
      annotating,
    };
    setDirty(true);
    updateToolbarState();
    el.protectModal.hidden = true;
    return true;
  }

  function bindSecurityModals() {
    if (el.btnProtect) {
      el.btnProtect.addEventListener('click', openProtectModal);
    }
    if (el.passwordForm) {
      el.passwordForm.addEventListener('submit', (event) => {
        event.preventDefault();
        resolvePasswordPrompt(el.passwordInput.value);
      });
      $('#password-cancel').addEventListener('click', () => resolvePasswordPrompt(null));
      $('#password-close').addEventListener('click', () => resolvePasswordPrompt(null));
      el.passwordModal.addEventListener('click', (event) => {
        if (event.target === el.passwordModal) resolvePasswordPrompt(null);
      });
    }
    if (el.protectForm) {
      el.protectForm.addEventListener('submit', (event) => {
        event.preventDefault();
        if (applyProtectForm()) toast('Protección aplicada (se guardará en el PDF)');
      });
      $('#protect-save-as').addEventListener('click', async () => {
        if (applyProtectForm()) await saveAs();
      });
      el.protectClear.addEventListener('click', () => {
        state.security = null;
        setDirty(true);
        updateToolbarState();
        el.protectModal.hidden = true;
        toast('Protección eliminada');
      });
      $('#protect-cancel').addEventListener('click', () => {
        el.protectModal.hidden = true;
      });
      $('#protect-close').addEventListener('click', () => {
        el.protectModal.hidden = true;
      });
      el.protectModal.addEventListener('click', (event) => {
        if (event.target === el.protectModal) el.protectModal.hidden = true;
      });
    }
  }

  const SIG_STORAGE_KEY = 'lalo-pdf-signatures';
  let sigMode = 'draw';
  let sigHasInk = false;

  function loadSavedSignatures() {
    try {
      const raw = localStorage.getItem(SIG_STORAGE_KEY);
      const list = JSON.parse(raw || '[]');
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  }

  function saveSignaturesList(list) {
    try {
      localStorage.setItem(SIG_STORAGE_KEY, JSON.stringify(list.slice(0, 12)));
    } catch {
      /* ignore */
    }
  }

  function renderSavedSignatures() {
    const wrap = $('#sig-saved-wrap');
    const listEl = $('#sig-saved-list');
    if (!wrap || !listEl) return;
    const list = loadSavedSignatures();
    wrap.hidden = !list.length;
    listEl.innerHTML = '';
    list.forEach((dataUrl, idx) => {
      const item = document.createElement('div');
      item.className = 'sig-saved-item';
      const img = document.createElement('img');
      img.src = dataUrl;
      img.alt = `Firma ${idx + 1}`;
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'sig-saved-del';
      del.textContent = '×';
      del.title = 'Eliminar firma';
      del.addEventListener('click', (e) => {
        e.stopPropagation();
        const next = loadSavedSignatures().filter((_, i) => i !== idx);
        saveSignaturesList(next);
        renderSavedSignatures();
      });
      item.addEventListener('click', () => {
        placeSignatureDataUrl(dataUrl);
        $('#signature-modal').hidden = true;
      });
      item.append(img, del);
      listEl.append(item);
    });
  }

  function getSignatureDataUrl() {
    if (sigMode === 'draw') {
      const canvas = $('#signature-canvas');
      if (!canvas || !sigHasInk) return null;
      return canvas.toDataURL('image/png');
    }
    const text = ($('#signature-text')?.value || '').trim();
    if (!text) return null;
    const c = document.createElement('canvas');
    c.width = 420;
    c.height = 140;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#111111';
    ctx.font = 'italic 54px "Segoe Script", "Brush Script MT", "Apple Chancery", cursive';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, c.width / 2, c.height / 2, c.width - 24);
    return c.toDataURL('image/png');
  }

  function placeSignatureDataUrl(dataUrl) {
    if (!state.pages.length || !dataUrl) return;
    const model = state.pages[state.current] || state.pages[0];
    if (!model) return;
    pushHistory(false);
    const ann = {
      id: uid('ann'),
      type: 'signature',
      x: 0.32,
      y: 0.4,
      w: 0.34,
      h: 0.12,
      dataUrl,
      opacity: 1,
    };
    const list = state.annotations.get(model.id) || [];
    list.push(ann);
    state.annotations.set(model.id, list);
    state.selection = { pageId: model.id, id: ann.id };
    state.markupOpen = true;
    state.tool = 'select';
    updateToolbarState();
    redrawPage(model.id);
    setDirty(true);
  }

  function openSignatureModal() {
    if (!state.pages.length) {
      toast('Abre un PDF antes de añadir una firma');
      return;
    }
    const canvas = $('#signature-canvas');
    if (canvas) {
      canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
      sigHasInk = false;
    }
    const input = $('#signature-text');
    if (input) input.value = '';
    const prev = $('#signature-type-preview');
    if (prev) prev.textContent = 'Tu firma';
    renderSavedSignatures();
    $('#signature-modal').hidden = false;
  }

  function bindSignatureModal() {
    const modal = $('#signature-modal');
    const canvas = $('#signature-canvas');
    if (!modal || !canvas) return;
    const ctx = canvas.getContext('2d');
    let drawing = false;

    const pt = (e) => {
      const r = canvas.getBoundingClientRect();
      return {
        x: ((e.clientX - r.left) / r.width) * canvas.width,
        y: ((e.clientY - r.top) / r.height) * canvas.height,
      };
    };

    canvas.addEventListener('pointerdown', (e) => {
      drawing = true;
      sigHasInk = true;
      canvas.setPointerCapture(e.pointerId);
      const p = pt(e);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#111111';
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!drawing) return;
      const p = pt(e);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    });
    const stop = () => {
      drawing = false;
    };
    canvas.addEventListener('pointerup', stop);
    canvas.addEventListener('pointercancel', stop);

    $('#signature-clear').addEventListener('click', () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      sigHasInk = false;
    });

    $$('.sig-tab', modal).forEach((tab) => {
      tab.addEventListener('click', () => {
        sigMode = tab.dataset.sigTab;
        $$('.sig-tab', modal).forEach((t) => t.classList.toggle('active', t === tab));
        $('#sig-panel-draw').hidden = sigMode !== 'draw';
        $('#sig-panel-type').hidden = sigMode !== 'type';
      });
    });

    $('#signature-text').addEventListener('input', (e) => {
      $('#signature-type-preview').textContent = e.target.value.trim() || 'Tu firma';
    });

    $('#btn-signature')?.addEventListener('click', openSignatureModal);
    $('#signature-close').addEventListener('click', () => { modal.hidden = true; });
    $('#signature-cancel').addEventListener('click', () => { modal.hidden = true; });
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.hidden = true; });

    $('#signature-save-local').addEventListener('click', async () => {
      const url = getSignatureDataUrl();
      if (!url) {
        toast('Dibuja o escribe una firma primero');
        return;
      }
      const list = loadSavedSignatures();
      list.unshift(url);
      saveSignaturesList(list);
      renderSavedSignatures();

      if (window.lalo?.saveSignature) {
        try {
          const base64 = url.split(',')[1];
          const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
          const res = await window.lalo.saveSignature(bytes, 'firma.png');
          if (res && !res.canceled && !res.error) {
            toast(`Firma guardada: ${res.name}`);
            return;
          }
          if (res?.error) throw new Error(res.error);
        } catch (error) {
          showError('No se pudo guardar la firma', error);
          return;
        }
      }
      toast('Firma guardada');
    });

    $('#signature-place').addEventListener('click', () => {
      const url = getSignatureDataUrl();
      if (!url) {
        toast('Dibuja o escribe una firma primero');
        return;
      }
      modal.hidden = true;
      placeSignatureDataUrl(url);
    });

    $('#signature-opacity')?.addEventListener('input', (e) => {
      const sel = getSelectedAnnotation();
      if (!sel || sel.type !== 'signature') return;
      sel.opacity = clamp(Number(e.target.value) / 100, 0.15, 1);
      redrawPage(state.selection.pageId);
      setDirty(true);
    });
  }

  let wmMode = 'text';
  let wmImageData = null;
  let wmImageType = 'png';
  let wmBackup = null;

  function syncWatermarkFromModal() {
    if (wmMode === 'image') {
      if (!wmImageData) return;
      state.watermark = {
        kind: 'image',
        dataUrl: wmImageData,
        imageType: wmImageType,
        size: Number($('#wm-size').value) || 54,
        rotation: Number($('#wm-rotation').value) || 0,
        opacity: clamp(Number($('#wm-opacity').value) / 100, 0.05, 1),
      };
    } else {
      const text = $('#wm-text').value.trim();
      if (!text) {
        state.watermark = null;
      } else {
        state.watermark = {
          kind: 'text',
          text,
          color: $('#wm-color').value,
          size: Number($('#wm-size').value) || 54,
          rotation: Number($('#wm-rotation').value) || 0,
          opacity: clamp(Number($('#wm-opacity').value) / 100, 0.05, 1),
        };
      }
    }
    redrawAllOverlays();
  }

  function openWatermarkModal() {
    if (!state.pages.length) {
      toast('Abre un PDF antes de añadir una marca de agua');
      return;
    }
    const wm = state.watermark;
    wmBackup = wm ? { ...wm } : null;
    wmMode = wm?.kind === 'image' ? 'image' : 'text';
    wmImageData = wm?.kind === 'image' ? wm.dataUrl : null;
    wmImageType = wm?.imageType || 'png';

    $$('[data-wm-tab]').forEach((t) => t.classList.toggle('active', t.dataset.wmTab === wmMode));
    $('#wm-panel-text').hidden = wmMode !== 'text';
    $('#wm-panel-image').hidden = wmMode !== 'image';

    $('#wm-text').value = wm?.text || 'CONFIDENCIAL';
    $('#wm-color').value = wm?.color || '#2c2c2e';
    $('#wm-size').value = String(wm?.size || 54);
    $('#wm-size-val').textContent = $('#wm-size').value;
    $('#wm-rotation').value = String(wm?.rotation ?? -35);
    $('#wm-rot-val').textContent = $('#wm-rotation').value;
    $('#wm-opacity').value = String(Math.round((wm?.opacity ?? 0.22) * 100));
    $('#wm-op-val').textContent = $('#wm-opacity').value;
    $('#wm-clear').hidden = !wm;
    $('#watermark-modal').hidden = false;
    syncWatermarkFromModal();
    if (wmMode === 'text') setTimeout(() => $('#wm-text').select(), 20);
  }

  function bindWatermarkModal() {
    const modal = $('#watermark-modal');
    const form = $('#watermark-form');
    if (!modal || !form) return;

    const cancelModal = () => {
      state.watermark = wmBackup;
      modal.hidden = true;
      redrawAllOverlays();
    };

    $$('[data-wm-tab]', modal).forEach((tab) => {
      tab.addEventListener('click', () => {
        wmMode = tab.dataset.wmTab;
        $$('[data-wm-tab]', modal).forEach((t) => t.classList.toggle('active', t === tab));
        $('#wm-panel-text').hidden = wmMode !== 'text';
        $('#wm-panel-image').hidden = wmMode !== 'image';
        syncWatermarkFromModal();
      });
    });

    $('#wm-image-file').addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      wmImageType = /\.png$/i.test(file.name) ? 'png' : 'jpg';
      const reader = new FileReader();
      reader.onload = () => {
        wmImageData = String(reader.result || '');
        syncWatermarkFromModal();
      };
      reader.readAsDataURL(file);
    });

    $('#wm-text').addEventListener('input', syncWatermarkFromModal);
    $('#wm-color').addEventListener('change', syncWatermarkFromModal);
    $('#wm-size').addEventListener('input', (e) => {
      $('#wm-size-val').textContent = e.target.value;
      syncWatermarkFromModal();
    });
    $('#wm-rotation').addEventListener('input', (e) => {
      $('#wm-rot-val').textContent = e.target.value;
      syncWatermarkFromModal();
    });
    $('#wm-opacity').addEventListener('input', (e) => {
      $('#wm-op-val').textContent = e.target.value;
      syncWatermarkFromModal();
    });

    $('#btn-watermark')?.addEventListener('click', openWatermarkModal);
    $('#wm-close').addEventListener('click', cancelModal);
    $('#wm-cancel').addEventListener('click', cancelModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) cancelModal(); });

    $('#wm-clear').addEventListener('click', () => {
      state.watermark = null;
      modal.hidden = true;
      redrawAllOverlays();
      setDirty(true);
      toast('Marca de agua eliminada');
    });

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (wmMode === 'image' && !wmImageData) {
        toast('Selecciona una imagen primero');
        return;
      }
      if (wmMode === 'text' && !$('#wm-text').value.trim()) {
        toast('Escribe un texto para la marca de agua');
        return;
      }
      syncWatermarkFromModal();
      modal.hidden = true;
      setDirty(true);
      toast('Marca de agua aplicada');
    });
  }

  let presBackup = null;

  function updatePresentationHud() {
    const hud = $('#presentation-hud');
    const lbl = $('#pres-page');
    if (hud && lbl) {
      lbl.textContent = `${state.current + 1} / ${state.pages.length}`;
    }
  }

  async function enterPresentation() {
    if (!state.pages.length) {
      toast('Abre un PDF antes de iniciar la presentación');
      return;
    }
    if (document.body.classList.contains('presentation-mode')) return;
    presBackup = {
      viewMode: state.viewMode,
      zoomMode: state.zoomMode,
      markupOpen: state.markupOpen,
    };
    state.markupOpen = false;
    state.viewMode = 'single';
    state.zoomMode = 'fit';
    document.body.classList.add('presentation-mode');
    if ($('#presentation-hud')) $('#presentation-hud').hidden = false;
    updatePresentationHud();
    try {
      await document.documentElement.requestFullscreen?.();
    } catch {
      /* ignore if fullscreen blocked */
    }
    await refresh({ preserveScroll: false, scrollToCurrent: false });
  }

  async function exitPresentation() {
    if (!document.body.classList.contains('presentation-mode')) return;
    document.body.classList.remove('presentation-mode');
    if ($('#presentation-hud')) $('#presentation-hud').hidden = true;
    if (document.fullscreenElement) {
      try {
        await document.exitFullscreen?.();
      } catch {
        /* ignore */
      }
    }
    if (presBackup) {
      state.viewMode = presBackup.viewMode;
      state.zoomMode = presBackup.zoomMode;
      state.markupOpen = presBackup.markupOpen;
      presBackup = null;
    }
    updateToolbarState();
    await refresh({ preserveScroll: false, scrollToCurrent: false });
  }

  function togglePresentation() {
    if (document.body.classList.contains('presentation-mode')) exitPresentation();
    else enterPresentation();
  }

  function openPageNumbersModal() {
    if (!state.pages.length) {
      toast('Abre un PDF antes de añadir números de página');
      return;
    }
    const total = state.pages.length;
    const pn = state.pageNumbers;
    $('#pn-from').max = String(total);
    $('#pn-to').max = String(total);
    $('#pn-from').value = String(pn?.from || 1);
    $('#pn-to').value = String(pn?.to || total);
    $('#pn-start').value = String(pn?.start || 1);
    $('#pn-vpos').value = pn?.vpos || 'bottom';
    $('#pn-hpos').value = pn?.hpos || 'center';
    $('#pn-format').value = pn?.format || 'n';
    $('#pn-size').value = String(pn?.size || 11);
    $('#pn-clear').hidden = !pn;
    $('#pagenum-modal').hidden = false;
  }

  function bindPageNumbersModal() {
    const modal = $('#pagenum-modal');
    const form = $('#pagenum-form');
    if (!modal || !form) return;

    $('#btn-page-numbers')?.addEventListener('click', openPageNumbersModal);
    $('#pn-close')?.addEventListener('click', () => { modal.hidden = true; });
    $('#pn-cancel')?.addEventListener('click', () => { modal.hidden = true; });
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.hidden = true; });

    $('#pn-clear')?.addEventListener('click', () => {
      state.pageNumbers = null;
      modal.hidden = true;
      redrawAllOverlays();
      setDirty(true);
      toast('Números de página eliminados');
    });

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const total = state.pages.length;
      const from = clamp(Number.parseInt($('#pn-from').value, 10) || 1, 1, total);
      const to = clamp(Number.parseInt($('#pn-to').value, 10) || total, from, total);
      const start = Math.max(1, Number.parseInt($('#pn-start').value, 10) || 1);
      const size = clamp(Number.parseInt($('#pn-size').value, 10) || 11, 8, 24);
      state.pageNumbers = {
        from,
        to,
        start,
        vpos: $('#pn-vpos').value,
        hpos: $('#pn-hpos').value,
        format: $('#pn-format').value,
        size,
      };
      modal.hidden = true;
      redrawAllOverlays();
      setDirty(true);
      toast('Números de página aplicados');
    });
  }

  let splitMode = 'each';

  function parseSplitRanges(raw, total) {
    const parts = String(raw || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (!parts.length) return null;
    const ranges = [];
    for (const part of parts) {
      const m = part.match(/^(\d+)(?:\s*-\s*(\d+))?$/);
      if (!m) return null;
      const a = Number.parseInt(m[1], 10);
      const b = m[2] ? Number.parseInt(m[2], 10) : a;
      if (a < 1 || b > total || a > b) return null;
      ranges.push([a - 1, b - 1]);
    }
    return ranges;
  }

  function openSplitModal() {
    if (!state.pages.length) {
      toast('Abre un PDF antes de dividir');
      return;
    }
    splitMode = 'each';
    const modal = $('#split-modal');
    $$('[data-split-mode]', modal).forEach((t) =>
      t.classList.toggle('active', t.dataset.splitMode === 'each'),
    );
    $('#split-desc').textContent = `Generará ${state.pages.length} archivo${state.pages.length === 1 ? '' : 's'} PDF (uno por página).`;
    $('#split-ranges-wrap').hidden = true;
    $('#split-ranges').value = `1-${state.pages.length}`;
    $('#split-error').hidden = true;
    modal.hidden = false;
  }

  function bindSplitModal() {
    $('#btn-split-pdf')?.addEventListener('click', openSplitModal);
    const modal = $('#split-modal');
    const form = $('#split-form');
    if (!modal || !form) return;

    $$('[data-split-mode]', modal).forEach((tab) => {
      tab.addEventListener('click', () => {
        splitMode = tab.dataset.splitMode;
        $$('[data-split-mode]', modal).forEach((t) => t.classList.toggle('active', t === tab));
        $('#split-ranges-wrap').hidden = splitMode !== 'ranges';
        $('#split-desc').textContent =
          splitMode === 'each'
            ? `Generará ${state.pages.length} archivo${state.pages.length === 1 ? '' : 's'} PDF (uno por página).`
            : 'Generará un archivo PDF por cada rango indicado.';
        $('#split-error').hidden = true;
      });
    });

    $('#split-close')?.addEventListener('click', () => { modal.hidden = true; });
    $('#split-cancel')?.addEventListener('click', () => { modal.hidden = true; });
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.hidden = true; });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!window.lalo?.splitPdf) {
        toast('Dividir PDF solo está disponible en la app de escritorio');
        return;
      }
      const total = state.pages.length;
      let chunks = [];
      if (splitMode === 'each') {
        chunks = state.pages.map((p, idx) => ({
          label: `p${String(idx + 1).padStart(2, '0')}`,
          models: [p],
        }));
      } else {
        const ranges = parseSplitRanges($('#split-ranges').value, total);
        if (!ranges) {
          $('#split-error').textContent = `Rangos no válidos. Usa números entre 1 y ${total} (ej. 1-3, 4-${total}).`;
          $('#split-error').hidden = false;
          return;
        }
        chunks = ranges.map(([a, b]) => ({
          label: a === b ? `p${a + 1}` : `p${a + 1}-${b + 1}`,
          models: state.pages.slice(a, b + 1),
        }));
      }

      modal.hidden = true;
      setBusy(true);
      try {
        const stem = baseName(state.fileName || 'Documento');
        const files = [];
        for (const chunk of chunks) {
          const bytes = await composeBytes(chunk.models);
          files.push({ name: `${stem}-${chunk.label}.pdf`, bytes });
        }
        const res = await window.lalo.splitPdf(files, folderOf(state.filePath));
        if (!res || res.canceled) return;
        if (res.error) throw new Error(res.error);
        toast(`${files.length} PDFs guardados en ${res.folder}`);
      } catch (error) {
        showError('No se pudo dividir el PDF', error);
      } finally {
        setBusy(false);
      }
    });
  }

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes < 0) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  function getImageFilterName(dict) {
    const filter = dict.get(PDFName.of('Filter'));
    if (filter instanceof PDFName) return filter.asString();
    if (filter instanceof PDFArray && filter.size() === 1) {
      const first = filter.get(0);
      if (first instanceof PDFName) return first.asString();
    }
    return null;
  }

  async function canvasToJpegBytes(canvas, quality) {
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!blob) return null;
    return new Uint8Array(await blob.arrayBuffer());
  }

  async function recompressPdfImages(
    doc,
    { quality = 0.75, maxDim = 1200, grayscale = false } = {},
  ) {
    let totalImages = 0;
    let recompressed = 0;

    for (const [ref, obj] of doc.context.enumerateIndirectObjects()) {
      if (!(obj instanceof PDFRawStream)) continue;
      const dict = obj.dict;
      if (!(dict instanceof PDFDict)) continue;
      if (dict.get(PDFName.of('Subtype')) !== PDFName.of('Image')) continue;
      const imageMask = dict.get(PDFName.of('ImageMask'));
      if (imageMask && String(imageMask) === 'true') continue;

      const filterName = getImageFilterName(dict);
      if (filterName !== '/DCTDecode' && filterName !== '/FlateDecode') continue;

      const hasMask = Boolean(dict.get(PDFName.of('SMask')) || dict.get(PDFName.of('Mask')));
      totalImages += 1;

      try {
        let srcCanvas = null;
        let width = 0;
        let height = 0;

        if (filterName === '/DCTDecode') {
          const blob = new Blob([obj.contents], { type: 'image/jpeg' });
          const bmp = await createImageBitmap(blob);
          width = bmp.width;
          height = bmp.height;
          const allowResize = !hasMask && maxDim > 0 && (width > maxDim || height > maxDim);
          const scale = allowResize ? maxDim / Math.max(width, height) : 1;
          const targetW = Math.max(1, Math.round(width * scale));
          const targetH = Math.max(1, Math.round(height * scale));
          srcCanvas = document.createElement('canvas');
          srcCanvas.width = targetW;
          srcCanvas.height = targetH;
          const ctx = srcCanvas.getContext('2d');
          if (grayscale) ctx.filter = 'grayscale(100%)';
          ctx.drawImage(bmp, 0, 0, targetW, targetH);
          bmp.close();
          width = targetW;
          height = targetH;
        } else {
          const wObj = dict.get(PDFName.of('Width'));
          const hObj = dict.get(PDFName.of('Height'));
          const bpcObj = dict.get(PDFName.of('BitsPerComponent'));
          const csObj = dict.get(PDFName.of('ColorSpace'));
          const w = wObj instanceof PDFNumber ? wObj.asNumber() : 0;
          const h = hObj instanceof PDFNumber ? hObj.asNumber() : 0;
          const bpc = bpcObj instanceof PDFNumber ? bpcObj.asNumber() : 8;
          const cs = csObj instanceof PDFName ? csObj.asString() : '';
          if (!w || !h || bpc !== 8) continue;
          if (cs !== '/DeviceRGB' && cs !== '/DeviceGray') continue;

          const decoded = decodePDFRawStream(obj).decode();
          const channels = cs === '/DeviceRGB' ? 3 : 1;
          if (decoded.length !== w * h * channels) continue;

          const rawCanvas = document.createElement('canvas');
          rawCanvas.width = w;
          rawCanvas.height = h;
          const rawCtx = rawCanvas.getContext('2d');
          const imgData = rawCtx.createImageData(w, h);
          const rgba = imgData.data;
          if (channels === 3) {
            for (let i = 0, j = 0; i < decoded.length; i += 3, j += 4) {
              rgba[j] = decoded[i];
              rgba[j + 1] = decoded[i + 1];
              rgba[j + 2] = decoded[i + 2];
              rgba[j + 3] = 255;
            }
          } else {
            for (let i = 0, j = 0; i < decoded.length; i += 1, j += 4) {
              const v = decoded[i];
              rgba[j] = v;
              rgba[j + 1] = v;
              rgba[j + 2] = v;
              rgba[j + 3] = 255;
            }
          }
          rawCtx.putImageData(imgData, 0, 0);

          const allowResize = !hasMask && maxDim > 0 && (w > maxDim || h > maxDim);
          const scale = allowResize ? maxDim / Math.max(w, h) : 1;
          width = Math.max(1, Math.round(w * scale));
          height = Math.max(1, Math.round(h * scale));
          if (width !== w || height !== h || grayscale) {
            srcCanvas = document.createElement('canvas');
            srcCanvas.width = width;
            srcCanvas.height = height;
            const sctx = srcCanvas.getContext('2d');
            if (grayscale) sctx.filter = 'grayscale(100%)';
            sctx.drawImage(rawCanvas, 0, 0, width, height);
          } else {
            srcCanvas = rawCanvas;
          }
        }

        const jpegBytes = await canvasToJpegBytes(srcCanvas, quality);
        if (!jpegBytes || (!grayscale && jpegBytes.length >= obj.contents.length)) continue;

        const newDict = dict.clone(doc.context);
        newDict.set(PDFName.of('Width'), PDFNumber.of(width));
        newDict.set(PDFName.of('Height'), PDFNumber.of(height));
        newDict.set(PDFName.of('ColorSpace'), PDFName.of('DeviceRGB'));
        newDict.set(PDFName.of('BitsPerComponent'), PDFNumber.of(8));
        newDict.set(PDFName.of('Filter'), PDFName.of('DCTDecode'));
        newDict.delete(PDFName.of('DecodeParms'));
        newDict.delete(PDFName.of('Decode'));
        newDict.set(PDFName.of('Length'), PDFNumber.of(jpegBytes.length));
        doc.context.assign(ref, PDFRawStream.of(newDict, jpegBytes));
        recompressed += 1;
      } catch {
        /* skip unsupported image stream */
      }
    }

    return { totalImages, recompressed };
  }

  function stripPdfMetadata(doc) {
    try {
      doc.setTitle('');
      doc.setAuthor('');
      doc.setSubject('');
      doc.setKeywords([]);
      doc.setProducer('');
      doc.setCreator('');
      doc.catalog.delete(PDFName.of('Metadata'));
      doc.catalog.delete(PDFName.of('PieceInfo'));
      doc.catalog.delete(PDFName.of('MarkInfo'));
      doc.catalog.delete(PDFName.of('StructTreeRoot'));
      for (const page of doc.getPages()) {
        page.node.delete(PDFName.of('Thumb'));
        page.node.delete(PDFName.of('PieceInfo'));
        page.node.delete(PDFName.of('Metadata'));
      }
      if (doc.context?.trailerInfo?.Info) {
        delete doc.context.trailerInfo.Info;
      }
    } catch {
      /* ignore metadata cleanup errors */
    }
  }

  function getCompressOptions() {
    return {
      quality: Number($('#compress-quality').value) / 100,
      maxDim: Number($('#compress-max-dim').value),
      stripMetadata: Boolean($('#compress-opt-metadata')?.checked),
      flattenForms: Boolean($('#compress-opt-flatten')?.checked),
      optimizeStructure: Boolean($('#compress-opt-structure')?.checked),
      grayscale: Boolean($('#compress-opt-grayscale')?.checked),
      rasterize: Boolean($('#compress-opt-rasterize')?.checked),
    };
  }

  async function rasterizePdfBytes(sourceBytes, opts, tokenCheck) {
    const pdf = await pdfjsLib.getDocument({ data: sourceBytes.slice() }).promise;
    try {
      const outDoc = await PDFDocument.create();
      for (let i = 1; i <= pdf.numPages; i += 1) {
        if (tokenCheck && !tokenCheck()) return null;
        const page = await pdf.getPage(i);
        const vp1 = page.getViewport({ scale: 1 });
        const renderScale =
          opts.maxDim > 0
            ? Math.min(2.5, opts.maxDim / Math.max(vp1.width, vp1.height))
            : 2.0;
        const viewport = page.getViewport({ scale: Math.max(0.5, renderScale) });
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(viewport.width));
        canvas.height = Math.max(1, Math.round(viewport.height));
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport }).promise;

        let outCanvas = canvas;
        if (opts.grayscale) {
          outCanvas = document.createElement('canvas');
          outCanvas.width = canvas.width;
          outCanvas.height = canvas.height;
          const octx = outCanvas.getContext('2d');
          octx.filter = 'grayscale(100%)';
          octx.drawImage(canvas, 0, 0);
        }

        const jpgBytes = await canvasToJpegBytes(outCanvas, opts.quality);
        const jpgImg = await outDoc.embedJpg(jpgBytes);
        const outPage = outDoc.addPage([vp1.width, vp1.height]);
        outPage.drawImage(jpgImg, { x: 0, y: 0, width: vp1.width, height: vp1.height });
      }
      if (opts.stripMetadata) {
        stripPdfMetadata(outDoc);
      }
      const afterBytes = await outDoc.save({ useObjectStreams: opts.optimizeStructure });
      return { afterBytes, pageCount: pdf.numPages };
    } finally {
      pdf.destroy();
    }
  }

  let compressPreviewToken = 0;
  let lastCompressResult = null;

  async function runCompressPreview() {
    const token = ++compressPreviewToken;
    const opts = getCompressOptions();
    const beforeEl = $('#compress-before');
    const afterEl = $('#compress-after');
    const metaEl = $('#compress-meta');
    const errEl = $('#compress-error');

    errEl.hidden = true;
    afterEl.textContent = 'Calculando…';
    afterEl.classList.remove('compress-saved');
    metaEl.textContent = '';

    try {
      const doc = await buildDocument(state.pages);
      const beforeBytes = state.workingBytes
        ? state.workingBytes
        : await doc.save({ useObjectStreams: false });
      if (token !== compressPreviewToken) return null;

      beforeEl.textContent = formatBytes(beforeBytes.length);

      let afterBytes = null;
      let metaText = '';
      let stats = { totalImages: 0, recompressed: 0 };

      if (opts.rasterize) {
        const rast = await rasterizePdfBytes(
          beforeBytes,
          opts,
          () => token === compressPreviewToken,
        );
        if (!rast || token !== compressPreviewToken) return null;
        afterBytes = rast.afterBytes;
        metaText = `${rast.pageCount} página${rast.pageCount === 1 ? '' : 's'} rasterizada${rast.pageCount === 1 ? '' : 's'} como imagen.`;
      } else {
        if (opts.flattenForms) {
          try {
            doc.getForm().flatten();
          } catch {
            /* ignore if no form fields */
          }
        }
        stats = await recompressPdfImages(doc, opts);
        if (opts.stripMetadata) {
          stripPdfMetadata(doc);
        }
        afterBytes = await doc.save({ useObjectStreams: opts.optimizeStructure });
        if (token !== compressPreviewToken) return null;
        metaText =
          stats.totalImages > 0
            ? `${stats.recompressed} de ${stats.totalImages} imágenes recomprimidas.`
            : 'No se detectaron imágenes recomprimibles en el documento.';
      }

      const diff = beforeBytes.length - afterBytes.length;
      const pct = beforeBytes.length > 0 ? (diff / beforeBytes.length) * 100 : 0;
      if (diff > 0) {
        afterEl.textContent = `${formatBytes(afterBytes.length)} (-${pct.toFixed(1)}%)`;
        afterEl.classList.add('compress-saved');
      } else {
        afterEl.textContent = `${formatBytes(afterBytes.length)} (sin reducción)`;
      }
      metaEl.textContent = metaText;

      lastCompressResult = {
        key: JSON.stringify(opts),
        beforeSize: beforeBytes.length,
        afterBytes,
        stats,
      };
      return lastCompressResult;
    } catch (error) {
      if (token !== compressPreviewToken) return null;
      errEl.textContent = error.message || 'No se pudo calcular la compresión.';
      errEl.hidden = false;
      afterEl.textContent = '—';
      return null;
    }
  }

  function openCompressModal() {
    if (!state.pages.length) {
      toast('Abre un PDF antes de comprimir');
      return;
    }
    lastCompressResult = null;
    $('#compress-quality-label').textContent = `${$('#compress-quality').value}%`;
    const pop = $('#compress-help-popover');
    if (pop) pop.hidden = true;
    $$('.help-dot.active', $('#compress-modal')).forEach((b) => b.classList.remove('active'));
    $('#compress-modal').hidden = false;
    runCompressPreview();
  }

  let cropPreviewImage = null;

  async function renderCropPreview() {
    const canvas = $('#crop-preview');
    if (!canvas || !state.pages.length) return;
    const ctx = canvas.getContext('2d');
    const model = state.pages[state.current] || state.pages[0];
    if (!cropPreviewImage) {
      try {
        const page = await loadPdfJsPage(model);
        const vp = page.getViewport({ scale: 0.4 });
        const off = document.createElement('canvas');
        off.width = Math.max(1, Math.round(vp.width));
        off.height = Math.max(1, Math.round(vp.height));
        await page.render({ canvasContext: off.getContext('2d'), viewport: vp }).promise;
        cropPreviewImage = off;
      } catch {
        cropPreviewImage = null;
      }
    }
    const pageW = model.width || 595.28;
    const pageH = model.height || 841.89;
    const maxW = 180;
    const maxH = 210;
    const scale = Math.min(maxW / pageW, maxH / pageH);
    canvas.width = Math.max(40, Math.round(pageW * scale));
    canvas.height = Math.max(40, Math.round(pageH * scale));
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (cropPreviewImage) {
      ctx.drawImage(cropPreviewImage, 0, 0, canvas.width, canvas.height);
    }

    const mmToPt = 72 / 25.4;
    const topPt = Math.max(0, Number($('#crop-top')?.value) || 0) * mmToPt;
    const bottomPt = Math.max(0, Number($('#crop-bottom')?.value) || 0) * mmToPt;
    const leftPt = Math.max(0, Number($('#crop-left')?.value) || 0) * mmToPt;
    const rightPt = Math.max(0, Number($('#crop-right')?.value) || 0) * mmToPt;

    const x = Math.min(canvas.width - 10, leftPt * scale);
    const y = Math.min(canvas.height - 10, topPt * scale);
    const w = Math.max(8, canvas.width - (leftPt + rightPt) * scale);
    const h = Math.max(8, canvas.height - (topPt + bottomPt) * scale);

    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.fillRect(0, 0, canvas.width, y);
    ctx.fillRect(0, y + h, canvas.width, canvas.height - (y + h));
    ctx.fillRect(0, y, x, h);
    ctx.fillRect(x + w, y, canvas.width - (x + w), h);

    ctx.strokeStyle = '#ff3b30';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(x + 0.5, y + 0.5, Math.max(1, w - 1), Math.max(1, h - 1));
    ctx.setLineDash([]);
  }

  function openCropModal() {
    if (!state.pages.length) {
      toast('Abre un PDF antes de recortar');
      return;
    }
    cropPreviewImage = null;
    $('#crop-top').value = '0';
    $('#crop-bottom').value = '0';
    $('#crop-left').value = '0';
    $('#crop-right').value = '0';
    $('#crop-normalize-a4').checked = false;
    const scopeSel = $('#crop-scope');
    if (scopeSel) {
      scopeSel.value = state.selected.size > 0 ? 'selected' : 'all';
    }
    $('#crop-modal').hidden = false;
    renderCropPreview();
  }

  async function applyCropAndNormalize() {
    if (!state.pages.length) return;
    const mmToPt = 72 / 25.4;
    const topPt = Math.max(0, Number($('#crop-top')?.value) || 0) * mmToPt;
    const bottomPt = Math.max(0, Number($('#crop-bottom')?.value) || 0) * mmToPt;
    const leftPt = Math.max(0, Number($('#crop-left')?.value) || 0) * mmToPt;
    const rightPt = Math.max(0, Number($('#crop-right')?.value) || 0) * mmToPt;
    const normalizeA4 = Boolean($('#crop-normalize-a4')?.checked);
    const scope = $('#crop-scope')?.value || 'all';

    if (topPt === 0 && bottomPt === 0 && leftPt === 0 && rightPt === 0 && !normalizeA4) {
      $('#crop-modal').hidden = true;
      return;
    }

    const targetIndices = new Set();
    if (scope === 'current') {
      targetIndices.add(state.current);
    } else if (scope === 'selected' && state.selected.size > 0) {
      for (const id of state.selected) {
        const idx = state.pages.findIndex((p) => p.id === id);
        if (idx >= 0) targetIndices.add(idx);
      }
    } else {
      for (let i = 0; i < state.pages.length; i += 1) targetIndices.add(i);
    }
    if (!targetIndices.size) targetIndices.add(state.current);

    $('#crop-modal').hidden = true;
    setBusy(true);
    try {
      pushHistory(true);
      const srcDoc = await buildDocument(state.pages);
      const outDoc = await PDFDocument.create();
      const srcPages = srcDoc.getPages();
      const A4_W = 595.28;
      const A4_H = 841.89;

      for (let i = 0; i < srcPages.length; i += 1) {
        const sp = srcPages[i];
        if (!targetIndices.has(i)) {
          const [copied] = await outDoc.copyPages(srcDoc, [i]);
          outDoc.addPage(copied);
          continue;
        }
        const box = sp.getCropBox() || sp.getMediaBox();
        const bx = box.x || 0;
        const by = box.y || 0;
        const bw = box.width;
        const bh = box.height;
        const cropW = Math.max(36, bw - leftPt - rightPt);
        const cropH = Math.max(36, bh - topPt - bottomPt);
        const cropX = Math.min(bx + bw - 36, bx + leftPt);
        const cropY = Math.min(by + bh - 36, by + bottomPt);

        if (normalizeA4) {
          const landscape = cropW > cropH;
          const targetW = landscape ? A4_H : A4_W;
          const targetH = landscape ? A4_W : A4_H;
          const embedded = await outDoc.embedPage(sp, {
            left: cropX,
            bottom: cropY,
            right: cropX + cropW,
            top: cropY + cropH,
          });
          const scale = Math.min(targetW / cropW, targetH / cropH);
          const drawW = cropW * scale;
          const drawH = cropH * scale;
          const page = outDoc.addPage([targetW, targetH]);
          page.drawPage(embedded, {
            x: (targetW - drawW) / 2,
            y: (targetH - drawH) / 2,
            width: drawW,
            height: drawH,
          });
        } else {
          const [copied] = await outDoc.copyPages(srcDoc, [i]);
          copied.setCropBox(cropX, cropY, cropW, cropH);
          copied.setMediaBox(cropX, cropY, cropW, cropH);
          outDoc.addPage(copied);
        }
      }

      const newBytes = await outDoc.save();
      const sourceId = uid('src');
      const pdfDoc = await pdfjsLib.getDocument({ data: newBytes.slice() }).promise;
      state.sources.clear();
      state.sources.set(sourceId, {
        id: sourceId,
        name: state.fileName || 'Documento.pdf',
        bytes: newBytes,
        pdfDoc,
      });

      const newPages = [];
      for (let i = 0; i < pdfDoc.numPages; i += 1) {
        const p = await pdfDoc.getPage(i + 1);
        const vp = p.getViewport({ scale: 1 });
        newPages.push({
          id: uid('page'),
          kind: 'pdf',
          sourceId,
          srcIndex: i,
          width: vp.width,
          height: vp.height,
          rotation: 0,
        });
      }
      state.pages = newPages;
      state.selected.clear();
      state.dirty = true;
      await refresh({ preserveScroll: true });
      toast(
        normalizeA4
          ? 'Páginas recortadas y normalizadas a A4'
          : 'Márgenes recortados correctamente',
      );
    } catch (error) {
      showError('No se pudo recortar el PDF', error);
    } finally {
      setBusy(false);
    }
  }

  /* --------------------------------------------------------------- compare */

  const compare = {
    left: null,
    right: null,
    rightName: '',
    page: 0,
    total: 0,
    mode: 'side',
    textCache: new Map(),
    diffPages: new Set(),
    token: 0,
  };

  async function getPageWords(pdf, side, index) {
    const key = `${side}:${index}`;
    if (compare.textCache.has(key)) return compare.textCache.get(key);
    let words = [];
    if (index < pdf.numPages) {
      const page = await pdf.getPage(index + 1);
      const content = await page.getTextContent();
      words = content.items
        .map((it) => it.str || '')
        .join(' ')
        .split(/\s+/)
        .filter(Boolean);
    }
    compare.textCache.set(key, words);
    return words;
  }

  function diffWords(a, b) {
    const MAX = 2500;
    if (a.length > MAX || b.length > MAX) {
      const setA = new Set(a);
      const setB = new Set(b);
      return {
        removed: a.filter((w) => !setB.has(w)),
        added: b.filter((w) => !setA.has(w)),
        ops: null,
      };
    }
    const n = a.length;
    const m = b.length;
    const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
    const ops = [];
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (a[i] === b[j]) {
        ops.push(['=', a[i]]);
        i++;
        j++;
      } else if (dp[i + 1][j] >= dp[i][j + 1]) {
        ops.push(['-', a[i++]]);
      } else {
        ops.push(['+', b[j++]]);
      }
    }
    while (i < n) ops.push(['-', a[i++]]);
    while (j < m) ops.push(['+', b[j++]]);
    return {
      removed: ops.filter((o) => o[0] === '-').map((o) => o[1]),
      added: ops.filter((o) => o[0] === '+').map((o) => o[1]),
      ops,
    };
  }

  async function renderComparePage(pdf, index, scale) {
    if (!pdf || index >= pdf.numPages) return null;
    const page = await pdf.getPage(index + 1);
    const vp = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(vp.width));
    canvas.height = Math.max(1, Math.round(vp.height));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    return canvas;
  }

  function computePixelDiff(a, b) {
    const w = Math.max(a?.width || 0, b?.width || 0);
    const h = Math.max(a?.height || 0, b?.height || 0);
    const mk = (src) => {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const x = c.getContext('2d');
      x.fillStyle = '#fff';
      x.fillRect(0, 0, w, h);
      if (src) x.drawImage(src, 0, 0);
      return x.getImageData(0, 0, w, h);
    };
    const da = mk(a);
    const db = mk(b);
    const mask = new Uint8Array(w * h);
    let changed = 0;
    for (let p = 0, k = 0; p < da.data.length; p += 4, k++) {
      const d =
        Math.abs(da.data[p] - db.data[p]) +
        Math.abs(da.data[p + 1] - db.data[p + 1]) +
        Math.abs(da.data[p + 2] - db.data[p + 2]);
      if (d > 60) {
        mask[k] = 1;
        changed++;
      }
    }
    return { w, h, mask, changed, da, db };
  }

  function paintWithDiff(target, src, diff, color) {
    target.width = diff.w;
    target.height = diff.h;
    const ctx = target.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, diff.w, diff.h);
    if (src) ctx.drawImage(src, 0, 0);
    if (!diff.changed) return;
    const img = ctx.getImageData(0, 0, diff.w, diff.h);
    for (let k = 0, p = 0; k < diff.mask.length; k++, p += 4) {
      if (!diff.mask[k]) continue;
      img.data[p] = Math.round(img.data[p] * 0.45 + color[0] * 0.55);
      img.data[p + 1] = Math.round(img.data[p + 1] * 0.45 + color[1] * 0.55);
      img.data[p + 2] = Math.round(img.data[p + 2] * 0.45 + color[2] * 0.55);
    }
    ctx.putImageData(img, 0, 0);
  }

  function paintCompareOverlay(target, diff) {
    target.width = diff.w;
    target.height = diff.h;
    const ctx = target.getContext('2d');
    const out = ctx.createImageData(diff.w, diff.h);
    const { da, db } = diff;
    for (let k = 0, p = 0; k < diff.mask.length; k++, p += 4) {
      const ga = (da.data[p] + da.data[p + 1] + da.data[p + 2]) / 3;
      const gb = (db.data[p] + db.data[p + 1] + db.data[p + 2]) / 3;
      if (!diff.mask[k]) {
        const g = Math.round(200 + ga * 0.2);
        out.data[p] = out.data[p + 1] = out.data[p + 2] = Math.min(255, g);
      } else if (ga < gb) {
        out.data[p] = 230;
        out.data[p + 1] = 40;
        out.data[p + 2] = 40;
      } else {
        out.data[p] = 30;
        out.data[p + 1] = 160;
        out.data[p + 2] = 60;
      }
      out.data[p + 3] = 255;
    }
    ctx.putImageData(out, 0, 0);
  }

  function escapeCompareHtml(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  }

  async function renderCompare() {
    const token = ++compare.token;
    const idx = compare.page;
    $('#compare-page-label').textContent = `Página ${idx + 1} / ${compare.total}`;
    $('#compare-prev').disabled = idx <= 0;
    $('#compare-next').disabled = idx >= compare.total - 1;
    $$('#compare-chips button').forEach((b) => b.classList.toggle('active', Number(b.dataset.page) === idx));
    const info = $('#compare-info');
    info.textContent = 'Comparando…';

    const scale = 1.2;
    const [ca, cb] = await Promise.all([
      renderComparePage(compare.left, idx, scale),
      renderComparePage(compare.right, idx, scale),
    ]);
    if (token !== compare.token) return;
    const diff = computePixelDiff(ca, cb);
    const side = compare.mode === 'side';
    $('#compare-side').hidden = !side;
    $('#compare-overlay-wrap').hidden = side;
    if (side) {
      paintWithDiff($('#compare-canvas-left'), ca, diff, [230, 40, 40]);
      paintWithDiff($('#compare-canvas-right'), cb, diff, [30, 160, 60]);
    } else {
      paintCompareOverlay($('#compare-canvas-overlay'), diff);
    }

    const [wa, wb] = await Promise.all([
      getPageWords(compare.left, 'L', idx),
      getPageWords(compare.right, 'R', idx),
    ]);
    if (token !== compare.token) return;
    const td = diffWords(wa, wb);
    const pct = diff.w && diff.h ? ((diff.changed / (diff.w * diff.h)) * 100).toFixed(2) : '0';
    const missing = !ca ? ' · solo existe en el documento B' : !cb ? ' · solo existe en el documento A' : '';
    info.textContent = `${pct}% de píxeles distintos · ${td.removed.length} palabras eliminadas · ${td.added.length} añadidas${missing}`;

    const textEl = $('#compare-text');
    if (!td.removed.length && !td.added.length) {
      textEl.innerHTML = '<p class="compare-same">Sin diferencias de texto en esta página.</p>';
    } else if (td.ops) {
      const html = [];
      for (const [op, w] of td.ops) {
        const e = escapeCompareHtml(w);
        if (op === '=') html.push(e);
        else if (op === '-') html.push(`<del>${e}</del>`);
        else html.push(`<ins>${e}</ins>`);
      }
      textEl.innerHTML = html.join(' ');
    } else {
      textEl.innerHTML =
        `<p><strong>Eliminado:</strong> <del>${escapeCompareHtml(td.removed.join(' '))}</del></p>` +
        `<p><strong>Añadido:</strong> <ins>${escapeCompareHtml(td.added.join(' '))}</ins></p>`;
    }
  }

  async function scanCompareTextDiffs() {
    const token = compare.token;
    const chips = $('#compare-chips');
    for (let i = 0; i < compare.total; i++) {
      if (!$('#compare-modal') || $('#compare-modal').hidden) return;
      const [wa, wb] = await Promise.all([
        getPageWords(compare.left, 'L', i),
        getPageWords(compare.right, 'R', i),
      ]);
      const differs = wa.join(' ') !== wb.join(' ') || i >= compare.left.numPages || i >= compare.right.numPages;
      if (differs) compare.diffPages.add(i);
      const chip = chips.querySelector(`button[data-page="${i}"]`);
      if (chip) chip.classList.toggle('diff', differs);
    }
    const n = compare.diffPages.size;
    $('#compare-summary').textContent = n
      ? `${n} página${n === 1 ? '' : 's'} con diferencias de texto`
      : 'Texto idéntico en todas las páginas';
    void token;
  }

  async function openCompare() {
    if (!state.pages.length || !state.pdf) {
      toast('Abre un PDF antes de comparar');
      return;
    }
    let result;
    try {
      result = await window.lalo.openPdfs();
      if (result.error) throw new Error(result.error);
    } catch (error) {
      toast(`No se pudo abrir el archivo: ${error.message}`, 6000);
      return;
    }
    if (result.canceled || !result.files?.length) return;
    const file = result.files[0];
    setBusy(true);
    try {
      if (compare.right) compare.right.destroy();
      compare.right = await pdfjsLib.getDocument({ data: file.bytes.slice() }).promise;
    } catch (error) {
      setBusy(false);
      toast(`No se pudo leer el PDF: ${error.message}`, 6000);
      return;
    }
    setBusy(false);
    compare.left = state.pdf;
    compare.rightName = file.name;
    compare.total = Math.max(compare.left.numPages, compare.right.numPages);
    compare.page = clamp(state.current, 0, compare.total - 1);
    compare.textCache = new Map();
    compare.diffPages = new Set();
    $('#compare-name-left').textContent = `A: ${state.fileName || 'Documento actual'}`;
    $('#compare-name-right').textContent = `B: ${file.name}`;
    $('#compare-summary').textContent = 'Analizando páginas…';
    const chips = $('#compare-chips');
    chips.innerHTML = '';
    for (let i = 0; i < compare.total; i++) {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.page = String(i);
      b.textContent = String(i + 1);
      b.addEventListener('click', () => {
        compare.page = i;
        renderCompare();
      });
      chips.appendChild(b);
    }
    $('#compare-modal').hidden = false;
    renderCompare();
    scanCompareTextDiffs();
  }

  function closeCompare() {
    $('#compare-modal').hidden = true;
    compare.token++;
    if (compare.right) {
      compare.right.destroy();
      compare.right = null;
    }
    compare.left = null;
  }

  function bindCompare() {
    $('#btn-compare')?.addEventListener('click', openCompare);
    $('#compare-close')?.addEventListener('click', closeCompare);
    $('#compare-prev')?.addEventListener('click', () => {
      if (compare.page > 0) {
        compare.page--;
        renderCompare();
      }
    });
    $('#compare-next')?.addEventListener('click', () => {
      if (compare.page < compare.total - 1) {
        compare.page++;
        renderCompare();
      }
    });
    $$('#compare-mode button').forEach((b) =>
      b.addEventListener('click', () => {
        compare.mode = b.dataset.mode;
        $$('#compare-mode button').forEach((x) => x.classList.toggle('active', x === b));
        renderCompare();
      }),
    );
    document.addEventListener('keydown', (e) => {
      const modal = $('#compare-modal');
      if (!modal || modal.hidden) return;
      if (e.key === 'Escape') closeCompare();
      else if (e.key === 'ArrowLeft') $('#compare-prev').click();
      else if (e.key === 'ArrowRight') $('#compare-next').click();
      else return;
      e.preventDefault();
      e.stopPropagation();
    }, true);
  }

  function bindCropModal() {
    $('#btn-crop-pages')?.addEventListener('click', openCropModal);
    const modal = $('#crop-modal');
    if (!modal) return;
    $('#crop-close')?.addEventListener('click', () => {
      modal.hidden = true;
    });
    $('#crop-cancel')?.addEventListener('click', () => {
      modal.hidden = true;
    });
    $('#crop-apply')?.addEventListener('click', applyCropAndNormalize);
    for (const id of ['#crop-top', '#crop-bottom', '#crop-left', '#crop-right']) {
      $(id)?.addEventListener('input', renderCropPreview);
    }
    modal.addEventListener('click', (event) => {
      if (event.target === modal) modal.hidden = true;
    });
  }

  function bindCompressModal() {
    $('#btn-compress-pdf')?.addEventListener('click', openCompressModal);
    const modal = $('#compress-modal');
    const form = $('#compress-form');
    if (!modal || !form) return;

    const qualityInput = $('#compress-quality');
    const qualityLabel = $('#compress-quality-label');
    const maxDimSelect = $('#compress-max-dim');
    const helpPopover = $('#compress-help-popover');

    const hideHelp = () => {
      if (helpPopover) helpPopover.hidden = true;
      $$('.help-dot.active', modal).forEach((b) => b.classList.remove('active'));
    };

    $$('.help-dot', modal).forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!helpPopover) return;
        const wasActive = btn.classList.contains('active');
        hideHelp();
        if (wasActive) return;

        btn.classList.add('active');
        helpPopover.textContent = btn.dataset.help || '';
        helpPopover.hidden = false;
        const formRect = form.getBoundingClientRect();
        const btnRect = btn.getBoundingClientRect();
        const popRect = helpPopover.getBoundingClientRect();
        const top = Math.max(8, btnRect.top - formRect.top - popRect.height - 8);
        const left = Math.max(12, Math.min(formRect.width - popRect.width - 12, btnRect.right - formRect.left - popRect.width));
        helpPopover.style.top = `${top}px`;
        helpPopover.style.left = `${left}px`;
      });
    });

    form.addEventListener('click', (e) => {
      if (!e.target.closest('.help-dot') && !e.target.closest('#compress-help-popover')) {
        hideHelp();
      }
    });

    qualityInput?.addEventListener('input', () => {
      qualityLabel.textContent = `${qualityInput.value}%`;
    });
    const triggerPreview = () => {
      lastCompressResult = null;
      runCompressPreview();
    };
    qualityInput?.addEventListener('change', triggerPreview);
    maxDimSelect?.addEventListener('change', triggerPreview);
    [
      '#compress-opt-metadata',
      '#compress-opt-flatten',
      '#compress-opt-structure',
      '#compress-opt-grayscale',
      '#compress-opt-rasterize',
    ].forEach((sel) => $(sel)?.addEventListener('change', triggerPreview));
    $('#compress-preview')?.addEventListener('click', triggerPreview);

    const close = () => {
      compressPreviewToken += 1;
      hideHelp();
      modal.hidden = true;
    };
    $('#compress-close')?.addEventListener('click', close);
    $('#compress-cancel')?.addEventListener('click', close);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) close();
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const opts = getCompressOptions();
      const key = JSON.stringify(opts);
      setBusy(true);
      try {
        const res =
          lastCompressResult && lastCompressResult.key === key
            ? lastCompressResult
            : await runCompressPreview();
        if (!res || !res.afterBytes) return;

        const sourceId = uid('src');
        state.sources.set(sourceId, {
          name: state.fileName || 'compressed.pdf',
          bytes: res.afterBytes,
        });
        state.pages = state.pages.map((page, idx) => ({
          id: page.id,
          kind: 'pdf',
          sourceId,
          srcIndex: idx,
          width: page.width,
          height: page.height,
          rotation: page.rotation,
        }));
        state.history = [];
        state.future = [];
        state.dirty = true;
        window.lalo?.setDirtyState?.(true);
        close();
        await refresh();
        toast(
          `PDF comprimido: ${formatBytes(res.beforeSize)} → ${formatBytes(res.afterBytes.length)}`,
          4500,
        );
      } catch (error) {
        showError('No se pudo comprimir el PDF', error);
      } finally {
        setBusy(false);
      }
    });
  }

  async function resolveOutlineDest(pdf, dest) {
    try {
      let resolved = dest;
      if (typeof dest === 'string') {
        resolved = await pdf.getDestination(dest);
      }
      if (!Array.isArray(resolved) || !resolved.length) return null;
      const ref = resolved[0];
      if (typeof ref === 'number') return ref;
      return await pdf.getPageIndex(ref);
    } catch {
      return null;
    }
  }

  function buildOutlineNodes(pdf, items, container) {
    for (const item of items) {
      const wrap = document.createElement('div');
      wrap.className = 'outline-item';

      const row = document.createElement('div');
      row.className = 'outline-row';

      const hasChildren = Array.isArray(item.items) && item.items.length > 0;
      let childrenEl = null;

      if (hasChildren) {
        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'outline-toggle';
        toggle.textContent = '▾';
        toggle.addEventListener('click', (e) => {
          e.stopPropagation();
          if (!childrenEl) return;
          childrenEl.hidden = !childrenEl.hidden;
          toggle.textContent = childrenEl.hidden ? '▸' : '▾';
        });
        row.appendChild(toggle);
      } else {
        const spacer = document.createElement('span');
        spacer.className = 'outline-spacer';
        row.appendChild(spacer);
      }

      const title = document.createElement('span');
      title.className = 'outline-title';
      title.textContent = item.title || '(Sin título)';
      title.title = item.title || '';
      row.appendChild(title);

      row.addEventListener('click', async () => {
        if (!item.dest) return;
        const pageIdx = await resolveOutlineDest(pdf, item.dest);
        if (pageIdx !== null && pageIdx >= 0 && pageIdx < state.pages.length) {
          goToPage(pageIdx);
        }
      });

      wrap.appendChild(row);

      if (hasChildren) {
        childrenEl = document.createElement('div');
        childrenEl.className = 'outline-children';
        buildOutlineNodes(pdf, item.items, childrenEl);
        wrap.appendChild(childrenEl);
      }

      container.appendChild(wrap);
    }
  }

  async function renderOutline(pdf) {
    const list = $('#outline-list');
    if (!list) return;
    list.innerHTML = '';
    let outlinePdf = pdf;
    let outline = await pdf.getOutline();
    if ((!outline || !outline.length) && state.pages.length) {
      const firstPdfPage = state.pages.find((p) => p.kind === 'pdf');
      const source = firstPdfPage ? state.sources.get(firstPdfPage.sourceId) : null;
      if (source?.bytes) {
        try {
          const loadOpts = { data: source.bytes.slice() };
          if (source.password !== undefined) loadOpts.password = source.password;
          const srcPdf = await pdfjsLib.getDocument(loadOpts).promise;
          const srcOutline = await srcPdf.getOutline();
          if (srcOutline && srcOutline.length) {
            outlinePdf = srcPdf;
            outline = srcOutline;
          } else {
            srcPdf.destroy();
          }
        } catch {
          /* ignore */
        }
      }
    }
    if (!outline || !outline.length) {
      const empty = document.createElement('div');
      empty.className = 'outline-empty';
      empty.textContent = 'Este documento no contiene marcadores.';
      list.appendChild(empty);
      return;
    }
    buildOutlineNodes(outlinePdf, outline, list);
  }

  function bindSidebarTabs() {
    const tabs = $$('[data-sidebar-tab]');
    const thumbs = $('#thumbs');
    const outline = $('#outline-list');
    if (!tabs.length || !thumbs || !outline) return;
    tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        const target = tab.dataset.sidebarTab;
        tabs.forEach((t) => t.classList.toggle('active', t === tab));
        thumbs.hidden = target !== 'thumbs';
        outline.hidden = target !== 'outline';
      });
    });
  }

  const RECENT_FILES_KEY = 'lalo-pdf-recent';
  const MAX_RECENT_FILES = 8;

  function loadRecentFiles() {
    try {
      const raw = localStorage.getItem(RECENT_FILES_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.filter((x) => x && x.path) : [];
    } catch {
      return [];
    }
  }

  function saveRecentFiles(list) {
    try {
      localStorage.setItem(RECENT_FILES_KEY, JSON.stringify(list.slice(0, MAX_RECENT_FILES)));
    } catch {
      /* ignore */
    }
  }

  function addRecentFile(filePath, fileName) {
    if (!filePath) return;
    const name = fileName || String(filePath).split(/[\\/]/).pop() || 'Documento.pdf';
    const next = [
      { path: filePath, name, openedAt: Date.now() },
      ...loadRecentFiles().filter((item) => item.path !== filePath),
    ].slice(0, MAX_RECENT_FILES);
    saveRecentFiles(next);
    renderRecentFiles();
  }

  function renderRecentFiles() {
    const box = $('#recent-files');
    if (!box) return;
    const list = loadRecentFiles();
    if (!list.length) {
      box.hidden = true;
      box.innerHTML = '';
      return;
    }
    box.hidden = false;
    box.innerHTML = `
      <div class="recent-files-head">
        <span>Documentos recientes</span>
        <button type="button" class="recent-clear-btn" id="recent-clear">Limpiar</button>
      </div>
      <div class="recent-list"></div>
    `;
    const listEl = $('.recent-list', box);
    for (const item of list) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'recent-item';
      btn.title = item.path;
      const nameSpan = document.createElement('span');
      nameSpan.className = 'recent-name';
      nameSpan.textContent = item.name || 'Documento.pdf';
      const pathSpan = document.createElement('span');
      pathSpan.className = 'recent-path';
      pathSpan.textContent = folderOf(item.path);
      btn.append(nameSpan, pathSpan);
      btn.addEventListener('click', async () => {
        if (!window.lalo?.readFileByPath) {
          toast('No disponible en esta plataforma');
          return;
        }
        try {
          const res = await window.lalo.readFileByPath(item.path);
          if (!res || !res.ok || !res.bytes) {
            toast('No se pudo abrir el archivo (puede haberse movido o eliminado)');
            return;
          }
          await openFiles(
            [{ name: res.name || item.name, path: item.path, bytes: new Uint8Array(res.bytes) }],
            { replace: !state.pages.length },
          );
          addRecentFile(item.path, res.name || item.name);
        } catch (err) {
          showError('No se pudo abrir el archivo reciente', err);
        }
      });
      listEl.appendChild(btn);
    }
    $('#recent-clear', box)?.addEventListener('click', () => {
      saveRecentFiles([]);
      renderRecentFiles();
    });
  }

  const docTabs = [];
  let activeTabId = null;
  let draggingTabId = null;

  function snapshotActiveTab() {
    return {
      id: activeTabId || uid('tab'),
      sources: new Map(state.sources),
      pages: [...state.pages],
      selected: new Set(state.selected),
      anchorIndex: state.anchorIndex,
      current: state.current,
      viewMode: state.viewMode,
      zoomMode: state.zoomMode,
      scale: state.scale,
      annotations: new Map(state.annotations),
      selection: state.selection,
      history: [...state.history],
      future: [...state.future],
      fileName: state.fileName,
      filePath: state.filePath,
      security: state.security,
      watermark: state.watermark,
      pageNumbers: state.pageNumbers,
      dirty: state.dirty,
    };
  }

  function ensureActiveTab() {
    if (!activeTabId) {
      const tab = snapshotActiveTab();
      activeTabId = tab.id;
      docTabs.push(tab);
    } else {
      const idx = docTabs.findIndex((t) => t.id === activeTabId);
      const snap = snapshotActiveTab();
      if (idx >= 0) docTabs[idx] = snap;
      else docTabs.push(snap);
    }
  }

  async function applyTabState(tab) {
    activeTabId = tab.id;
    state.sources = new Map(tab.sources);
    state.pages = [...tab.pages];
    state.selected = new Set(tab.selected);
    state.anchorIndex = tab.anchorIndex;
    state.current = tab.current;
    state.viewMode = tab.viewMode;
    state.zoomMode = tab.zoomMode;
    state.scale = tab.scale;
    state.annotations = new Map(tab.annotations);
    state.selection = tab.selection;
    state.history = [...tab.history];
    state.future = [...tab.future];
    state.fileName = tab.fileName;
    state.filePath = tab.filePath;
    state.security = tab.security;
    state.watermark = tab.watermark;
    state.pageNumbers = tab.pageNumbers;
    state.dirty = tab.dirty;
    window.lalo?.setDirtyState?.(state.dirty);
    renderTabBar();
    await refresh({ preserveScroll: false, scrollToCurrent: true });
  }

  async function createNewTab() {
    ensureActiveTab();
    const blank = {
      id: uid('tab'),
      sources: new Map(),
      pages: [],
      selected: new Set(),
      anchorIndex: null,
      current: 0,
      viewMode: 'continuous',
      zoomMode: 'fit',
      scale: 1,
      annotations: new Map(),
      selection: null,
      history: [],
      future: [],
      fileName: 'Sin título.pdf',
      filePath: null,
      security: null,
      watermark: null,
      pageNumbers: null,
      dirty: false,
    };
    docTabs.push(blank);
    await applyTabState(blank);
  }

  async function switchTab(tabId) {
    if (tabId === activeTabId) return;
    ensureActiveTab();
    const target = docTabs.find((t) => t.id === tabId);
    if (!target) return;
    await applyTabState(target);
  }

  async function closeTab(tabId) {
    ensureActiveTab();
    const idx = docTabs.findIndex((t) => t.id === tabId);
    if (idx < 0) return;
    if (docTabs.length === 1) {
      docTabs[0] = {
        id: docTabs[0].id,
        sources: new Map(),
        pages: [],
        selected: new Set(),
        anchorIndex: null,
        current: 0,
        viewMode: 'continuous',
        zoomMode: 'fit',
        scale: 1,
        annotations: new Map(),
        selection: null,
        history: [],
        future: [],
        fileName: 'Sin título.pdf',
        filePath: null,
        security: null,
        watermark: null,
        pageNumbers: null,
        dirty: false,
      };
      await applyTabState(docTabs[0]);
      return;
    }
    docTabs.splice(idx, 1);
    if (tabId === activeTabId) {
      const next = docTabs[Math.min(idx, docTabs.length - 1)];
      await applyTabState(next);
    } else {
      renderTabBar();
    }
  }

  function renderTabBar() {
    const bar = $('#tab-bar');
    const list = $('#tabs-list');
    if (!bar || !list) return;
    ensureActiveTab();
    const show = docTabs.length > 1 || state.pages.length > 0;
    bar.hidden = !show;
    if (!show) return;

    list.innerHTML = '';
    for (const tab of docTabs) {
      const isActive = tab.id === activeTabId;
      const name = isActive ? state.fileName : tab.fileName;
      const dirty = isActive ? state.dirty : tab.dirty;

      const btn = document.createElement('div');
      btn.className = `doc-tab${isActive ? ' active' : ''}`;
      btn.role = 'tab';
      btn.title = name || 'Sin título.pdf';

      const title = document.createElement('span');
      title.className = 'doc-tab-title';
      title.textContent = name || 'Sin título.pdf';
      btn.appendChild(title);

      if (dirty) {
        const dot = document.createElement('span');
        dot.className = 'doc-tab-dirty';
        dot.textContent = '•';
        btn.appendChild(dot);
      }

      const closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.className = 'doc-tab-close';
      closeBtn.textContent = '×';
      closeBtn.title = 'Cerrar pestaña (Ctrl+W)';
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        closeTab(tab.id);
      });
      btn.appendChild(closeBtn);

      btn.addEventListener('click', () => switchTab(tab.id));
      btn.draggable = true;
      btn.addEventListener('dragstart', (e) => {
        draggingTabId = tab.id;
        btn.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', tab.id);
      });
      btn.addEventListener('dragend', () => {
        draggingTabId = null;
        btn.classList.remove('dragging');
      });
      btn.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (!draggingTabId || draggingTabId === tab.id) return;
        const fromIdx = docTabs.findIndex((t) => t.id === draggingTabId);
        const toIdx = docTabs.findIndex((t) => t.id === tab.id);
        if (fromIdx < 0 || toIdx < 0) return;
        const [moved] = docTabs.splice(fromIdx, 1);
        docTabs.splice(toIdx, 0, moved);
        const draggingEl = list.querySelector('.doc-tab.dragging');
        if (draggingEl) {
          if (fromIdx < toIdx) btn.after(draggingEl);
          else btn.before(draggingEl);
        }
      });
      btn.addEventListener('drop', (e) => {
        e.preventDefault();
      });
      list.appendChild(btn);
    }
  }

  function bindTabsAndRecent() {
    $('#btn-new-tab')?.addEventListener('click', createNewTab);
    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
        if (e.key.toLowerCase() === 't') {
          e.preventDefault();
          createNewTab();
        } else if (e.key.toLowerCase() === 'w' && docTabs.length > 1) {
          e.preventDefault();
          closeTab(activeTabId);
        }
      }
    });
    renderRecentFiles();
    renderTabBar();
  }

  function openOcrModal() {
    if (!state.pages.length || !state.pdf) {
      toast('Abre un PDF antes de ejecutar OCR');
      return;
    }
    if (!window.Tesseract) {
      toast('Motor OCR no disponible');
      return;
    }
    $('#ocr-progress').hidden = true;
    $('#ocr-error').hidden = true;
    $('#ocr-modal').hidden = false;
  }

  function bindOcrModal() {
    $('#btn-ocr')?.addEventListener('click', openOcrModal);
    const modal = $('#ocr-modal');
    const form = $('#ocr-form');
    if (!modal || !form) return;

    const close = () => {
      modal.hidden = true;
    };
    $('#ocr-close')?.addEventListener('click', close);
    $('#ocr-cancel')?.addEventListener('click', close);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) close();
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!state.pages.length || !state.pdf || !window.Tesseract) return;
      const lang = $('#ocr-lang').value || 'spa';
      const scope = $('#ocr-scope').value || 'all';
      const progressEl = $('#ocr-progress');
      const errEl = $('#ocr-error');
      const applyBtn = $('#ocr-apply');

      errEl.hidden = true;
      progressEl.hidden = false;
      progressEl.textContent = 'Inicializando motor OCR…';
      applyBtn.disabled = true;
      setBusy(true);

      let worker = null;
      try {
        worker = await window.Tesseract.createWorker(lang);
        const doc = await buildDocument(state.pages);
        const font = await doc.embedFont(StandardFonts.Helvetica);
        const docPages = doc.getPages();
        const indices =
          scope === 'current'
            ? [clamp(state.current, 0, state.pages.length - 1)]
            : state.pages.map((_, idx) => idx);

        let totalWords = 0;
        for (let k = 0; k < indices.length; k += 1) {
          const idx = indices[k];
          progressEl.textContent = `Procesando página ${idx + 1} (${k + 1}/${indices.length})…`;
          const pdfjsPage = await state.pdf.getPage(idx + 1);
          const scale = 2.0;
          const viewport = pdfjsPage.getViewport({ scale });
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(viewport.width));
          canvas.height = Math.max(1, Math.round(viewport.height));
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          await pdfjsPage.render({ canvasContext: ctx, viewport }).promise;

          const { data } = await worker.recognize(canvas, {}, { blocks: true });
          const words = [];
          if (Array.isArray(data?.words) && data.words.length) {
            words.push(...data.words);
          } else if (Array.isArray(data?.blocks)) {
            for (const block of data.blocks) {
              for (const para of block.paragraphs || []) {
                for (const line of para.lines || []) {
                  for (const w of line.words || []) words.push(w);
                }
              }
            }
          }
          const outPage = docPages[idx];
          const { width: pw, height: ph } = outPage.getSize();
          const sx = pw / canvas.width;
          const sy = ph / canvas.height;

          for (const w of words) {
            const text = String(w.text || '').trim();
            if (!text || !w.bbox) continue;
            const x = w.bbox.x0 * sx;
            const boxW = Math.max(2, (w.bbox.x1 - w.bbox.x0) * sx);
            const boxH = Math.max(4, (w.bbox.y1 - w.bbox.y0) * sy);
            const y = ph - w.bbox.y1 * sy;
            try {
              let fontSize = boxH * 0.9;
              const measured = font.widthOfTextAtSize(text, fontSize);
              if (measured > 0) {
                fontSize = Math.min(boxH * 1.8, fontSize * ((boxW * 1.08) / measured));
              }
              outPage.drawText(text, {
                x,
                y,
                size: Math.max(3, fontSize),
                font,
                color: rgb(0, 0, 0),
                opacity: 0.01,
              });
              totalWords += 1;
            } catch {
              /* skip unsupported glyphs */
            }
          }
        }

        const ocrBytes = await doc.save({ useObjectStreams: false });
        const sourceId = uid('src');
        state.sources.set(sourceId, {
          name: state.fileName || 'ocr.pdf',
          bytes: ocrBytes,
        });
        state.pages = state.pages.map((page, idx) => ({
          id: page.id,
          kind: 'pdf',
          sourceId,
          srcIndex: idx,
          width: page.width,
          height: page.height,
          rotation: page.rotation,
        }));
        state.history = [];
        state.future = [];
        state.dirty = true;
        window.lalo?.setDirtyState?.(true);
        close();
        await refresh();
        toast(`OCR completado: ${totalWords} palabras reconocidas`, 4500);
      } catch (error) {
        errEl.textContent = error.message || 'No se pudo completar el OCR.';
        errEl.hidden = false;
      } finally {
        if (worker) await worker.terminate().catch(() => {});
        applyBtn.disabled = false;
        setBusy(false);
      }
    });
  }

  function bindReorderableToolbars() {
    const ORDER_KEY = 'lalo-pdf-toolbar-order';
    let saved = {};
    try {
      saved = JSON.parse(localStorage.getItem(ORDER_KEY) || '{}') || {};
    } catch {
      saved = {};
    }

    const containers = [
      { key: 'tb-left', el: $('#toolbar .tb-left') },
      { key: 'tb-center', el: $('#toolbar .tb-center') },
      { key: 'tb-right', el: $('#toolbar .tb-right') },
      { key: 'right-rail', el: $('#right-rail') },
    ];

    const getItemId = (node) => {
      if (node.id) return node.id;
      const childWithId = node.querySelector('[id]');
      return childWithId ? `wrap:${childWithId.id}` : null;
    };

    for (const { key, el: container } of containers) {
      if (!container) continue;
      const items = Array.from(container.children).filter(
        (c) => !c.classList.contains('rail-sep') && !c.classList.contains('tb-sep') && getItemId(c),
      );

      const seps = Array.from(container.children)
        .map((c, idx) =>
          c.classList.contains('rail-sep') || c.classList.contains('tb-sep')
            ? { node: c, idx }
            : null,
        )
        .filter(Boolean);

      if (Array.isArray(saved[key])) {
        const byId = new Map(items.map((n) => [getItemId(n), n]));
        for (const id of saved[key]) {
          const node = byId.get(id);
          if (node) container.appendChild(node);
        }
        for (const n of items) {
          if (!saved[key].includes(getItemId(n))) container.appendChild(n);
        }
        for (const { node, idx } of seps) {
          const ref = container.children[idx];
          if (ref) container.insertBefore(node, ref);
          else container.appendChild(node);
        }
      }

      let draggingNode = null;
      for (const item of items) {
        item.draggable = true;
        item.addEventListener('dragstart', (e) => {
          draggingNode = item;
          item.classList.add('tb-dragging');
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', getItemId(item) || '');
        });
        item.addEventListener('dragend', () => {
          item.classList.remove('tb-dragging');
          draggingNode = null;
          saved[key] = Array.from(container.children)
            .map((c) => getItemId(c))
            .filter(Boolean);
          try {
            localStorage.setItem(ORDER_KEY, JSON.stringify(saved));
          } catch {
            /* ignore */
          }
        });
        item.addEventListener('dragover', (e) => {
          if (!draggingNode || draggingNode === item || draggingNode.parentElement !== container) {
            return;
          }
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          const children = Array.from(container.children);
          const fromIdx = children.indexOf(draggingNode);
          const toIdx = children.indexOf(item);
          if (fromIdx < 0 || toIdx < 0) return;

          const siblings = children.filter((c) => c !== draggingNode);
          const firstRects = new Map(siblings.map((c) => [c, c.getBoundingClientRect()]));

          if (fromIdx < toIdx) item.after(draggingNode);
          else item.before(draggingNode);

          for (const sib of siblings) {
            const first = firstRects.get(sib);
            const last = sib.getBoundingClientRect();
            const dx = first.left - last.left;
            const dy = first.top - last.top;
            if (dx || dy) {
              sib.style.transition = 'none';
              sib.style.transform = `translate(${dx}px, ${dy}px)`;
              requestAnimationFrame(() => {
                sib.style.transition = 'transform 0.18s cubic-bezier(0.2, 0.8, 0.2, 1)';
                sib.style.transform = '';
              });
            }
          }
        });
        item.addEventListener('drop', (e) => {
          if (draggingNode && draggingNode.parentElement === container) {
            e.preventDefault();
          }
        });
      }
    }
  }

  function bindThemeSwitcher() {
    const THEME_KEY = 'lalo-pdf-theme';
    const lightBtn = $('#btn-theme-light');
    const darkBtn = $('#btn-theme-dark');

    const getEffectiveTheme = () => {
      const saved = localStorage.getItem(THEME_KEY);
      if (saved === 'light' || saved === 'dark') return saved;
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    };

    const applyTheme = (theme, animate = false) => {
      if (animate) {
        document.body.classList.add('theme-transitioning');
        setTimeout(() => document.body.classList.remove('theme-transitioning'), 320);
      }
      document.documentElement.setAttribute('data-theme', theme);
      lightBtn?.classList.toggle('active', theme === 'light');
      darkBtn?.classList.toggle('active', theme === 'dark');
      window.lalo?.setTheme?.(theme);
    };

    applyTheme(getEffectiveTheme(), false);

    lightBtn?.addEventListener('click', () => {
      localStorage.setItem(THEME_KEY, 'light');
      applyTheme('light', true);
    });
    darkBtn?.addEventListener('click', () => {
      localStorage.setItem(THEME_KEY, 'dark');
      applyTheme('dark', true);
    });
  }

  function init() {
    $('#btn-presentation')?.addEventListener('click', togglePresentation);
    $('#pres-prev')?.addEventListener('click', () => {
      goToPage(state.current - 1);
      updatePresentationHud();
    });
    $('#pres-next')?.addEventListener('click', () => {
      goToPage(state.current + 1);
      updatePresentationHud();
    });
    $('#pres-exit')?.addEventListener('click', exitPresentation);
    document.addEventListener('fullscreenchange', () => {
      if (!document.fullscreenElement && document.body.classList.contains('presentation-mode')) {
        exitPresentation();
      }
    });
    window.addEventListener('keydown', (e) => {
      if (!document.body.classList.contains('presentation-mode')) return;
      if (e.key === 'Escape' || e.key === 'F5') {
        e.preventDefault();
        exitPresentation();
      } else if (e.key === ' ' || e.key === 'PageDown' || e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        goToPage(state.current + 1);
        updatePresentationHud();
      } else if (e.key === 'PageUp' || e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        goToPage(state.current - 1);
        updatePresentationHud();
      }
    });
    const chkAutosave = $('#chk-autosave');
    if (chkAutosave) {
      try {
        chkAutosave.checked = localStorage.getItem('lalo-pdf-autosave') === '1';
      } catch {
        /* ignore */
      }
      chkAutosave.addEventListener('change', () => {
        try {
          localStorage.setItem('lalo-pdf-autosave', chkAutosave.checked ? '1' : '0');
        } catch {
          /* ignore */
        }
        toast(chkAutosave.checked ? 'Autoguardado activado' : 'Autoguardado desactivado');
      });
    }
    const unsavedModal = $('#unsaved-modal');
    if (unsavedModal) {
      const closeUnsaved = () => { unsavedModal.hidden = true; };
      $('#unsaved-close')?.addEventListener('click', closeUnsaved);
      $('#unsaved-cancel')?.addEventListener('click', closeUnsaved);
      unsavedModal.addEventListener('click', (e) => {
        if (e.target === unsavedModal) closeUnsaved();
      });
      $('#unsaved-discard')?.addEventListener('click', () => {
        closeUnsaved();
        window.lalo?.confirmQuit?.();
      });
      $('#unsaved-save')?.addEventListener('click', async () => {
        closeUnsaved();
        await save();
        if (!state.dirty) window.lalo?.confirmQuit?.();
      });
      $('#unsaved-save-as')?.addEventListener('click', async () => {
        closeUnsaved();
        await saveAs();
        if (!state.dirty) window.lalo?.confirmQuit?.();
      });
    }
    const resizer = $('#sidebar-resizer');
    if (resizer && el.sidebar) {
      const applySidebarWidth = (w) => {
        const clamped = clamp(Number(w) || 184, 130, 380);
        el.sidebar.style.width = `${clamped}px`;
        el.sidebar.style.flexBasis = `${clamped}px`;
      };
      resizer.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        resizer.classList.add('dragging');
        resizer.setPointerCapture(e.pointerId);
        const onMove = (me) => {
          applySidebarWidth(me.clientX);
        };
        const onUp = () => {
          resizer.classList.remove('dragging');
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);
          window.removeEventListener('pointercancel', onUp);
        };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onUp);
      });
    }
    const pageJump = $('#page-jump');
    if (pageJump) {
      const doJump = () => {
        if (!state.pages.length) return;
        const n = clamp(Number.parseInt(pageJump.value, 10) || 1, 1, state.pages.length);
        goToPage(n - 1);
      };
      pageJump.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          doJump();
          pageJump.blur();
        }
      });
      pageJump.addEventListener('change', doJump);
    }
    bindUI();
    bindSecurityModals();
    bindSignatureModal();
    bindWatermarkModal();
    bindPageNumbersModal();
    bindSplitModal();
    bindCompare();
    bindCropModal();
    bindCompressModal();
    bindSidebarTabs();
    bindTabsAndRecent();
    bindOcrModal();
    bindMenu();
    let lastValidFocus = null;
    let fixingSelection = false;
    const isInsideTextSpan = (node) => {
      const elem = node && (node.nodeType === 3 ? node.parentElement : node);
      return Boolean(elem && elem.closest && elem.closest('.textLayer span'));
    };
    document.addEventListener('selectionchange', () => {
      if (fixingSelection) return;
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
        lastValidFocus =
          sel && sel.focusNode && isInsideTextSpan(sel.focusNode)
            ? { node: sel.focusNode, offset: sel.focusOffset }
            : null;
        return;
      }
      if (!isInsideTextSpan(sel.anchorNode)) return;
      if (isInsideTextSpan(sel.focusNode)) {
        lastValidFocus = { node: sel.focusNode, offset: sel.focusOffset };
      } else if (lastValidFocus && lastValidFocus.node.isConnected) {
        fixingSelection = true;
        try {
          sel.extend(lastValidFocus.node, lastValidFocus.offset);
        } catch {
          /* ignore */
        } finally {
          fixingSelection = false;
        }
      }
    });
    $('#btn-apply-redact')?.addEventListener('click', async () => {
      if (!state.pages.length || !state.pdf) return;
      const pagesToRedact = [];
      state.pages.forEach((p, idx) => {
        const list = state.annotations.get(p.id) || [];
        if (list.some((a) => a.type === 'redact')) pagesToRedact.push(idx);
      });
      if (!pagesToRedact.length) return;
      setBusy(true);
      toast('Aplicando redacción definitiva…', 2000);
      try {
        const doc = await buildDocument(state.pages);
        const outDoc = await PDFDocument.create();
        const docPages = doc.getPages();
        for (let i = 0; i < state.pages.length; i += 1) {
          const model = state.pages[i];
          const list = state.annotations.get(model.id) || [];
          const redacts = list.filter((a) => a.type === 'redact');
          if (!redacts.length) {
            const [copied] = await outDoc.copyPages(doc, [i]);
            outDoc.addPage(copied);
            continue;
          }
          const pdfjsPage = await state.pdf.getPage(i + 1);
          const vp1 = pdfjsPage.getViewport({ scale: 1 });
          const scale = 2.0;
          const viewport = pdfjsPage.getViewport({ scale });
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(viewport.width));
          canvas.height = Math.max(1, Math.round(viewport.height));
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          await pdfjsPage.render({ canvasContext: ctx, viewport }).promise;

          ctx.fillStyle = '#000000';
          for (const r of redacts) {
            ctx.fillRect(
              r.x * canvas.width,
              r.y * canvas.height,
              r.w * canvas.width,
              r.h * canvas.height,
            );
          }
          const jpgBytes = await canvasToJpegBytes(canvas, 0.92);
          const jpgImg = await outDoc.embedJpg(jpgBytes);
          const { width: pw, height: ph } = docPages[i].getSize();
          const outPage = outDoc.addPage([pw, ph]);
          outPage.drawImage(jpgImg, { x: 0, y: 0, width: pw, height: ph });
          state.annotations.set(
            model.id,
            list.filter((a) => a.type !== 'redact'),
          );
        }
        const bytes = await outDoc.save({ useObjectStreams: false });
        const sourceId = uid('src');
        state.sources.set(sourceId, { name: state.fileName || 'redacted.pdf', bytes });
        state.pages = state.pages.map((p, idx) => ({
          id: p.id,
          kind: 'pdf',
          sourceId,
          srcIndex: idx,
          width: p.width,
          height: p.height,
          rotation: p.rotation,
        }));
        state.history = [];
        state.future = [];
        state.dirty = true;
        window.lalo?.setDirtyState?.(true);
        await refresh({ preserveScroll: true });
        toast(
          `Redacción aplicada en ${pagesToRedact.length} página${pagesToRedact.length === 1 ? '' : 's'}`,
          4000,
        );
      } catch (err) {
        showError('No se pudo aplicar la redacción', err);
      } finally {
        setBusy(false);
      }
    });
    bindReorderableToolbars();
    bindThemeSwitcher();
    updateStatus();
    updateToolbarState();
    const versionEl = $('#status-version');
    const updateDot = $('#btn-check-update');
    const REPO_URL = 'https://github.com/laloj77/Lalo-PDF';

    versionEl?.addEventListener('click', () => {
      if (window.lalo?.openExternal) window.lalo.openExternal(REPO_URL);
      else window.open(REPO_URL, '_blank');
    });

    const isNewerVersion = (latest, current) => {
      const a = String(latest || '').replace(/^v/i, '').split('.').map(Number);
      const b = String(current || '').replace(/^v/i, '').split('.').map(Number);
      for (let i = 0; i < 3; i += 1) {
        if ((a[i] || 0) > (b[i] || 0)) return true;
        if ((a[i] || 0) < (b[i] || 0)) return false;
      }
      return false;
    };

    let currentAppVersion = null;
    const checkLatestVersion = async (manual = false) => {
      if (!updateDot || !currentAppVersion) return;
      try {
        let latest = '';
        if (window.lalo?.getLatestVersion) {
          const r = await window.lalo.getLatestVersion();
          if (r?.ok && r.version) latest = r.version;
        }
        if (!latest) throw new Error('No version');
        updateDot.classList.remove('up-to-date', 'update-available');
        if (isNewerVersion(latest, currentAppVersion)) {
          updateDot.classList.add('update-available');
          updateDot.title = `Nueva versión ${latest} disponible (clic para actualizar)`;
          if (manual) {
            const upd = await window.lalo?.checkForUpdates?.();
            if (!upd?.packaged) {
              toast(`Nueva versión ${latest} disponible en GitHub`, 4000);
            }
          }
        } else {
          updateDot.classList.add('up-to-date');
          updateDot.title = `Versión al día (v${currentAppVersion})`;
          if (manual) toast(`Tienes la última versión (v${currentAppVersion})`);
        }
      } catch {
        if (manual) toast('No se pudo comprobar actualizaciones');
      }
    };

    updateDot?.addEventListener('click', () => checkLatestVersion(true));

    const updWrap = $('#update-progress-wrap');
    const updLabel = $('#update-progress-label');
    const updFill = $('#update-progress-fill');
    if (updWrap && window.lalo?.onUpdateProgress) {
      window.lalo.onUpdateProgress((p) => {
        if (!p || p.status === 'error') {
          updWrap.hidden = true;
          return;
        }
        updWrap.hidden = false;
        const pct = Math.max(0, Math.min(100, Number(p.percent) || 0));
        if (updFill) updFill.style.width = `${pct}%`;
        if (updLabel) {
          updLabel.textContent =
            p.status === 'downloaded' ? 'Instalando…' : `Actualizando… ${pct}%`;
        }
      });
    }

    if (versionEl && window.lalo?.appInfo) {
      window.lalo
        .appInfo()
        .then((info) => {
          if (info?.version) {
            currentAppVersion = info.version;
            versionEl.textContent = `v${info.version}`;
            checkLatestVersion(false);
          }
        })
        .catch(() => {});
    }
  }

  init();
})();
