/*! 正经素材库 © 2026 小橙子工作室（XXCHENGZI）保留所有权利。未经书面许可，禁止复制、修改、传播或用于其他项目。详见 LICENSE。 */
// 小动效：右侧圆形气泡和底部分类图标的悬停、点击动画。按迪士尼动画 12 原则来做：
// 预备动作（先往反方向收一下）、挤压与拉伸、夸张、跟随与重叠（几个部件错开时间）、慢入慢出、
// 弧线运动（烟花按抛物线落下）、次要动作（闪光、彩色碎片）、时间节奏与吸引力。系统要求减少动态时全部跳过。
(() => {
  'use strict';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const SVG = 'http://www.w3.org/2000/svg';
  const EASE = window.StudioMotion?.ease || {};
  const BOUNCE = EASE.bounce || 'cubic-bezier(.34,1.45,.64,1)';
  const SNAPPY = EASE.snappy || 'cubic-bezier(.3,1.25,.6,1)';
  const BACK = 'cubic-bezier(.34,1.5,.64,1)';
  const IN = 'cubic-bezier(.55,0,.85,.35)';
  const OUT = 'cubic-bezier(.2,.8,.3,1)';
  const COLORS = ['#ff8a3d', '#ff375f', '#ffd60a', '#30d158', '#0a84ff', '#bf5af2'];
  const $ = selector => document.querySelector(selector);
  const play = (node, frames, options) => {
    if (!node || reduced.matches) return null;
    try { return node.animate(frames, { fill: 'none', ...options }); } catch { return null; }
  };
  const done = animation => animation ? animation.finished.catch(() => {}) : Promise.resolve();
  function icon(markup, className = '') {
    const svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('class', `icon ${className}`.trim());
    svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = `<g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${markup}</g>`;
    return svg;
  }
  const center = node => { const r = node.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };

  // ---------- 彩色烟花：放在最上层，弹窗打开后也盖得住。 ----------
  let layer = null, live = 0;
  function fxLayer() {
    if (!layer) {
      layer = document.createElement('div');
      layer.className = 'fx-layer'; layer.setAttribute('popover', 'manual'); layer.setAttribute('aria-hidden', 'true');
      document.body.append(layer);
    }
    try { if (layer.matches(':popover-open')) layer.hidePopover(); layer.showPopover(); } catch { /* 不支持时退回普通层 */ }
    return layer;
  }
  function fireworks(x, y, { count = 16, power = 70, ring = false } = {}) {
    if (reduced.matches) return;
    const host = fxLayer();
    const finish = piece => { piece.remove(); if (--live <= 0) { live = 0; try { layer.hidePopover(); } catch { /* 已关闭 */ } } };
    if (ring) {
      const wave = document.createElement('i'); wave.className = 'fx-ring';
      wave.style.left = `${x}px`; wave.style.top = `${y}px`; host.append(wave); live++;
      wave.animate([{ transform: 'scale(.3)', opacity: .9 }, { transform: 'scale(2.6)', opacity: 0 }], { duration: 560, easing: OUT, fill: 'forwards' }).finished.then(() => finish(wave), () => finish(wave));
    }
    for (let i = 0; i < count; i++) {
      const piece = document.createElement('i');
      piece.className = `fx-piece${i % 3 === 1 ? ' is-strip' : i % 3 === 2 ? ' is-star' : ''}`;
      piece.style.background = COLORS[(i + Math.floor(Math.random() * 6)) % COLORS.length];
      piece.style.left = `${x}px`; piece.style.top = `${y}px`;
      host.append(piece); live++;
      // 向四周炸开、往上多冲一点，再在重力下沿抛物线落下（弧线运动），越飞越小、最后淡出。
      const angle = (i / count) * Math.PI * 2 + (Math.random() - .5) * .7;
      const speed = power * (.55 + Math.random() * .65);
      const vx = Math.cos(angle) * speed, vy = Math.sin(angle) * speed - power * .45, gravity = power * 1.5;
      const spin = (Math.random() - .5) * 900, duration = 720 + Math.random() * 420;
      const frames = [0, .15, .3, .45, .6, .75, .9, 1].map(t => ({
        offset: t,
        transform: `translate(${(vx * t).toFixed(1)}px, ${(vy * t + gravity * t * t).toFixed(1)}px) rotate(${(spin * t).toFixed(0)}deg) scale(${(1.15 - .75 * t).toFixed(2)})`,
        opacity: t < .65 ? 1 : 1 - (t - .65) / .35,
      }));
      piece.animate(frames, { duration, easing: 'cubic-bezier(.15,.65,.35,1)', fill: 'forwards' }).finished.then(() => finish(piece), () => finish(piece));
    }
  }
  const burstFrom = (node, options) => { const [x, y] = center(node); fireworks(x, y, options); };

  // ---------- 爱心：先压扁（预备），夸张地弹大并拨动一下，再左右摆几下停稳，弹出小烟花。 ----------
  function heart() {
    const button = $('#favorites-button'), svg = button?.querySelector('svg');
    play(svg, [
      { transform: 'scale(1) rotate(0deg)', easing: OUT },
      { transform: 'scale(1.18, .72) rotate(0deg)', offset: .14, easing: OUT },
      { transform: 'scale(.86, 1.38) rotate(-16deg)', offset: .34, easing: 'ease-in-out' },
      { transform: 'scale(1.12, .94) rotate(11deg)', offset: .54, easing: 'ease-in-out' },
      { transform: 'scale(.97, 1.04) rotate(-5deg)', offset: .74, easing: 'ease-in-out' },
      { transform: 'scale(1) rotate(0deg)' },
    ], { duration: 820 });
    if (button) setTimeout(() => burstFrom(button, { count: 14, power: 58 }), 240);
  }

  // ---------- 用户头像：转过身去（背面是黑色剪影），停一下，再转回来。指着就播放；
  // 正在播放时点击，不从头重来，而是加速把剩下的部分走完，紧接着完整播放一次点击动画，再打开账号窗口。 ----------
  const FLIP = [
    { transform: 'rotateY(0deg)', easing: OUT },
    { transform: 'rotateY(-24deg) scale(.94)', offset: .12, easing: 'cubic-bezier(.5,0,.3,1)' },
    { transform: 'rotateY(198deg) scale(1.06)', offset: .4, easing: 'ease-out' },
    { transform: 'rotateY(180deg) scale(1)', offset: .5 },
    { transform: 'rotateY(180deg) scale(1)', offset: .66, easing: 'cubic-bezier(.5,0,.3,1)' },
    { transform: 'rotateY(372deg) scale(1.03)', offset: .9, easing: 'ease-out' },
    { transform: 'rotateY(360deg) scale(1)' },
  ];
  function setupAvatar() {
    const button = $('#member-avatar');
    if (!button || button.querySelector('.flip')) return;
    const flip = document.createElement('span'); flip.className = 'flip';
    const front = document.createElement('span'); front.className = 'flip-face flip-front';
    front.append(...button.childNodes);
    const back = document.createElement('span'); back.className = 'flip-face flip-back';
    back.append(icon('<circle cx="12" cy="7.5" r="4.5" fill="currentColor"/><path d="M4 21v-2a8 6 0 0 1 16 0v2Z" fill="currentColor"/>', 'silhouette'));
    flip.append(front, back); button.append(flip);
    let turning = null, queued = false, passing = false;
    const turn = () => { turning = play(flip, FLIP, { duration: 1300 }); const mine = turning; done(mine).then(() => { if (turning === mine) turning = null; }); return mine; };
    // 点击动画：完整转一次，转到背面时打开账号窗口（舞台呈现）。
    const clickTurn = () => { turn(); setTimeout(() => { passing = true; button.click(); passing = false; }, 420); };
    button.addEventListener('pointerenter', event => { if (event.pointerType === 'mouse' && !turning && !queued) turn(); });
    button.addEventListener('click', event => {
      if (passing || reduced.matches) return;
      event.stopImmediatePropagation(); event.preventDefault();
      if (queued) return;
      if (turning && turning.playState === 'running') {
        // 正在转：剩下的部分加速走完，再接一次完整的点击动画。
        queued = true;
        const current = turning;
        current.updatePlaybackRate(3.2);
        done(current).then(() => { queued = false; clickTurn(); });
        return;
      }
      clickTurn();
    }, true);
  }

  // ---------- 刷新：按“转速”来转，速度始终连续变化，不会突然变快变慢。
  // 点击：先往回拧一下（预备），再加速到最快；刷新没完成就一直保持最快转着；完成后慢慢减速（至少 1.2 秒），
  // 停在箭头摆正的位置（图标转 180° 和原来一样）。指着（没在刷新）时匀速慢转，移开同样慢慢停下。
  // 点击引起的转动期间气泡反色。页面自己在读取目录时（比如刚打开）也按同样方式转。 ----------
  function setupRefresh() {
    const button = $('#refresh-button'), svg = button?.querySelector('svg');
    if (!svg) return;
    const FAST = 900, HOVER = 330; // 度/秒
    let angle = 0, speed = 0, hovering = false, clicked = false, clickedUntil = 0, windup = null, landing = null, frame = 0, last = 0;
    const loading = () => document.body.dataset.loading === 'true';
    const goal = now => loading() || now < clickedUntil ? FAST : hovering ? HOVER : 0;
    const draw = () => { svg.style.transform = `rotate(${angle.toFixed(2)}deg)`; };
    function tick(now) {
      const dt = Math.min(.05, Math.max(0, (now - last) / 1000)); last = now;
      const target = goal(now);
      if (clicked && target < FAST) clicked = false;
      button.classList.toggle('is-inverted', clicked);
      if (windup) {
        // 预备：0.16 秒往回拧 28°。
        const t = Math.min(1, (now - windup.start) / 160);
        angle = windup.from - 28 * (1 - (1 - t) ** 2);
        if (t >= 1) windup = null;
      } else if (landing && target === 0) {
        // 减速落位：三次缓出，起始速度等于当前转速，所以接得上。
        const t = Math.min(1, (now - landing.start) / landing.duration);
        angle = landing.from + landing.distance * (1 - (1 - t) ** 3);
        speed = 3 * landing.distance * (1 - t) ** 2 / (landing.duration / 1000);
        if (t >= 1) { landing = null; speed = 0; angle %= 360; draw(); frame = 0; return; }
      } else if (target === 0) {
        // 开始减速：按当前速度算一段至少 1.2 秒的缓出，停在下一个整半圈。
        const v = Math.max(speed, 90), stopAt = Math.ceil((angle + v * 1.2 / 3) / 180) * 180;
        landing = { start: now, from: angle, distance: stopAt - angle };
        landing.duration = Math.min(2600, 3 * landing.distance / v * 1000);
      } else {
        // 加速或换到指着时的速度：平滑地追上目标转速（约 0.45 秒到九成）。
        landing = null;
        speed += (target - speed) * Math.min(1, dt * 5);
        angle += speed * dt;
      }
      draw();
      frame = requestAnimationFrame(tick);
    }
    const run = () => { if (!frame && !reduced.matches) { last = performance.now(); frame = requestAnimationFrame(tick); } };
    button.addEventListener('pointerenter', event => { if (event.pointerType === 'mouse') { hovering = true; run(); } });
    button.addEventListener('pointerleave', () => { hovering = false; });
    button.addEventListener('click', () => {
      if (reduced.matches) return;
      clicked = true;
      clickedUntil = performance.now() + 700; // 刷新再快，也先转到最快再慢慢停。
      if (speed < FAST * .4 && !windup) windup = { start: performance.now(), from: angle };
      run();
    });
    // 读取目录开始（不管是不是点出来的）就转起来；结束后由上面自然减速。
    new MutationObserver(() => { if (loading()) run(); }).observe(document.body, { attributes: true, attributeFilter: ['data-loading'] });
    if (loading()) run();
  }

  // ---------- 上传：指着时能量从底部往上充盈，满了小小爆一下放烟花；点击直接爆炸。 ----------
  function setupUpload() {
    const button = $('#upload-button');
    if (!button) return;
    const energy = document.createElement('span'); energy.className = 'energy'; energy.setAttribute('aria-hidden', 'true');
    button.prepend(energy);
    let charge = null, spent = false;
    const pop = (scale = 1.22) => play(button.querySelector('svg'), [
      { transform: 'scale(1)' }, { transform: `scale(${scale * 1.06}, ${scale * .88})`, offset: .3 },
      { transform: 'scale(.9, 1.1)', offset: .55 }, { transform: 'scale(1.04, .97)', offset: .78 }, { transform: 'scale(1)' },
    ], { duration: 520, easing: 'ease-out' });
    const drain = (fast) => {
      button.classList.remove('is-charging');
      if (!charge) return;
      const current = getComputedStyle(energy).translate;
      charge.cancel(); charge = null;
      play(energy, [{ translate: current === 'none' ? '0 0' : current, opacity: 1 }, { translate: '0 115%', opacity: fast ? 0 : 1 }], { duration: fast ? 260 : 380, easing: 'cubic-bezier(.4,0,.6,1)' });
    };
    const blast = (big) => {
      drain(true);
      pop(big ? 1.3 : 1.2);
      play(energy, [{ translate: '0 0', opacity: 1, transform: 'scale(1)' }, { translate: '0 0', opacity: 0, transform: 'scale(1.4)' }], { duration: 320, easing: OUT });
      burstFrom(button, big ? { count: 26, power: 92, ring: true } : { count: 18, power: 70, ring: true });
    };
    button.addEventListener('pointerenter', event => {
      if (event.pointerType !== 'mouse' || spent || charge || reduced.matches) return;
      button.classList.add('is-charging');
      // 慢入：开始慢、逐渐加快地涨满，像在蓄力。
      charge = play(energy, [{ translate: '0 115%' }, { translate: '0 0%' }], { duration: 1300, easing: 'cubic-bezier(.4,0,.75,.75)', fill: 'forwards' });
      const mine = charge;
      done(mine).then(() => { if (charge === mine && mine.playState === 'finished') { spent = true; blast(false); } });
    });
    button.addEventListener('pointerleave', () => { spent = false; drain(false); });
    button.addEventListener('click', () => { spent = true; blast(true); });
  }

  // ---------- 三条线：指着时按随机顺序依次从左边弹出（只横向伸缩）；点击时自上而下依次以左端为轴抖一下。 ----------
  function setupTools() {
    const button = $('#tools-button');
    if (!button) return;
    const svg = icon('<path class="bar" d="M4 5h16"/><path class="bar" d="M4 12h16"/><path class="bar" d="M4 19h16"/>', 'bars');
    button.replaceChildren(svg);
    const bars = [...svg.querySelectorAll('.bar')];
    let busy = false;
    button.addEventListener('pointerenter', event => {
      if (event.pointerType !== 'mouse' || busy || reduced.matches) return;
      busy = true;
      const order = [0, 1, 2].sort(() => Math.random() - .5);
      const runs = order.map((index, step) => play(bars[index], [
        { transform: 'scaleX(0)', easing: OUT },
        { transform: 'scaleX(1.2)', offset: .55, easing: 'ease-in-out' },
        { transform: 'scaleX(.93)', offset: .78, easing: 'ease-in-out' },
        { transform: 'scaleX(1)' },
      ], { duration: 560, delay: step * 80, fill: 'backwards' }));
      Promise.all(runs.map(done)).then(() => { busy = false; });
    });
    button.addEventListener('click', () => {
      bars.forEach((bar, index) => play(bar, [
        { transform: 'rotate(0deg)', easing: 'ease-out' },
        { transform: 'rotate(11deg)', offset: .2, easing: 'ease-in-out' },
        { transform: 'rotate(-8deg)', offset: .42, easing: 'ease-in-out' },
        { transform: 'rotate(4deg)', offset: .64, easing: 'ease-in-out' },
        { transform: 'rotate(-1.5deg)', offset: .84, easing: 'ease-in-out' },
        { transform: 'rotate(0deg)' },
      ], { duration: 560, delay: index * 70 }));
    });
  }

  // ---------- 全部素材：还是原来的四个小圆角方块（中间留空、不变成实心魔方），只是模仿魔方的动作：
  // 先缩一下（预备），整组倾斜成立体并稍微放大；上排绕竖轴翻 180°、右列绕横轴翻 180°，翻到一半时这一层朝你浮起，
  // 翻过去露出背面的魔方颜色（打乱）；再按相反顺序翻回来（复原），放平、回弹。 ----------
  const U = 1 / 24;
  const CUBIES = [['a', 3, 3, '#ff8a3d'], ['b', 14, 3, '#0a84ff'], ['c', 3, 14, '#ffd60a'], ['d', 14, 14, '#30d158']];
  const em = units => `${(units * U).toFixed(4)}em`;
  function cubeIcon() {
    const box = document.createElement('span'); box.className = 'icon cube-icon'; box.setAttribute('aria-hidden', 'true');
    const cube = document.createElement('span'); cube.className = 'cube';
    for (const [name, x, y, color] of CUBIES) {
      const cubie = document.createElement('i'); cubie.className = `cubie cubie-${name}`;
      cubie.style.left = `${x / 24 * 100}%`; cubie.style.top = `${y / 24 * 100}%`;
      const front = document.createElement('i'); front.className = 'face';
      const back = document.createElement('i'); back.className = 'face back'; back.style.background = color;
      cubie.append(front, back); cube.append(cubie);
    }
    box.append(cube);
    return box;
  }
  function spinCube(box) {
    if (reduced.matches) return;
    const cube = box.querySelector('.cube'), T = 1500, at = ms => ms / T;
    box.classList.add('is-3d');
    const whole = play(cube, [
      { transform: 'rotateX(0deg) rotateY(0deg) scale(1)', easing: OUT },
      { transform: 'rotateX(10deg) rotateY(12deg) scale(.86)', offset: at(110), easing: 'cubic-bezier(.4,0,.2,1)' },
      { transform: 'rotateX(-36deg) rotateY(-40deg) scale(1.28)', offset: at(340) },
      { transform: 'rotateX(-36deg) rotateY(-40deg) scale(1.28)', offset: at(1260), easing: BACK },
      { transform: 'rotateX(0deg) rotateY(0deg) scale(1)' },
    ], { duration: T });
    // 翻转前半段慢入，后半段带一点过头落位；中点这一层朝你浮起 3 个单位。
    const times = [0, 110, 340, 380, 490, 600, 640, 750, 860, 900, 990, 1080, 1110, 1200, 1290, T];
    const starts = [380, 640, 900, 1110], mids = [490, 750, 990, 1200];
    const upper = ms => ms <= 380 ? 0 : ms === 490 ? 90 : ms < 1200 ? 180 : ms === 1200 ? 90 : 0;
    const right = ms => ms <= 640 ? 0 : ms === 750 ? 90 : ms < 990 ? 180 : ms === 990 ? 90 : 0;
    for (const [name, x, y] of CUBIES) {
      const dx = em(12 - (x + 3.5)), dy = em(12 - (y + 3.5)), ndx = em(-(12 - (x + 3.5))), ndy = em(-(12 - (y + 3.5)));
      // 上排是 a、b；上排翻过去以后，右列是原来左上的 a 和右下的 d。
      const inTop = name === 'a' || name === 'b', inRight = name === 'a' || name === 'd';
      const lift = ms => (inTop && (ms === 490 || ms === 1200)) || (inRight && (ms === 750 || ms === 990)) ? em(3) : '0em';
      play(box.querySelector(`.cubie-${name}`), times.map(ms => ({
        offset: at(ms),
        easing: starts.includes(ms) ? 'cubic-bezier(.45,0,.8,.5)' : mids.includes(ms) ? BACK : 'ease-in-out',
        transform: `translateZ(${lift(ms)}) translateY(${dy}) rotateX(${inRight ? right(ms) : 0}deg) translateY(${ndy}) translateX(${dx}) rotateY(${inTop ? upper(ms) : 0}deg) translateX(${ndx})`,
      })), { duration: T });
    }
    done(whole).then(() => box.classList.remove('is-3d'));
  }

  // ---------- 图片：快门闪一下、轻微放大后慢慢缩回；镜头往后拉，小山从下方、太阳从上方入镜。 ----------
  function imageIcon() {
    return icon(`<defs><clipPath id="fx-photo-clip"><rect x="4" y="4" width="16" height="16" rx="2"/></clipPath></defs>
      <g clip-path="url(#fx-photo-clip)"><g class="scene"><path class="mountain" d="m3 16 5-5 4 4 3-3 6 6"/><circle class="sun" cx="15.5" cy="7.5" r="1.2" fill="currentColor" stroke="none"/></g></g>
      <rect x="3" y="3" width="18" height="18" rx="3"/><rect class="flash" x="3" y="3" width="18" height="18" rx="3" fill="currentColor" stroke="none" opacity="0"/>`, 'photo');
  }
  function shoot(svg) {
    play(svg.querySelector('.flash'), [{ opacity: 0 }, { opacity: .95, offset: .12 }, { opacity: 0 }], { duration: 380, easing: 'ease-out' });
    play(svg, [{ transform: 'scale(1)' }, { transform: 'scale(1.16)', offset: .1 }, { transform: 'scale(1)' }], { duration: 900, easing: OUT });
    play(svg.querySelector('.scene'), [{ transform: 'scale(1.7)' }, { transform: 'scale(1)' }], { duration: 760, delay: 120, easing: OUT, fill: 'backwards' });
    play(svg.querySelector('.mountain'), [{ transform: 'translateY(10px)' }, { transform: 'translateY(-1px)', offset: .7 }, { transform: 'translateY(0)' }], { duration: 620, delay: 160, easing: OUT, fill: 'backwards' });
    play(svg.querySelector('.sun'), [{ transform: 'translateY(-9px) scale(.6)' }, { transform: 'translateY(.8px) scale(1.25)', offset: .7 }, { transform: 'translateY(0) scale(1)' }], { duration: 640, delay: 260, easing: OUT, fill: 'backwards' });
  }

  // ---------- 视频：胶片自上而下转起来、放映机微微抖，最后“咔嚓”一下定格。 ----------
  function filmIcon() {
    let holes = '';
    for (let y = -18; y <= 22; y += 4) holes += `M3 ${y}h3M18 ${y}h3`;
    return icon(`<defs><clipPath id="fx-film-clip"><rect x="2.5" y="5" width="19" height="14" rx="3"/></clipPath></defs>
      <rect x="2.5" y="5" width="19" height="14" rx="3"/><path d="M6 5v14m12-14v14"/>
      <g clip-path="url(#fx-film-clip)"><path class="holes" d="${holes}"/></g>
      <path class="play" d="m10 9 4 3-4 3z" fill="currentColor" stroke="none"/>`, 'film');
  }
  function roll(svg) {
    play(svg.querySelector('.holes'), [
      { transform: 'translateY(-24px)', easing: 'cubic-bezier(.3,.5,.6,1)' },
      { transform: 'translateY(.9px)', offset: .86, easing: 'ease-out' },
      { transform: 'translateY(0)' },
    ], { duration: 820 });
    play(svg.querySelector('.play'), [{ opacity: 1 }, { opacity: .25, offset: .15 }, { opacity: .9, offset: .3 }, { opacity: .3, offset: .45 }, { opacity: .85, offset: .6 }, { opacity: .35, offset: .75 }, { opacity: 1, offset: .86 }, { opacity: 1 }], { duration: 820 });
    play(svg, [
      { transform: 'translateX(0)' }, { transform: 'translateX(.6px)', offset: .2 }, { transform: 'translateX(-.6px)', offset: .4 },
      { transform: 'translateX(.5px)', offset: .6 }, { transform: 'translateX(0) scale(1)', offset: .84 },
      { transform: 'scale(1.14, .9)', offset: .9 }, { transform: 'scale(1)' },
    ], { duration: 900, easing: 'linear' });
  }

  // ---------- 音频：一个小点从上方落下（越落越快），着地压扁、轻轻弹一下，长成音符。 ----------
  function noteIcon() {
    return icon(`<path class="stem" pathLength="1" d="M9 17V5"/><path class="beam" pathLength="1" d="M9 5l11-2v12"/><path class="beam2" pathLength="1" d="M9 9l11-2"/>
      <ellipse class="head head1" cx="6" cy="18" rx="3" ry="2.5"/><ellipse class="head head2" cx="17" cy="16" rx="3" ry="2.5"/>
      <circle class="drop" cx="6" cy="18" r="1.7" fill="currentColor" stroke="none" opacity="0"/>`, 'notes');
  }
  function sing(svg) {
    const drop = svg.querySelector('.drop');
    play(drop, [
      { opacity: 1, transform: 'translateY(-20px)', easing: IN },
      { opacity: 1, transform: 'translateY(0) scale(1)', offset: .4, easing: 'ease-out' },
      { opacity: 1, transform: 'translateY(.6px) scale(1.8, .5)', offset: .46, easing: 'ease-out' },
      { opacity: 1, transform: 'translateY(-4px) scale(.9, 1.15)', offset: .6, easing: IN },
      { opacity: 1, transform: 'translateY(0) scale(1.3, .75)', offset: .7, easing: 'ease-out' },
      { opacity: 0, transform: 'translateY(0) scale(1.8)' },
    ], { duration: 760, fill: 'backwards' });
    // 落地后一口气长出来：符头、符干、符杠几乎连在一起，最后第二个符头弹出。
    const grow = [{ transform: 'scale(0)' }, { transform: 'scale(1.25)', offset: .6 }, { transform: 'scale(.94)', offset: .8 }, { transform: 'scale(1)' }];
    play(svg.querySelector('.head1'), grow, { duration: 320, delay: 520, easing: OUT, fill: 'backwards' });
    const draw = [{ strokeDasharray: '1 1', strokeDashoffset: 1 }, { strokeDasharray: '1 1', strokeDashoffset: 0 }];
    play(svg.querySelector('.stem'), draw, { duration: 150, delay: 570, easing: OUT, fill: 'backwards' });
    play(svg.querySelector('.beam'), draw, { duration: 210, delay: 640, easing: 'ease-in-out', fill: 'backwards' });
    play(svg.querySelector('.beam2'), draw, { duration: 160, delay: 690, easing: OUT, fill: 'backwards' });
    play(svg.querySelector('.head2'), grow, { duration: 320, delay: 790, easing: OUT, fill: 'backwards' });
  }

  // ---------- 装上 ----------
  function setupCategories() {
    const kinds = { all: [cubeIcon, spinCube], image: [imageIcon, shoot], video: [filmIcon, roll], audio: [noteIcon, sing] };
    document.querySelectorAll('#sidebar-filters [data-type]').forEach(button => {
      const kind = kinds[button.dataset.type], holder = button.querySelector('span');
      if (!kind || !holder) return;
      const node = kind[0]();
      holder.replaceChildren(node);
      button.addEventListener('click', () => kind[1](node));
    });
  }
  setupAvatar();
  setupRefresh();
  setupUpload();
  setupTools();
  setupCategories();
  $('#favorites-button')?.addEventListener('click', heart);
  window.StudioDelight = { fireworks };
})();
