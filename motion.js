(() => {
  'use strict';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const animations = new WeakMap();
  let inputMode = 'pointer';
  document.addEventListener('keydown', () => { inputMode = 'keyboard'; }, { capture: true });
  document.addEventListener('pointerdown', () => { inputMode = 'pointer'; }, { capture: true });
  function animate(node, frames, duration = 220, delay = 0) {
    const previous = animations.get(node);
    if (previous?.playState === 'running') {
      const style = getComputedStyle(node);
      frames[0] = { ...frames[0], transform: style.transform, opacity: style.opacity };
    }
    previous?.cancel();
    if (reduced.matches || inputMode === 'keyboard') return null;
    const animation = node.animate(frames, { duration, delay, easing: 'cubic-bezier(.23,1,.32,1)' });
    animations.set(node, animation);
    return animation;
  }
  function open(dialog) {
    dialog.classList.remove('is-closing');
    if (!dialog.open) dialog.showModal();
    animate(dialog, [{ opacity: 0, transform: 'translateY(16px) scale(.965)' }, { opacity: 1, transform: 'translateY(0) scale(1)' }], 260);
  }
  function close(dialog) {
    if (!dialog.open || dialog.classList.contains('is-closing')) return;
    dialog.classList.add('is-closing');
    const animation = animate(dialog, [{ opacity: 1, transform: 'translateY(0) scale(1)' }, { opacity: 0, transform: 'translateY(8px) scale(.985)' }], 140);
    const complete = () => { if (dialog.classList.contains('is-closing')) { dialog.close(); dialog.classList.remove('is-closing'); } };
    if (animation) animation.finished.then(complete, () => {}); else complete();
  }
  function grid(node, children) {
    const positions = new Map([...node.children].map(card => [card.dataset.id, card.getBoundingClientRect()]));
    const focused = document.activeElement;
    const focusedId = focused?.closest('.asset-card')?.dataset.id;
    const focusedClass = focused?.classList?.[0];
    node.replaceChildren(...children);
    if (inputMode !== 'keyboard' && !focused?.matches('input,select')) {
      let entered = 0;
      for (const card of children) {
        const next = card.getBoundingClientRect(), old = positions.get(card.dataset.id);
        if (next.top > innerHeight || next.bottom < 0) continue;
        if (old && (Math.abs(old.left-next.left)>1 || Math.abs(old.top-next.top)>1)) {
          animate(card, [{ transform: `translate(${old.left-next.left}px,${old.top-next.top}px)` }, { transform: 'translate(0,0)' }], 220);
        } else if (!old && entered < 8) {
          animate(card, [{ opacity:0, transform:'translateY(10px)' }, { opacity:1, transform:'translateY(0)' }], 200, Math.min(entered++*18,90));
        }
      }
    }
    if (focusedId) {
      const replacement = children.find(card => card.dataset.id === focusedId);
      [...(replacement?.querySelectorAll('button,a') || [])].find(button => button.classList.contains(focusedClass))?.focus({ preventScroll: true });
    }
  }
  let toastTimer;
  let toastRevision = 0;
  function toast(message) {
    const node = document.querySelector('#toast');
    clearTimeout(toastTimer);
    const revision = ++toastRevision;
    node.textContent = message;
    node.hidden = false;
    if (typeof node.showPopover === 'function' && !node.matches(':popover-open')) node.showPopover();
    animate(node, [{ opacity: 0, transform:'translateX(-50%) translateY(-8px) scale(.95)' }, { opacity: 1, transform:'translateX(-50%) translateY(0) scale(1)' }], 220);
    toastTimer = setTimeout(() => {
      const done = () => { if (revision !== toastRevision) return; if (typeof node.hidePopover === 'function' && node.matches(':popover-open')) node.hidePopover(); node.hidden = true; };
      const animation = animate(node, [{opacity:1,transform:'translateX(-50%) scale(1)'},{opacity:0,transform:'translateX(-50%) translateY(-6px) scale(.98)'}], 140);
      if (animation) animation.finished.then(done, () => {}); else done();
    }, 2400);
  }
  function bindDialogs() {
    document.querySelectorAll('dialog').forEach(dialog => dialog.addEventListener('cancel', event => {
      const prevented = event.defaultPrevented;
      event.preventDefault();
      if (!prevented) close(dialog);
    }));
  }
  window.StudioMotion = { open, close, grid, toast, bindDialogs };
})();
