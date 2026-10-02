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
  const original = window.fetch.bind(window);
  window.fetch = async (url, options) => {
    const path = new URL(url, location.href).pathname;
    if (!path.startsWith('/api/')) return original(url, options);
    const data = path.endsWith('/studio_catalog/list') ? { assets, folders: ['表情包', '开场'], favorites: ['demo-1'], canManage: true } : {};
    return new Response(JSON.stringify({ code: 200, data }), { headers: { 'Content-Type': 'application/json' } });
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
  // /?demo&open=detail|menu|upload 打开对应浮层，方便看弹窗样式。
  const open = new URLSearchParams(location.search).get('open');
  if (open) addEventListener('load', () => setTimeout(() => {
    if (open === 'detail') document.querySelector('.asset-card:not(.folder-card) .preview-button')?.click();
    if (open === 'menu') document.querySelector('#tools-button')?.click();
    if (open === 'upload') document.querySelector('#upload-button')?.click();
    // 把分类选中块停在“音频”并多推出 16px，检查越界时的裁切形状。
    if (open === 'overshoot') {
      document.querySelector('[data-type="audio"]')?.click();
      setTimeout(() => { const pill = document.querySelector('.nav-indicator'); pill.classList.remove('is-ready'); pill.style.translate = pill.style.translate.replace(/^([\d.]+)px/, (_, x) => (Number(x) + 16) + 'px'); }, 900);
    }
  }, 900));
})();
