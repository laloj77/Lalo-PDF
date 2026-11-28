(() => {
  'use strict';
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  const escapeHtml = (s) =>
    String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  window.LaloUtils = { clamp, escapeHtml };
})();
