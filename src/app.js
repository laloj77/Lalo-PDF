(() => {
  'use strict';

  const { PDFDocument, StandardFonts, degrees, rgb, LineCapStyle } = window.PDFLib;
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
    selection: null,
    textEdit: null,
    history: [],
    future: [],
    pdf: null,
    workingBytes: null,
    fileName: 'Sin título.pdf',
    filePath: null,
    security: null,
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

  function setDirty(value = true) {
    state.dirty = value;
    updateStatus();
  }

  function updateStatus() {
    const total = state.pages.length;
    if (!total) {
      el.statusLeft.textContent = 'Sin documento';
      el.statusRight.textContent = '';
      el.pageCount.textContent = '0 páginas';
      if (document.activeElement !== el.zoomLabel) el.zoomLabel.value = '100 %';
      el.emptyState.hidden = false;
      document.title = 'Lalo PDF';
      return;
    }
    state.current = clamp(state.current, 0, total - 1);
    el.emptyState.hidden = true;
    el.statusLeft.textContent =
      `Página ${state.current + 1} de ${total}` +
      (state.dirty ? '  ·  Cambios sin guardar' : '') +
      (state.fileName ? `  ·  ${state.fileName}` : '');
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
    el.markupBar.hidden = !state.markupOpen;
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
    const thickness = selected && selected.width ? selected.width : state.strokeWidth;
    $$('.thickness-btn').forEach((button) => {
      button.classList.toggle('active', Number(button.dataset.width) === thickness);
    });
    const size = selected && selected.type === 'text' ? selected.size : state.fontSize;
    setFontOption(el.fontSize, size || 14);
    updateUndoButtons();
  }

  function updateUndoButtons() {
    el.btnUndo.disabled = state.history.length === 0;
    el.btnRedo.disabled = state.future.length === 0;
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
    }
  }

  async function undo() {
    const entry = state.history.pop();
    if (!entry) return;
    state.future.push({ ...snapshot(entry.structural), structural: entry.structural });
    await restoreSnapshot(entry);
    setDirty(true);
  }

  async function redo() {
    const entry = state.future.pop();
    if (!entry) return;
    state.history.push({ ...snapshot(entry.structural), structural: entry.structural });
    await restoreSnapshot(entry);
    setDirty(true);
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
        state.pages.push({
          id: uid('pg'),
          kind: 'pdf',
          sourceId,
          srcIndex: index,
          rotation: normAngle(page.getRotation().angle),
          width,
          height,
        });
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
      state.selected.clear();
      state.history = [];
      state.future = [];
      state.current = 0;
      state.anchorIndex = null;
      state.zoomMode = 'fit';
      state.security = null;
      state.fileName = /\.pdf$/i.test(files[0].name)
        ? files[0].name
        : `${baseName(files[0].name)}.pdf`;
      state.filePath = files.length === 1 && files[0].path ? files[0].path : null;
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

  async function buildDocument(models = state.pages) {
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
        cache.set(model.sourceId, sourceDoc);
      }
      const [copied] = await out.copyPages(sourceDoc, [model.srcIndex]);
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

  function flattenAnnotations(page, model, font) {
    const annotations = state.annotations.get(model.id) || [];
    if (!annotations.length) return;
    const { width, height } = page.getSize();
    const rotation = normAngle(page.getRotation().angle);
    const displayWidth = rotation % 180 === 0 ? width : height;
    const displayHeight = rotation % 180 === 0 ? height : width;
    const toPdf = (nx, ny) => mapPoint(nx, ny, width, height, rotation);

    for (const annotation of annotations) {
      try {
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
          const lines = wrapLines((value) => font.widthOfTextAtSize(value, size), annotation.text, boxWidth);
          lines.forEach((line, index) => {
            const baseline = clamp(
              annotation.y + (size + index * size * LINE_HEIGHT) / displayHeight,
              0,
              1,
            );
            const anchor = toPdf(annotation.x, baseline);
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

  async function composePdf(models = state.pages) {
    const doc = await buildDocument(models);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const pages = doc.getPages();
    for (let i = 0; i < pages.length; i += 1) {
      flattenAnnotations(pages[i], models[i], font);
    }
    return doc;
  }

  async function composeBytes(models = state.pages, { encrypt = false } = {}) {
    const doc = await composePdf(models);
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
      const bytes = await composeBytes(state.pages, { encrypt: true });
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
        const bytes = await composeBytes(state.pages, { encrypt: true });
        downloadBlob(bytes, state.fileName || 'Documento.pdf', 'application/pdf');
        markSaved();
      } catch (error) {
        showError('No se pudo guardar', error);
      }
      return;
    }
    setBusy(true);
    try {
      const bytes = await composeBytes(state.pages, { encrypt: true });
      const result = await window.lalo.savePdf(state.fileName || 'Documento.pdf', bytes);
      if (!result || result.canceled) return;
      if (result.error) throw new Error(result.error);
      state.filePath = result.path || state.filePath;
      markSaved(result.name || state.fileName);
    } catch (error) {
      showError('No se pudo guardar', error);
    } finally {
      setBusy(false);
    }
  }

  async function exportImages() {
    if (!state.pages.length) {
      toast('Abre un PDF antes de exportar');
      return;
    }
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
          const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
          if (!blob) throw new Error('No se pudo generar la imagen de la página ' + i);
          images.push({ ext: 'png', bytes: new Uint8Array(await blob.arrayBuffer()) });
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

  async function doRefresh({ preserveScroll = true, scrollToCurrent = false } = {}) {
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
      updateStatus();
      updateToolbarState();
      return;
    }

    setBusy(true);
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

      updateStatus();
      updateToolbarState();

      if (state.search.query && !el.searchPanel.hidden) {
        runSearch(state.search.query, { silent: true });
      }
    } finally {
      setBusy(false);
    }
  }

  function computeScale(baseViewport, count) {
    if (state.zoomMode === 'custom') return clamp(state.scale, 0.1, 8);
    const availWidth = Math.max(180, el.viewer.clientWidth - 64);
    const availHeight = Math.max(180, el.viewer.clientHeight - 56);
    const twoUp = state.viewMode === 'two' && count > 1;
    const widthScale = (twoUp ? (availWidth - 4) / 2 : availWidth) / baseViewport.width;
    const heightScale = availHeight / baseViewport.height;
    const scale = state.viewMode === 'continuous' ? widthScale : Math.min(widthScale, heightScale);
    return clamp(scale, 0.1, 8);
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
    const scale = computeScale(baseViewport, indices.length);
    state.currentScale = scale;

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
    for (const index of indices) {
      if (token !== state.renderToken) {
        observer.disconnect();
        return;
      }
      const page = await pdf.getPage(index + 1);
      const viewport = page.getViewport({ scale });
      const pageEl = buildPageElement(index, page, viewport, scale, dpr);
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

    const badge = document.createElement('span');
    badge.className = 'page-badge';
    badge.textContent = String(index + 1);

    wrapper.append(canvas, overlay, badge);

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
    } else if (annotation.type === 'text') {
      const size = Math.max(6, (annotation.size || 14) * scale);
      const box = annotationBounds(annotation, width, height, scale);
      const lineHeight = size * LINE_HEIGHT;
      ctx.fillStyle = annotation.color;
      ctx.font = `${size}px ${FONT_FAMILY}`;
      ctx.textBaseline = 'top';
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
        ctx.fillText(line, box.x, y);
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

  function paintOverlay(canvas, pageId, width, height, extra) {
    const ctx = canvas.getContext('2d');
    const dpr = canvas.__dpr || 1;
    const scale = canvas.__scale || 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

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
      const scale = 148 / base.width;
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
      } else if (state.tool === 'rect' || state.tool === 'ellipse') {
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
      if (annotation.type === 'rect' || annotation.type === 'ellipse' || isLine) {
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
        Object.assign(existing, { x, y, w, h, text, size });
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

  function rotatePages(delta) {
    if (!state.pages.length) return;
    const ids = state.selected.size
      ? state.selected
      : new Set([state.pages[state.current].id]);
    pushHistory(true);
    for (const page of state.pages) {
      if (ids.has(page.id)) page.rotation = normAngle((page.rotation || 0) + delta);
    }
    state.dirty = true;
    refresh({ preserveScroll: true });
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
    zoomTo((state.currentScale || 1) / 1.25);
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
    $('#btn-export').addEventListener('click', exportImages);
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
          if (payload && payload.bytes) openFiles([payload]);
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
        case 'export-images':
          exportImages();
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

  function init() {
    bindUI();
    bindSecurityModals();
    bindMenu();
    updateStatus();
    updateToolbarState();
    const versionEl = $('#status-version');
    if (versionEl && window.lalo?.appInfo) {
      window.lalo
        .appInfo()
        .then((info) => {
          if (info?.version) versionEl.textContent = `v${info.version}`;
        })
        .catch(() => {});
    }
  }

  init();
})();
