(() => {
  'use strict';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const springs = new WeakMap();
  const animations = new WeakMap();
  const running = new Set();
  // Retarget the same spring: rapid presses retain velocity instead of restarting.
  function spring(node, target, initial) {
    if (!node || reduced.matches) return;
    let state = springs.get(node);
    if (!state) { state = { x: initial ?? 1, v: 0, target, frame: 0 }; springs.set(node, state); }
    else if (initial !== undefined) state.x = Math.min(state.x, initial);
    state.target = target;
    if (state.frame) return;
    let last = performance.now();
    running.add(node);
    function step(now) {
      if (!node.isConnected || reduced.matches) { finish(); return; }
      const dt = Math.min((now - last) / 1000, .032); last = now;
      // Substeps keep the physical spring stable on lower frame-rate devices.
      const steps = Math.max(1, Math.ceil(dt / .008));
      for (let i = 0; i < steps; i++) {
        state.v += (650 * (state.target - state.x) - 34 * state.v) * dt / steps;
        state.x += state.v * dt / steps;
      }
      node.style.scale = String(state.x);
      if (Math.abs(state.target - state.x) < .0005 && Math.abs(state.v) < .005) { finish(); return; }
      state.frame = requestAnimationFrame(step);
    }
    function finish() { state.frame = 0; state.x = state.target; state.v = 0; node.style.scale = state.target === 1 ? '' : String(state.target); running.delete(node); }
    state.frame = requestAnimationFrame(step);
  }
  function animate(node, frames, options) {
    const old = animations.get(node);
    // Start at the current visual state when a dialog is interrupted.
    const current = old ? { opacity: getComputedStyle(node).opacity, transform: getComputedStyle(node).transform, ...(frames[0].width ? { width: getComputedStyle(node).width } : {}) } : null;
    old?.cancel();
    if (reduced.matches) return null;
    const animation = node.animate(current ? [current, ...frames.slice(1)] : frames, options);
    animations.set(node, animation);
    animation.finished.then(() => { if (animations.get(node) === animation) { animations.delete(node); animation.cancel(); } }, () => {});
    return animation;
  }
  const ease = 'cubic-bezier(.2,.8,.2,1)';
  function open(dialog) {
    dialog.classList.remove('is-closing');
    if (!dialog.open) dialog.showModal();
    animate(dialog, [{ opacity: 0, transform: 'translateY(12px) scale(.96)' }, { opacity: 1, transform: 'translateY(0) scale(1)' }], { duration: 260, easing: ease });
  }
  function close(dialog) {
    if (!dialog.open || dialog.classList.contains('is-closing')) return;
    dialog.classList.add('is-closing');
    const animation = animate(dialog, [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'translateY(6px) scale(.97)' }], { duration: 150, easing: ease });
    const complete = () => { if (dialog.classList.contains('is-closing')) { dialog.close(); dialog.classList.remove('is-closing'); } };
    if (animation) animation.finished.then(complete, () => {}); else complete();
  }
  function grid(node, children) {
    const positions = new Map([...node.children].map(card => [card.dataset.id, card.getBoundingClientRect()]));
    const focused = document.activeElement;
    const focusedId = focused?.closest('.asset-card')?.dataset.id;
    const focusedClass = focused?.classList?.[0];
    node.replaceChildren(...children);
    children.forEach((card, index) => {
      const rect = card.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > innerHeight) return;
      const previous = positions.get(card.dataset.id);
      if (previous) {
        const x = previous.left - rect.left, y = previous.top - rect.top;
        if (Math.abs(x) + Math.abs(y) > 1) animate(card, [{ transform: `translate(${x}px,${y}px)` }, { transform: 'translate(0,0)' }], { duration: 260, easing: ease });
      } else animate(card, [{ opacity: 0, transform: 'translateY(10px) scale(.98)' }, { opacity: 1, transform: 'translateY(0) scale(1)' }], { duration: 240, delay: Math.min(index * 22, 110), easing: ease, fill: 'backwards' });
    });
    if (focusedId) {
      const replacement = children.find(card => card.dataset.id === focusedId);
      [...(replacement?.querySelectorAll('button') || [])].find(button => button.classList.contains(focusedClass))?.focus({ preventScroll: true });
    }
  }
  let toastTimer;
  function toast(message) {
    const node = document.querySelector('#toast');
    clearTimeout(toastTimer);
    const visible = !node.hidden;
    const previousWidth = visible ? node.getBoundingClientRect().width : 48;
    node.textContent = message;
    node.hidden = false;
    if (typeof node.showPopover === 'function' && !node.matches(':popover-open')) node.showPopover();
    node.style.width = '';
    const width = node.getBoundingClientRect().width;
    spring(node, 1, visible ? undefined : .86);
    animate(node, [{ width: `${previousWidth}px`, opacity: visible ? 1 : 0, transform: 'translate(-50%, -8px)' }, { width: `${width}px`, opacity: 1, transform: 'translate(-50%, 0)' }], { duration: 240, easing: ease });
    toastTimer = setTimeout(() => {
      const out = animate(node, [{ opacity: 1, transform: 'translate(-50%,0) scale(1)' }, { opacity: 0, transform: 'translate(-50%,-8px) scale(.94)' }], { duration: 160, easing: ease });
      const hide = () => { if (typeof node.hidePopover === 'function' && node.matches(':popover-open')) node.hidePopover(); node.hidden = true; };
      if (out) out.finished.then(hide, () => {}); else hide();
    }, 2600);
  }
  const targetFor = target => target instanceof Element ? target.closest('button:not(:disabled), a[href], label.button, select, summary') : null;
  const held = new Map();
  document.addEventListener('pointerdown', event => {
    const node = targetFor(event.target);
    if (!node) return;
    held.set(event.pointerId, node);
    spring(node, node.classList.contains('favorite-button') ? .85 : .965);
  });
  function release(event) { const node = held.get(event.pointerId); held.delete(event.pointerId); spring(node, 1); }
  document.addEventListener('pointerup', release);
  document.addEventListener('pointercancel', release);
  window.addEventListener('blur', () => { held.forEach(node => spring(node, 1)); held.clear(); });
  document.addEventListener('click', event => {
    const node = targetFor(event.target);
    if (node && event.detail === 0) spring(node, 1, .965);
    const card = node?.matches('.preview-button,.card-title') ? node.closest('.asset-card') : null;
    if (card) spring(card, 1, .985);
  }, true);
  function bindDialogs() { document.querySelectorAll('dialog').forEach(dialog => dialog.addEventListener('cancel', event => {
    // Other listeners may veto closing an upload that is still in progress.
    const prevented = event.defaultPrevented;
    event.preventDefault();
    if (!prevented) close(dialog);
  })); }
  reduced.addEventListener('change', () => {
    if (!reduced.matches) return;
    running.forEach(node => { const state = springs.get(node); cancelAnimationFrame(state.frame); state.frame = 0; node.style.scale = ''; });
    running.clear();
    document.getAnimations().forEach(animation => animation.finish());
  });
  window.StudioMotion = { open, close, grid, toast, bindDialogs };
})();
