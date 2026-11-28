(() => {
  'use strict';
  function bindToolsMenu($) {
    const wrap = $('#tools-menu-wrap');
    const btn = $('#btn-tools');
    const menu = $('#tools-menu');
    if (!wrap || !btn || !menu) return;
    const setOpen = (open) => {
      menu.hidden = !open;
      btn.setAttribute('aria-expanded', String(open));
    };
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      setOpen(menu.hidden);
    });
    menu.addEventListener('click', () => setOpen(false));
    document.addEventListener('click', (e) => {
      if (!menu.hidden && !wrap.contains(e.target)) setOpen(false);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !menu.hidden) setOpen(false);
    });
  }
  window.LaloToolsMenu = { bindToolsMenu };
})();
