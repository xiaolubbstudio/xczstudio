/*! 正经素材库 © 2026 小橙子工作室（XXCHENGZI）保留所有权利。未经书面许可，禁止复制、修改、传播或用于其他项目。详见 LICENSE。 */
(() => {
  'use strict';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const animations = new WeakMap();
  let inputMode = 'pointer';
  document.addEventListener('keydown', () => { inputMode = 'keyboard'; }, { capture: true });
  document.addEventListener('pointerdown', () => { inputMode = 'pointer'; }, { capture: true });

  // 灵动岛式弹簧：先快后稳，带一点回弹。曲线只由阻尼决定，时长另给。
  function spring(damping, samples = 56) {
    const w = 6.9 / damping, wd = w * Math.sqrt(1 - damping * damping), points = [];
    for (let i = 0; i <= samples; i++) {
      const t = i / samples;
      points.push(i === samples ? 1 : +(1 - Math.exp(-damping * w * t) * (Math.cos(wd * t) + damping * w / wd * Math.sin(wd * t))).toFixed(4));
    }
    return `linear(${points.join(', ')})`;
  }
  const supportsLinear = CSS.supports?.('transition-timing-function', 'linear(0, 1)');
  const EASE = {
    bounce: supportsLinear ? spring(.58) : 'cubic-bezier(.34,1.45,.64,1)',
    snappy: supportsLinear ? spring(.74) : 'cubic-bezier(.3,1.25,.6,1)',
    smooth: supportsLinear ? spring(.9) : 'cubic-bezier(.23,1,.32,1)',
    inertia: supportsLinear ? spring(.64) : 'cubic-bezier(.45,0,.3,1.12)',
    exit: 'cubic-bezier(.3,0,.8,.15)',
  };
  if (supportsLinear) for (const name of ['bounce', 'snappy', 'smooth']) document.documentElement.style.setProperty(`--spring-${name}`, EASE[name]);

  function animate(node, frames, duration = 220, delay = 0, easing = EASE.smooth, options = {}) {
    if (!node) return null;
    const previous = animations.get(node);
    if (previous?.playState === 'running' && !options.pseudoElement) {
      const style = getComputedStyle(node);
      frames[0] = { ...frames[0], opacity: style.opacity };
      if (frames.some(frame => 'transform' in frame)) frames[0].transform = style.transform;
    }
    if (!options.pseudoElement) previous?.cancel();
    if (reduced.matches || inputMode === 'keyboard') return null;
    try {
      const animation = node.animate(frames, { duration, delay, easing, fill: 'backwards', ...options });
      if (!options.pseudoElement) animations.set(node, animation);
      return animation;
    } catch { return null; }
  }
  function open(dialog) {
    dialog.classList.remove('is-closing');
    if (!dialog.open) dialog.showModal();
    animate(dialog, [{ opacity: 0, transform: 'translateY(22px) scale(.9)' }, { opacity: 1, offset: .3 }, { opacity: 1, transform: 'none' }], 620, 0, EASE.bounce);
    animate(dialog, [{ opacity: 0 }, { opacity: 1 }], 260, 0, 'ease-out', { pseudoElement: '::backdrop' });
  }
  function close(dialog) {
    if (!dialog.open || dialog.classList.contains('is-closing')) return;
    dialog.classList.add('is-closing');
    const animation = animate(dialog, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(10px) scale(.94)' }], 180, 0, EASE.exit, { fill: 'forwards' });
    animate(dialog, [{ opacity: 1 }, { opacity: 0 }], 180, 0, 'ease-in', { pseudoElement: '::backdrop', fill: 'forwards' });
    const complete = () => { if (dialog.classList.contains('is-closing')) { dialog.close(); dialog.classList.remove('is-closing'); dialog.getAnimations({ subtree: true }).forEach(item => item.cancel()); } };
    if (animation) { animation.finished.then(complete, () => {}); setTimeout(complete, 240); } else complete();
  }
  const gridContexts = new WeakMap();
  function grid(node, children, context) {
    const sameContext = gridContexts.has(node) && gridContexts.get(node) === context;
    gridContexts.set(node, context);
    // 不把另一个目录的卡片坐标带到这里；屏幕外的旧坐标也不作滑动起点。
    const positions = new Map(sameContext ? [...node.children].map(card => [card.dataset.id, card.getBoundingClientRect()]).filter(([, box]) => box.top < innerHeight && box.bottom > 0) : []);
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
          // 缓存目录换成最新目录也可能改变行高，仍在最终位置换入。
          animate(card, [{ opacity:.65 }, { opacity:1 }], 180, 0, EASE.smooth);
        } else if (!old && entered < 10) {
          animate(card, [{ opacity:0 }, { opacity:1 }], 200, Math.min(entered++*12, 72), EASE.smooth);
        }
      }
    }
    if (focusedId) {
      const replacement = children.find(card => card.dataset.id === focusedId);
      [...(replacement?.querySelectorAll('button,a') || [])].find(button => button.classList.contains(focusedClass))?.focus({ preventScroll: true });
    }
  }
  // 选中底色在分类之间滑动；没有选中分类（收藏、回收站）时收起。
  const indicators = new WeakMap();
  function place(node, target) {
    node.style.width = `${target.offsetWidth}px`;
    node.style.height = `${target.offsetHeight}px`;
    node.style.translate = `${target.offsetLeft}px ${target.offsetTop}px`;
  }
  function indicator(node, target) {
    if (!node) return;
    let state = indicators.get(node);
    if (!state) {
      state = { target: null };
      indicators.set(node, state);
      // 窗口或字体变化时直接贴合，不播放滑动。
      new ResizeObserver(() => {
        if (!state.target?.isConnected) return;
        node.classList.remove('is-ready'); place(node, state.target);
        requestAnimationFrame(() => requestAnimationFrame(() => node.classList.add('is-ready')));
      }).observe(node.parentElement);
    }
    state.target = target;
    node.classList.toggle('is-hidden', !target);
    if (!target) return;
    place(node, target);
    if (!node.classList.contains('is-ready')) requestAnimationFrame(() => requestAnimationFrame(() => node.classList.add('is-ready')));
  }
  // 内容换入：上一份/下一份左右滑入，标题等原地轻跳。
  function swap(root, direction = 0, selector) {
    const nodes = selector ? [...root.querySelectorAll(selector)] : [root];
    nodes.forEach((node, index) => animate(node, [{ opacity: 0, transform: direction ? `translateX(${direction * 22}px)` : 'translateY(8px) scale(.98)' }, { opacity: 1, offset: .4 }, { opacity: 1, transform: 'none' }], 520, Math.min(index * 18, 90), EASE.snappy));
  }

  // 标题和数量一起更新：同一路径上下换行，换路径或换行布局时轻轻越位再回弹。
  const headings = new WeakMap();
  function heading(root, update, context) {
    const previous = headings.get(root);
    const targets = ['#breadcrumb', '#results-text'].map(selector => root.querySelector(selector));
    const rootBefore = root.getBoundingClientRect();
    const before = targets.map(node => {
      const box = node.getBoundingClientRect();
      const lines = [...node.querySelectorAll(':scope > .heading-line, :scope > .heading-outgoing')];
      // 连续切换时，接住当前可见最多的那行文字，而不是重新从起点播放。
      const visibleHeight = line => {
        const rect = line.getBoundingClientRect();
        return Math.max(0, Math.min(box.bottom, rect.bottom) - Math.max(box.top, rect.top));
      };
      const line = lines.sort((a, b) => visibleHeight(b) - visibleHeight(a))[0];
      const copy = document.createElement(node.id === 'breadcrumb' ? 'div' : 'span');
      copy.className = node.id === 'breadcrumb' ? 'breadcrumb heading-outgoing' : 'heading-outgoing';
      copy.append(...[...(line || node).childNodes].map(child => child.cloneNode(true)));
      for (const child of copy.querySelectorAll('[id]')) child.removeAttribute('id');
      copy.setAttribute('aria-hidden', 'true'); copy.inert = true;
      const lineSize = parseFloat(getComputedStyle(node.querySelector('h2') || node).fontSize);
      return { box, copy, lineSize, transform: line ? getComputedStyle(line).transform : 'none', text: copy.textContent };
    });
    previous?.stop();
    update();
    const rootAfter = root.getBoundingClientRect();
    const after = targets.map(node => node.getBoundingClientRect());
    const state = { context, stop: () => {} };
    headings.set(root, state);
    if (!previous || reduced.matches) return;
    const samePath = previous.context.path === context.path;
    const rolls = samePath && before.every(({ box, lineSize }, index) =>
      Math.max(box.height, after[index].height) < lineSize * 1.8 &&
      Math.abs(box.height - after[index].height) < 2 &&
      Math.abs((box.top - rootBefore.top) - (after[index].top - rootAfter.top)) < 2);
    const order = ['all', 'image', 'video', 'audio'];
    const direction = order.indexOf(context.type) < order.indexOf(previous.context.type) ? -1 : 1;
    const running = [], cleanups = [];
    const play = (node, frames, duration, easing) => {
      const animation = node.animate(frames, { duration, easing, fill: 'both' });
      running.push(animation);
    };
    targets.forEach((node, index) => {
      const old = before[index], box = after[index];
      if (!box.width || !box.height) return;
      const dx = old.box.left - box.left, dy = old.box.top - box.top;
      if (rolls) {
        if (old.text !== node.textContent || node.id === 'breadcrumb' && previous.context.type !== context.type) {
          const incoming = document.createElement(node.id === 'breadcrumb' ? 'div' : 'span');
          incoming.className = node.id === 'breadcrumb' ? 'breadcrumb heading-line' : 'heading-line';
          incoming.append(...node.childNodes);
          node.append(incoming, old.copy);
          node.classList.add('heading-rolling');
          // 退出行只移动不缩放；进入行在最终位置稍微越位，然后停稳。
          play(old.copy, [{ transform: old.transform, opacity: 1 }, { transform: `translateY(${-direction * box.height}px)`, opacity: 0 }], 360, 'cubic-bezier(.42,0,.58,1)');
          play(incoming, [{ transform: `translateY(${direction * box.height}px)` }, { transform: 'translateY(0)' }], 620, EASE.inertia);
          cleanups.push(() => {
            node.replaceChildren(...incoming.childNodes);
            node.classList.remove('heading-rolling');
          });
        }
        if (Math.abs(dx) > .5 || Math.abs(dy) > .5) play(node,
          [{ transform: `translate(${dx}px,${dy}px)` }, { transform: 'none' }], 620, EASE.inertia);
      } else {
        const scale = old.box.width ? Math.max(.88, Math.min(1.12, old.box.width / box.width)) : .94;
        play(node, [{ transform: `translate(${dx}px,${dy}px) scale(${scale},.94)`, opacity: .3 }, { transform: 'none', opacity: 1 }], 640, EASE.inertia);
      }
    });
    let stopped = false;
    state.stop = () => {
      if (stopped) return;
      stopped = true;
      running.forEach(animation => animation.cancel());
      cleanups.forEach(cleanup => cleanup());
    };
    Promise.all(running.map(animation => animation.finished.catch(() => {}))).then(() => {
      if (headings.get(root) === state) state.stop();
    });
  }
  // 底部胶囊（多选操作条）像灵动岛一样从下方展开、收回。
  function reveal(node) {
    node.dataset.state = 'shown'; node.hidden = false;
    animate(node, [{ opacity: 0, transform: 'translateX(-50%) translateY(18px) scale(.55, .8)' }, { opacity: 1, offset: .3 }, { opacity: 1, transform: 'translateX(-50%) scale(1)' }], 640, 0, EASE.bounce);
  }
  function conceal(node) {
    node.dataset.state = 'hidden';
    const animation = animate(node, [{ opacity: 1, transform: 'translateX(-50%) scale(1)' }, { opacity: 0, transform: 'translateX(-50%) translateY(16px) scale(.7)' }], 200, 0, EASE.exit, { fill: 'forwards' });
    const done = () => { if (node.dataset.state !== 'hidden') return; node.hidden = true; animation?.cancel(); };
    // 后台标签页可能暂停动画，计时兜底保证一定收起。
    if (animation) { animation.finished.then(done, () => {}); setTimeout(done, 260); } else done();
  }
  function pop(node) {
    animate(node, [{ transform: 'scale(.55)' }, { transform: 'scale(1)' }], 620, 0, EASE.bounce);
  }
  let toastTimer;
  let toastRevision = 0;
  function toast(message) {
    const node = document.querySelector('#toast');
    clearTimeout(toastTimer);
    const revision = ++toastRevision;
    const wasOpen = !node.hidden;
    node.textContent = message;
    node.hidden = false;
    if (typeof node.showPopover === 'function' && !node.matches(':popover-open')) node.showPopover();
    // 像灵动岛一样从顶部胶囊里展开；已显示时只轻轻换字。
    if (wasOpen) animate(node, [{ transform: 'translateX(-50%) scale(.94)' }, { transform: 'translateX(-50%) scale(1)' }], 460, 0, EASE.bounce);
    else animate(node, [{ opacity: 0, transform: 'translateX(-50%) scale(.42, .7)' }, { opacity: 1, offset: .3 }, { opacity: 1, transform: 'translateX(-50%) scale(1)' }], 640, 0, EASE.bounce);
    toastTimer = setTimeout(() => {
      const done = () => { if (revision !== toastRevision) return; if (typeof node.hidePopover === 'function' && node.matches(':popover-open')) node.hidePopover(); node.hidden = true; };
      const animation = animate(node, [{ opacity: 1, transform: 'translateX(-50%) scale(1)' }, { opacity: 0, transform: 'translateX(-50%) scale(.5, .7)' }], 220, 0, EASE.exit, { fill: 'forwards' });
      if (animation) animation.finished.then(done, () => {}); else done();
    }, 2200);
  }
  function bindDialogs() {
    document.querySelectorAll('dialog').forEach(dialog => dialog.addEventListener('cancel', event => {
      const prevented = event.defaultPrevented;
      event.preventDefault();
      if (!prevented) close(dialog);
    }));
  }
  // 文件夹展开、收起在最终位置淡入；拖拽排序仍用弹簧衔接新旧位置。
  function reflow(node, mutate, leaving = [], options = {}) {
    const visible = child => child.getClientRects().length > 0;
    const run = () => {
      const before = new Map([...node.children].filter(visible).map(child => [child, child.getBoundingClientRect()]));
      mutate();
      let entered = 0;
      for (const child of node.children) {
        if (!visible(child)) continue;
        const next = child.getBoundingClientRect(), old = before.get(child);
        if (next.top > innerHeight || next.bottom < 0) continue;
        if (!old) {
          if (options.stationary) animate(child, [{ opacity:0 }, { opacity:1 }], 200, Math.min(entered++*12,72), EASE.smooth);
          else animate(child, [{ opacity: 0, transform: 'translateY(-10px) scale(.94)' }, { opacity: 1, offset: .35 }, { opacity: 1, transform: 'none' }], 560, Math.min(entered++ * 30, 240), EASE.bounce);
        } else if (Math.abs(old.left - next.left) > 1 || Math.abs(old.top - next.top) > 1) {
          if (options.stationary) animate(child, [{ opacity:.65 }, { opacity:1 }], 180, 0, EASE.smooth);
          else animate(child, [{ transform: `translate(${old.left - next.left}px,${old.top - next.top}px)` }, { transform: 'none' }], 560, 0, EASE.snappy);
        }
      }
    };
    const exits = leaving.filter(visible).map(child => animate(child, options.stationary ? [{ opacity:1 }, { opacity:0 }] : [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-6px) scale(.96)' }], 150, 0, EASE.exit, { fill: 'forwards' })).filter(Boolean);
    if (!exits.length) { run(); return; }
    Promise.all(exits.map(item => item.finished.catch(() => {}))).then(() => { run(); exits.forEach(item => item.cancel()); });
  }
  window.StudioMotion = { open, close, grid, reflow, toast, bindDialogs, indicator, swap, heading, pop, reveal, conceal, ease: EASE };
})();
