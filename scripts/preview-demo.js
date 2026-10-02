// 本机演示数据：只在 scripts/serve.cjs 的 /?demo 预览里注入，用来看排版和动效，不连后台。
(() => {
  'use strict';
  const KEY = 'studio-openlist-session-v1';
  // /?demo&light 用白天模式看。
  if (new URLSearchParams(location.search).has('light')) localStorage.setItem('orange-library-theme-v1', 'light');
  const b64 = value => btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const exp = Math.floor(Date.now() / 1000) + 86400;
  localStorage.setItem(KEY, JSON.stringify({ endpoint: location.origin, folderPath: '/', username: 'demo', role: 0, token: 'h.' + b64({ username: 'demo', role: 0, exp }) + '.demo', created: Date.now(), expires: exp * 1000 }));
  // 名称、文件夹、缩略图宽高、是否透明、色相：比例和透明度故意混杂，模拟真实素材。
  const names = [
    ['葫芦娃牙洞.mp4', '', 1920, 1080, 0, 200], ['小橙子疏通下水道.png', '', 800, 800, 1, 28], ['开场音效.wav', ''], ['蜻蜓队长.mp4', '', 1080, 1920, 0, 150],
    ['日落背景.png', '', 1920, 1080, 0, 18], ['小橙子说明.gif', '', 480, 360, 0, 330], ['背景音乐.mp3', ''], ['透明烟花.webm', '', 1920, 1080, 0, 260],
    ['封面背景.jpg', '', 1500, 1000, 0, 210], ['长图教程.jpg', '', 750, 3000, 0, 40], ['震惊.gif', '', 400, 400, 0, 0], ['横幅.png', '', 2400, 800, 0, 120],
    ['星星贴纸.png', '', 600, 600, 1, 48], ['鼓掌.gif', '', 640, 360, 0, 280], ['转场.mp4', '', 1280, 720, 0, 230], ['箭头.png', '', 900, 300, 1, 10],
    ['表情 01.png', '表情包', 500, 500, 1, 30], ['片头.mp4', '开场', 1920, 1080, 0, 20]];
  const assets = names.map(([name, folder], i) => ({ id: 'demo-' + i, name, folder, size: Math.round((1.3 + i * 2.7) * 1048576), modified: `2026-09-${String(30 - i).padStart(2, '0')}T10:00:00Z`, deleted: false, pending: false, revision: 1, thumb: '', uploader: 'angel_ni' }));
  const favorites = new Set(['demo-1']);
  const original = window.fetch.bind(window);
  window.fetch = async (url, options) => {
    const path = new URL(url, location.href).pathname;
    if (!path.startsWith('/api/')) return original(url, options);
    // 移动、排序、收藏在这次页面里记住，刷新目录后还在。
    const body = (() => { try { return JSON.parse(options?.body || '{}'); } catch { return {}; } })();
    if (path.endsWith('/move')) assets.forEach(item => { if (body.ids.includes(item.id) && item.folder !== body.folder) { item.folder = body.folder; item.sort_order = null; } });
    if (path.endsWith('/order')) body.ids.forEach((id, index) => { assets.find(item => item.id === id).sort_order = index; });
    if (path.endsWith('/favorite')) body.ids.forEach(id => { favorites.delete(id); if (body.on) favorites.add(id); });
    // /?demo&viewer 模拟只看账号。
    const data = path.endsWith('/studio_catalog/list') ? { assets, folders: ['表情包', '开场'], favorites: [...favorites], canManage: !new URLSearchParams(location.search).has('viewer') } : {};
    return new Response(JSON.stringify({ code: 200, data }), { headers: { 'Content-Type': 'application/json' } });
  };
  // 成员在线：演示里换成假的连接——几个人在线，一个在上传（进度会慢慢走），一个页面放在后台。
  const RealSocket = window.WebSocket;
  window.WebSocket = function (url, protocols) {
    if (!String(url).includes('/api/studio_presence')) return new RealSocket(url, protocols);
    const fake = new EventTarget(), me = { folder: '', action: '', detail: '', at: 0, visible: true };
    let done = 3, timer = 0;
    const push = () => fake.readyState === 1 && fake.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({ t: 'presence', now: Date.now(), members: [
      { name: 'angel_ni', visible: true, folder: '表情包', action: 'upload', detail: done + '/10', at: Date.now() },
      { name: 'demo', ...me },
      { name: 'Afica', visible: true, folder: '开场', action: '', detail: '', at: 0 },
      { name: 'momo', visible: false, folder: '', action: '', detail: '', at: 0 },
    ] }) }));
    fake.readyState = 0;
    fake.send = text => { if (text === 'ping') return; const data = JSON.parse(text); Object.assign(me, { folder: data.folder, action: data.action, detail: data.detail, visible: data.visible, at: data.action ? Date.now() : 0 }); push(); };
    fake.close = () => { fake.readyState = 3; clearInterval(timer); fake.dispatchEvent(new CloseEvent('close', { code: 1000 })); };
    setTimeout(() => { fake.readyState = 1; fake.dispatchEvent(new Event('open')); push(); timer = setInterval(() => { done = done % 10 + 1; push(); }, 6000); }, 300);
    return fake;
  };
  // 演示缩略图：不透明的是渐变画面，透明的是没有底的贴纸形状。
  const art = ([, , w, h, clear, hue]) => {
    const body = clear
      ? `<circle cx="${w / 2}" cy="${h / 2}" r="${Math.min(w, h) * .38}" fill="hsl(${hue} 95% 58%)"/><circle cx="${w * .42}" cy="${h * .42}" r="${Math.min(w, h) * .07}" fill="#1b1b1b"/><circle cx="${w * .58}" cy="${h * .42}" r="${Math.min(w, h) * .07}" fill="#1b1b1b"/>`
      : `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue} 70% 62%)"/><stop offset="1" stop-color="hsl(${hue + 40} 60% 22%)"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#g)"/><circle cx="${w * .7}" cy="${h * .35}" r="${Math.min(w, h) * .16}" fill="hsl(${hue + 20} 90% 80%)" opacity=".8"/><path d="M0 ${h * .78} Q${w * .3} ${h * .6} ${w * .55} ${h * .74} T${w} ${h * .7} V${h} H0Z" fill="hsl(${hue + 60} 40% 14%)" opacity=".85"/>`;
    return 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`);
  };
  new MutationObserver(() => {
    document.querySelectorAll('.asset-card:not(.folder-card) .preview-button:not([data-demo])').forEach(button => {
      button.dataset.demo = '1';
      const spec = names[Number(button.closest('.asset-card').dataset.id.split('-')[1])];
      if (!spec?.[2]) return;
      const image = document.createElement('img'); image.src = art(spec); image.alt = '';
      button.querySelector('.preview-fallback')?.remove(); button.prepend(image);
      button.dataset.surface = spec[4] ? 'transparent' : 'opaque';
    });
  }).observe(document.documentElement, { childList: true, subtree: true });
  // /?demo&open=detail|menu|upload|folders 打开对应浮层，方便看弹窗样式。
  const open = new URLSearchParams(location.search).get('open');
  // /?demo&scroll=600 打开后滚到那个位置，看叠起来的小分栏。
  const scroll = Number(new URLSearchParams(location.search).get('scroll'));
  if (scroll) addEventListener('load', () => setTimeout(() => scrollTo(0, scroll), 1200));
  if (open) addEventListener('load', () => setTimeout(() => {
    if (open === 'detail') document.querySelector('.asset-card:not(.folder-card) .preview-button')?.click();
    if (open === 'menu') document.querySelector('#tools-button')?.click();
    if (open === 'upload') document.querySelector('#upload-button')?.click();
    if (open === 'folders') document.querySelector('.folder-toggle button')?.click();
    if (open === 'presence') document.querySelector('#presence-toggle')?.click();
    if (open === 'copyright') document.querySelector('#copyright-button')?.click();
    // 选两张后拖起来停在“表情包”文件夹上，看浮起、叠放和目标高亮。
    if (open === 'drag') {
      document.querySelector('.folder-toggle button')?.click();
      document.querySelector('#select-button')?.click();
      const cards = [...document.querySelectorAll('#asset-grid > .asset-card:not(.folder-card) .preview-button')];
      cards[0].click(); cards[1].click();
      const b = cards[0].getBoundingClientRect(), ev = (type, x, y, target = window) => target.dispatchEvent(new PointerEvent(type, { pointerId: 3, pointerType: 'mouse', isPrimary: true, button: 0, buttons: 1, clientX: x, clientY: y, bubbles: true }));
      ev('pointerdown', b.left + 60, b.top + 60, cards[0]);
      setTimeout(() => { const f = document.querySelector('.folder-card').getBoundingClientRect(); ev('pointermove', f.left + 120, f.top + 30); }, 700);
    }
    // 把分类选中块停在“音频”并多推出 16px，检查越界时的裁切形状。
    if (open === 'overshoot') {
      document.querySelector('[data-type="audio"]')?.click();
      setTimeout(() => { const pill = document.querySelector('.nav-indicator'); pill.classList.remove('is-ready'); pill.style.translate = pill.style.translate.replace(/^([\d.]+)px/, (_, x) => (Number(x) + 16) + 'px'); }, 900);
    }
  }, 900));
})();
