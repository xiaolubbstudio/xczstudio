(() => {
  'use strict';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const animations = new WeakMap();
  function animate(node, frames, duration = 120) {
    animations.get(node)?.cancel();
    if (reduced.matches) return null;
    const animation = node.animate(frames, { duration, easing: 'ease-out' });
    animations.set(node, animation);
    return animation;
  }
  function open(dialog) {
    dialog.classList.remove('is-closing');
    if (!dialog.open) dialog.showModal();
    animate(dialog, [{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'translateY(0)' }]);
  }
  function close(dialog) {
    if (!dialog.open || dialog.classList.contains('is-closing')) return;
    dialog.classList.add('is-closing');
    const animation = animate(dialog, [{ opacity: 1 }, { opacity: 0 }], 90);
    const complete = () => { if (dialog.classList.contains('is-closing')) { dialog.close(); dialog.classList.remove('is-closing'); } };
    if (animation) animation.finished.then(complete, () => {}); else complete();
  }
  function grid(node, children) {
    const focused = document.activeElement;
    const focusedId = focused?.closest('.asset-card')?.dataset.id;
    const focusedClass = focused?.classList?.[0];
    node.replaceChildren(...children);
    if (focusedId) {
      const replacement = children.find(card => card.dataset.id === focusedId);
      [...(replacement?.querySelectorAll('button,a') || [])].find(button => button.classList.contains(focusedClass))?.focus({ preventScroll: true });
    }
  }
  let toastTimer;
  function toast(message) {
    const node = document.querySelector('#toast');
    clearTimeout(toastTimer);
    node.textContent = message;
    node.hidden = false;
    if (typeof node.showPopover === 'function' && !node.matches(':popover-open')) node.showPopover();
    animate(node, [{ opacity: 0 }, { opacity: 1 }]);
    toastTimer = setTimeout(() => {
      if (typeof node.hidePopover === 'function' && node.matches(':popover-open')) node.hidePopover();
      node.hidden = true;
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
