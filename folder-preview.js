/*! 正经素材库 © 2026 小橙子工作室（XXCHENGZI）。保留所有权利，详见 LICENSE。 */
(() => {
  'use strict';
  const chinese = new Intl.Collator('zh-CN', { sensitivity: 'variant', numeric: false });
  const group = char => /[0-9]/.test(char) ? 0 : /[A-Z]/.test(char) ? 1 : /[a-z]/.test(char) ? 2 : 3;
  // 字符顺序固定：0–9、A–Z、a–z；中文按名称顺序，完全相同的名称保持原有顺序。
  function compareText(left, right) {
    const a = Array.from(String(left).normalize('NFC')), b = Array.from(String(right).normalize('NFC'));
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      if (a[i] === b[i]) continue;
      const rank = group(a[i]) - group(b[i]);
      if (rank) return rank;
      const difference = group(a[i]) < 3 ? a[i].codePointAt(0) - b[i].codePointAt(0) : chinese.compare(a[i], b[i]) || a[i].codePointAt(0) - b[i].codePointAt(0);
      if (difference) return difference;
    }
    return a.length - b.length;
  }
  function compareNames(left, right) {
    const parts = name => {
      const value = String(name).normalize('NFC'), dot = value.lastIndexOf('.');
      return dot > 0 ? [value.slice(0, dot), value.slice(dot + 1)] : [value, ''];
    };
    const a = parts(left), b = parts(right);
    return compareText(a[0], b[0]) || compareText(a[1], b[1]);
  }
  if (typeof module === 'object' && module.exports) { module.exports = { compareNames }; return; }

  let current = null, openTimer = 0, closeTimer = 0, nextId = 0;
  const make = (tag, className, text) => {
    const node = document.createElement(tag); node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  function close(restoreFocus = false) {
    clearTimeout(openTimer); clearTimeout(closeTimer);
    if (!current) return;
    const state = current; current = null;
    state.observer?.disconnect(); state.panel.remove(); state.card.classList.remove('folder-peeking');
    state.trigger.setAttribute('aria-expanded', 'false'); state.trigger.removeAttribute('aria-controls');
    if (restoreFocus && state.trigger.isConnected) state.trigger.focus({ preventScroll: true });
  }
  function laterClose() { clearTimeout(openTimer); clearTimeout(closeTimer); closeTimer = setTimeout(close, 220); }
  function open(card, trigger, options, keyboard = false) {
    clearTimeout(openTimer); clearTimeout(closeTimer);
    if (!card.isConnected || !options.allowed()) return;
    if (current?.card === card) { if (keyboard) current.panel.querySelector('.folder-peek-select')?.focus(); return; }
    close(); options.beforeOpen();
    const assets = options.assets().slice().sort((a, b) => compareNames(a.name, b.name));
    const panel = make('section', 'folder-peek'); panel.id = `folder-peek-${++nextId}`;
    panel.setAttribute('aria-label', `${options.name}的素材`); panel.setAttribute('role', 'region');
    const header = make('div', 'folder-peek-heading');
    header.append(make('span', '', `${assets.length} 份`), make('span', '', '名称升序'));
    const list = make('ul', 'folder-peek-list'); list.setAttribute('aria-label', '文件列表');
    panel.append(header, list);
    const state = { panel, card, trigger, observer: null };
    current = state;
    const select = button => {
      for (const other of list.querySelectorAll('.folder-peek-select')) other.setAttribute('aria-pressed', String(other === button));
      for (const row of list.children) row.classList.toggle('is-selected', row.contains(button));
    };
    const thumbs = new Map();
    for (const asset of assets) {
      const row = make('li', 'folder-peek-row'); row.dataset.id = asset.id;
      const button = make('button', 'folder-peek-select'); button.type = 'button';
      button.setAttribute('aria-label', `选中 ${asset.name}`); button.setAttribute('aria-pressed', 'false');
      const thumb = options.thumb(asset); thumb.classList.add('folder-peek-thumb');
      const info = make('span', 'folder-peek-info');
      const name = make('strong', '', asset.name); name.title = asset.name;
      info.append(name, make('small', '', options.caption(asset)));
      button.append(thumb, info); button.addEventListener('click', () => select(button));
      row.append(button);
      if (options.canDownload()) {
        const download = options.download(asset); download.classList.add('folder-peek-download');
        download.addEventListener('click', () => select(button)); row.append(download);
      }
      list.append(row); thumbs.set(thumb, asset);
    }
    if (!assets.length) list.append(make('li', 'folder-peek-empty', '这个文件夹是空的'));
    document.body.append(panel);
    const position = () => {
      if (current !== state || !card.isConnected) return;
      const rect = card.getBoundingClientRect();
      const below = innerHeight - rect.bottom - 12, above = rect.top - 12;
      const upward = below < 110 && above > below;
      const height = Math.min(676, Math.max(80, (upward ? above : below) - 34));
      list.style.maxHeight = `${height}px`;
      panel.style.width = `${rect.width}px`; panel.style.left = `${rect.left}px`;
      panel.classList.toggle('opens-up', upward);
      const dock = document.querySelector('.library-dock')?.getBoundingClientRect();
      list.style.paddingBottom = !upward && dock && rect.left < dock.right && rect.right > dock.left ? `${innerHeight - dock.top + 12}px` : '8px';
      panel.style.top = upward ? `${Math.max(8, rect.top - panel.offsetHeight - 4)}px` : `${rect.bottom + 4}px`;
    };
    position();
    // 文件夹刚展开时可能仍在回弹；结束后再对齐一次，无需逐帧读取布局。
    Promise.all(card.getAnimations().map(animation => animation.finished.catch(() => {}))).then(position);
    card.classList.add('folder-peeking'); trigger.setAttribute('aria-expanded', 'true'); trigger.setAttribute('aria-controls', panel.id);
    if ('IntersectionObserver' in window) {
      state.observer = new IntersectionObserver(entries => {
        for (const entry of entries) if (entry.isIntersecting) {
          state.observer.unobserve(entry.target); options.loadThumb(entry.target, thumbs.get(entry.target));
        }
      }, { root: list, rootMargin: '30px' });
      thumbs.forEach((asset, thumb) => state.observer.observe(thumb));
    } else [...thumbs].slice(0, 6).forEach(([thumb, asset]) => options.loadThumb(thumb, asset));
    panel.addEventListener('pointerenter', () => clearTimeout(closeTimer));
    panel.addEventListener('pointerleave', laterClose);
    panel.addEventListener('focusin', () => clearTimeout(closeTimer));
    panel.addEventListener('focusout', event => { if (!panel.contains(event.relatedTarget) && !card.contains(event.relatedTarget)) laterClose(); });
    list.addEventListener('keydown', event => {
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
      const buttons = [...list.querySelectorAll('.folder-peek-select')];
      const index = buttons.indexOf(document.activeElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : Math.max(0, Math.min(buttons.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)));
      event.preventDefault(); buttons[next]?.focus(); buttons[next]?.scrollIntoView({ block: 'nearest' });
    });
    if (keyboard) list.querySelector('.folder-peek-select')?.focus({ preventScroll: true });
  }
  function bind(card, trigger, options) {
    trigger.setAttribute('aria-expanded', 'false'); trigger.setAttribute('aria-keyshortcuts', 'ArrowDown');
    card.addEventListener('pointerenter', event => {
      if (event.pointerType !== 'mouse' || !matchMedia('(hover:hover) and (pointer:fine)').matches) return;
      clearTimeout(closeTimer); clearTimeout(openTimer);
      openTimer = setTimeout(() => open(card, trigger, options), 200);
    });
    card.addEventListener('pointerleave', event => { if (!current?.panel.contains(event.relatedTarget)) laterClose(); });
    card.addEventListener('keydown', event => { if (event.key === 'ArrowDown') { event.preventDefault(); open(card, trigger, options, true); } });
    card.addEventListener('pointerdown', () => close());
    card.addEventListener('focusout', event => { if (!card.contains(event.relatedTarget) && !current?.panel.contains(event.relatedTarget)) laterClose(); });
  }
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && current) { event.preventDefault(); event.stopImmediatePropagation(); close(true); }
  }, true);
  document.addEventListener('pointerdown', event => { if (current && !current.panel.contains(event.target) && !current.card.contains(event.target)) close(); }, true);
  document.addEventListener('scroll', event => { if (current && !current.panel.contains(event.target)) close(); }, { capture: true, passive: true });
  addEventListener('resize', () => close()); addEventListener('blur', () => close());
  document.addEventListener('visibilitychange', () => { if (document.hidden) close(); });
  window.StudioFolders = { compareNames, bind, close };
})();
