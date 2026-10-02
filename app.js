/*! 正经素材库 © 2026 小橙子工作室（XXCHENGZI）保留所有权利。未经书面许可，禁止复制、修改、传播或用于其他项目。详见 LICENSE。 */
(() => {
  'use strict';

  const $ = (selector) => document.querySelector(selector);
  // 分类只有图片、视频、音频；旧目录里的“动画”并入图片，其余文件只在全部素材里出现。
  const TYPES = { image: '图片', video: '视频', audio: '音频', animation: '图片', other: '文件' };
  const TITLES = { all: '全部素材', image: '图片', video: '视频', audio: '音频', favorites: '我的收藏', trash: '回收站' };
  const STORAGE_KEY = 'orange-library-catalog-v1';
  const FAVORITES_KEY = 'orange-library-favorites-v1';
  const VIEW_KEY = 'orange-library-view-v1';
  const THEME_KEY = 'orange-library-theme-v1';
  const logo = $('.studio-lockup');
  // Invisible outlines expand pointer targets without changing the visible lettering.
  const logoSvg = logo.querySelector('svg');
  for (const link of logoSvg.querySelectorAll('.logo-english')) {
    const hit = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    hit.setAttribute('aria-hidden', 'true');
    const signature = logoSvg.querySelector('#signature').cloneNode(true);
    signature.removeAttribute('id');
    const signatureHit = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    if (!link.classList.contains('logo-english-back')) signatureHit.setAttribute('clip-path', 'url(#woven)');
    signatureHit.append(signature);
    hit.append(signatureHit);
    for (const path of signatureHit.querySelectorAll('path')) {
      path.setAttribute('fill', 'transparent');
      path.setAttribute('stroke', 'transparent');
      path.setAttribute('stroke-width', '6');
      path.setAttribute('stroke-linejoin', 'round');
      path.setAttribute('stroke-linecap', 'round');
      path.setAttribute('vector-effect', 'non-scaling-stroke');
      path.setAttribute('pointer-events', 'all');
    }
    // An open flourish must only catch its stroke, never its implicitly closed interior.
    const flourishHit = logoSvg.querySelector('#logo-thread > path').cloneNode(true);
    flourishHit.setAttribute('fill', 'none');
    flourishHit.setAttribute('stroke', 'transparent');
    flourishHit.setAttribute('stroke-width', '3');
    flourishHit.setAttribute('vector-effect', 'non-scaling-stroke');
    flourishHit.setAttribute('pointer-events', 'stroke');
    hit.append(flourishHit);
    link.append(hit);
  }
  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    $('#logo-theme').setAttribute('aria-pressed', String(theme === 'light'));
    $('#logo-theme').setAttribute('aria-label', theme === 'light' ? '切换到黑夜模式' : '切换到白天模式');
    $('meta[name="theme-color"]').content = theme === 'light' ? '#eeefeb' : '#111315';
  }
  let savedTheme = 'dark';
  try { savedTheme = localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark'; } catch { /* theme stays usable */ }
  applyTheme(savedTheme);
  function toggleTheme() {
    const theme = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
    applyTheme(theme);
    try { localStorage.setItem(THEME_KEY, theme); } catch { /* theme stays usable */ }
  }
  $('#logo-theme').addEventListener('click', toggleTheme);
  $('#logo-theme').addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggleTheme(); }
  });
  function highlightLogo(event) {
    const layer = event.target.closest('[data-logo-layer]')?.dataset.logoLayer;
    if (layer) logo.dataset.highlight = layer;
    else delete logo.dataset.highlight;
  }
  logo.addEventListener('pointerover', highlightLogo);
  logo.addEventListener('pointerleave', () => delete logo.dataset.highlight);
  logo.addEventListener('focusin', highlightLogo);
  logo.addEventListener('focusout', () => delete logo.dataset.highlight);
  logo.addEventListener('pointerup', event => { if (event.pointerType !== 'mouse') delete logo.dataset.highlight; });
  const published = window.STUDIO_CATALOG;
  let catalog = published;
  let draft = false;
  let favorites = new Set();
  let activeType = 'all';
  let activeView = 'grid';
  let activeAsset = null;
  let filteredAssets = [];
  let previewRequest = null;
  let previewObjectUrls = [];
  function stopPreview() {
    previewRequest?.abort(); previewRequest = null;
    $('#detail-preview').querySelectorAll('video,audio').forEach(media => { media.pause(); media.removeAttribute('src'); media.load(); });
    previewObjectUrls.forEach(url => URL.revokeObjectURL(url)); previewObjectUrls = [];
  }
  let storageWarning = '';
  let pendingChange = null;
  let cloudAssets = [];
  let cloudFolders = [];
  let cloudBusy = false;
  let cloudRequest = null;
  let uploadRequest = null;
  let uploadQueue = [];
  let uploading = false;
  let cloudFolderId = null;
  let member = null;
  let memberBusy = false;
  let memberRequest = null;
  let cloudFolderName = '';
  let syncFollowUp = null;
  // 网站是管理器：当前位置是网站文件夹路径（'' 为最外层）。地址栏记住位置，浏览器返回键回到上一处。
  let currentFolder = '';
  let selecting = false;
  const selection = new Set();
  let dragIds = null;
  let foldersOpen = false; // 文件夹默认折叠，点开后在这次浏览里保持打开。
  const VIEWS = ['all', 'image', 'video', 'audio', 'favorites', 'trash'];
  const folderOf = asset => asset.tags.join('/');
  const parentOf = path => path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
  const within = (folder, root) => !root || folder === root || folder.startsWith(root + '/');
  const isSpecial = (type = activeType) => type === 'favorites' || type === 'trash';
  function readHash() {
    const params = new URLSearchParams(location.hash.slice(1));
    const folder = params.get('f') || '';
    return { type: VIEWS.includes(params.get('v')) ? params.get('v') : 'all', folder: folder.length <= 1024 && folder.split('/').every(Boolean) ? folder : '' };
  }
  function writeHash(push) {
    const params = new URLSearchParams();
    if (activeType !== 'all') params.set('v', activeType);
    if (currentFolder && !isSpecial()) params.set('f', currentFolder);
    const hash = params.toString() ? '#' + params : '';
    if (hash === location.hash) return;
    history[push ? 'pushState' : 'replaceState'](null, '', hash || location.pathname + location.search);
  }
  ({ type: activeType, folder: currentFolder } = readHash());
  const isGoogle = () => catalog.config.provider === 'google';
  const isOpenList = () => catalog.config.provider === 'openlist';
  const cloudName = () => isOpenList() ? '素材库' : isGoogle() ? 'Google Drive' : 'pCloud';
  const cloudClient = () => isOpenList() ? window.OpenListClient : isGoogle() ? window.GoogleDriveClient : window.PCloudClient;
  const cloudAuth = () => isOpenList() ? window.OpenListAuth : isGoogle() ? window.GoogleDriveAuth : window.PCloudAuth;
  const memberSession = () => cloudAuth().get(catalog.config);
  const memberSettings = () => ({ ...catalog.config, folderId: cloudFolderId });
  const isCloud = () => Boolean(catalog.config.folderUrl);
  const allAssets = () => (isCloud() ? cloudAssets : catalog.assets).filter(asset => activeType === 'trash' ? asset.deleted : !asset.deleted);

  // 卡片只读目录已有的缩略图地址，不解析原文件；跨筛选复用进行中的加载。
  let thumbnailObserver = null;
  let thumbnailScope = '';
  let thumbnailController = new AbortController();
  const thumbnails = new Map();
  // 检查已解码的本机图片，不为透明度另发网络请求。
  function imageSurface(image) {
    try {
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, 256 / Math.max(image.naturalWidth, image.naturalHeight));
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext('2d', { willReadFrequently: true });
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      for (let i = 3; i < pixels.length; i += 4) if (pixels[i] < 250) return 'transparent';
      return 'opaque';
    } catch { return 'unknown'; }
  }
  function previewKey(input, session, asset, part) {
    return [input.provider || 'pcloud', input.folderUrl || '', input.folderPath || '/', session?.username || session?.uid || 'public', asset.id, asset.modified || asset.date, asset.sizeMB, part, 'original-v1'];
  }
  function clearThumbnails() {
    thumbnailObserver?.disconnect(); thumbnailObserver = null;
    thumbnailController.abort(); thumbnailController = new AbortController();
    for (const item of thumbnails.values()) if (item.url) URL.revokeObjectURL(item.url);
    thumbnails.clear(); thumbnailScope = '';
  }
  function observeThumbnails() {
    thumbnailObserver?.disconnect();
    const input = { ...catalog.config }, session = memberSession();
    const scope = JSON.stringify([input.provider, input.folderUrl, input.folderPath, session?.username || session?.uid || 'public', session?.created]);
    if (scope !== thumbnailScope) { clearThumbnails(); thumbnailScope = scope; }
    const signal = thumbnailController.signal;
    const assets = new Map(allAssets().map(asset => [asset.id, asset]));
    const valid = new Set([...assets.values()].map(asset => JSON.stringify(previewKey(input, session, asset, asset.type === 'video' ? 'poster' : 'thumbnail'))));
    for (const [id, item] of thumbnails) if (!valid.has(id)) { if (item.url) URL.revokeObjectURL(item.url); thumbnails.delete(id); }
    async function show(button) {
      const asset = assets.get(button.closest('.asset-card').dataset.id);
      if (!asset || asset.deleted || asset.pending || (!asset.previewUrl && !asset.cachedPreview) || asset.type === 'audio' || asset.type === 'other' || (asset.provider === 'openlist' && !session)) return;
      // 演示视频的 previewUrl 可能是视频本身，不能作为自动缩略图加载。
      if (!asset.cloud && !['image', 'animation'].includes(asset.type)) return;
      const parts = previewKey(input, session, asset, asset.type === 'video' ? 'poster' : 'thumbnail');
      const id = JSON.stringify(parts);
      let item = thumbnails.get(id);
      if (!item) {
        item = {}; thumbnails.set(id, item);
        item.promise = window.StudioPreviewCache.load(parts, () => safeUrl(asset.previewUrl), { signal, kind: 'image', limit: 4 * 1048576 })
          .then(result => { if (signal.aborted || thumbnails.get(id) !== item) return ''; item.url = URL.createObjectURL(result.blob); return item.url; })
          .catch(() => { if (!asset.previewUrl && thumbnails.get(id) === item) thumbnails.delete(id); return ''; }); // 上次目录没有预览地址时，等新目录到达再取。
      }
      const url = await item.promise;
      if (!url || signal.aborted || !button.isConnected) return;
      const image = element('img'); image.src = url; image.alt = asset.name; image.decoding = 'async'; image.draggable = false;
      if (item.surface) button.dataset.surface = item.surface;
      image.addEventListener('load', () => {
        if (signal.aborted || !button.isConnected) return;
        button.querySelector('.preview-fallback')?.remove();
        item.surface ||= asset.type === 'video' ? 'opaque' : imageSurface(image);
        button.dataset.surface = item.surface;
      }, { once: true });
      image.addEventListener('error', () => image.remove(), { once: true });
      button.prepend(image);
    }
    const buttons = $('#asset-grid').querySelectorAll('.preview-button');
    if ('IntersectionObserver' in window) {
      thumbnailObserver = new IntersectionObserver(entries => {
        for (const entry of entries) if (entry.isIntersecting) { thumbnailObserver.unobserve(entry.target); show(entry.target); }
      }, { rootMargin: '120px' });
      buttons.forEach(button => thumbnailObserver.observe(button));
    } else buttons.forEach(show);
  }

  function cloudStatus(message, error = false) {
    $('#cloud-status').textContent = message;
    $('#cloud-status').classList.toggle('error', error);
  }

  // 记住上次的目录，打开页面先显示，后台返回后再更新；不保存令牌和临时预览地址。
  const CATALOG_CACHE = 'studio-openlist-catalog-v1';
  function cachedCatalog(session) {
    if (!isOpenList() || !session) return null;
    try {
      const data = JSON.parse(localStorage.getItem(CATALOG_CACHE) || 'null');
      return data && data.endpoint === session.endpoint && data.folderPath === session.folderPath && data.username === session.username && Array.isArray(data.assets) && Array.isArray(data.folders) ? data : null;
    } catch { return null; }
  }
  function cacheCatalog(session, data) {
    try {
      if (!session || !data) { localStorage.removeItem(CATALOG_CACHE); return; }
      const assets = data.assets.map(asset => ({ ...asset, previewUrl: '', cachedPreview: Boolean(asset.previewUrl) }));
      const value = JSON.stringify({ endpoint: session.endpoint, folderPath: session.folderPath, username: session.username, assets, folders: data.folders || [], favorites: data.favorites || [], folderId: data.folderId, name: data.name, access: data.access });
      if (value.length <= 2000000) localStorage.setItem(CATALOG_CACHE, value); else localStorage.removeItem(CATALOG_CACHE);
    } catch { /* 存储不可用时只是不显示上次目录。 */ }
  }
  function cacheFavorites() {
    try {
      const data = JSON.parse(localStorage.getItem(CATALOG_CACHE) || 'null');
      if (data) localStorage.setItem(CATALOG_CACHE, JSON.stringify({ ...data, favorites: [...favorites] }));
    } catch { /* 下次打开时以后台为准。 */ }
  }
  // 收藏跟着账号走；这台浏览器以前存的本机收藏，第一次登录后一并交给后台。
  let favoritesMigrated = false;
  async function migrateLocalFavorites() {
    if (favoritesMigrated || !isOpenList()) return;
    favoritesMigrated = true;
    let local = [];
    try { local = JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]'); } catch { return; }
    const ids = Array.isArray(local) ? local.filter(id => cloudAssets.some(asset => asset.id === id) && !favorites.has(id)).slice(0, 500) : [];
    try {
      if (ids.length) { await window.OpenListClient.manage(catalog.config, 'favorite', { ids, on: true }, AbortSignal.timeout(20000)); ids.forEach(id => favorites.add(id)); cacheFavorites(); render(); }
      localStorage.removeItem(FAVORITES_KEY);
    } catch { favoritesMigrated = false; }
  }

  async function refreshCloud(notify = false) {
    cloudRequest?.abort();
    cloudRequest = null;
    memberRequest?.abort(); memberRequest = null;
    memberBusy = false; cloudFolderId = null; cloudFolderName = '';
    const listSession = memberSession();
    // 本机有有效会话就直接按已登录显示，不单独等待账号核实；后台拒绝时再退回登录。
    if (!isOpenList() || !listSession || member?.name !== listSession.username) member = null;
    const cached = !cloudAssets.length && cachedCatalog(listSession);
    if (cached) {
      cloudAssets = cached.assets; cloudFolders = cached.folders; cloudFolderId = cached.folderId; cloudFolderName = cached.name;
      if (Array.isArray(cached.favorites)) favorites = new Set(cached.favorites);
      member = { name: listSession.username, role: listSession.role, avatarUrl: '', ...cached.access };
    }
    renderMember();
    if (isGoogle()) window.GoogleDriveAuth.prepare(catalog.config).catch(error => { if (isGoogle()) $('#member-login-message').textContent = error.message; });
    if (!isCloud()) { cloudAssets = []; cloudBusy = false; cloudStatus(`尚未连接 ${cloudName()}`); render(); return; }
    const controller = new AbortController();
    cloudRequest = controller;
    cloudBusy = true;
    cloudStatus(''); // 加载中只显示占位卡片。
    render();
    const timeout = setTimeout(() => controller.abort(), isGoogle() || isOpenList() ? 60000 : 20000);
    try {
      const data = await cloudClient().list(catalog.config, controller.signal, notify);
      if (cloudRequest !== controller) return;
      cloudAssets = data.assets;
      cloudFolders = data.folders || [];
      cloudFolderId = data.folderId;
      cloudFolderName = data.name;
      if (isOpenList()) favorites = new Set(data.favorites || []);
      if (isOpenList() && memberSession()?.username === listSession?.username) cacheCatalog(listSession, data);
      // 后台正在补清点云盘时，过一会儿安静地再取一次；每次打开页面最多一次，不轮询。
      if (data.syncing && !syncFollowUp) {
        syncFollowUp = setTimeout(() => { if (!cloudBusy && !uploading && !document.hidden) refreshCloud(); }, 8000);
      }
      cloudStatus('');
      if (notify) toast('已更新');
      await refreshMember(isOpenList() && memberSession()?.token === listSession?.token ? data.access : undefined);
      migrateLocalFavorites();
    } catch (error) {
      if (cloudRequest !== controller) return;
      const needsLogin = isOpenList() && error.code === 401;
      if (needsLogin) {
        // 令牌失效或被撤销：只清本机，显示登录入口。
        if (memberSession()) cloudAuth().logout();
        cacheCatalog(null); cloudAssets = []; cloudFolders = []; member = null; renderMember();
      }
      const offline = error instanceof TypeError && !controller.signal.aborted;
      cloudStatus(needsLogin ? '' : controller.signal.aborted ? '连接超时，请重试。' : offline ? '连不上素材库，请检查网络或代理。' : error.message, !needsLogin);
      if (notify) toast(needsLogin ? '请先登录' : '刷新失败，请重试');
    } finally {
      clearTimeout(timeout);
      if (cloudRequest === controller) { cloudBusy = false; $('#refresh-button').disabled = false; render(); }
    }
  }

  function renderMember(message = '') {
    const signedIn = Boolean(memberSession());
    const image = $('#member-avatar-image');
    const avatar = signedIn && member?.avatarUrl;
    image.hidden = !avatar;
    $('#member-avatar svg').toggleAttribute('hidden', Boolean(avatar));
    if (avatar) { if (image.getAttribute('src') !== avatar) image.src = avatar; }
    else image.removeAttribute('src');
    $('#member-avatar').setAttribute('aria-label', member ? `${member.name} · ${cloudName()} 账号` : signedIn ? '我的账号' : `登录 ${cloudName()}`);
    image.alt = `${cloudName()} 头像`;
    $('#member-avatar').title = $('#member-avatar').getAttribute('aria-label');
    $('#openlist-login-form').hidden = !isOpenList() || signedIn;
    $('#member-status').textContent = message || (memberBusy ? '核实上传权限中…' : signedIn && !member?.canUpload ? isGoogle() ? '请授权素材文件夹并核实编辑权限' : '此账号尚未获得素材文件夹上传权限' : '');
    $('#member-info').textContent = member ? `${member.name} · ${member.canUpload ? '已获得上传权限' : '尚未获得上传权限'}` : signedIn ? '请核实素材文件夹授权和成员权限。' : `请使用受邀的 ${isGoogle() ? 'Google' : 'pCloud'} 账号登录。`;
    $('#member-authorize').hidden = signedIn || isOpenList();
    $('#member-authorize').disabled = !catalog.config.clientId;
    $('#member-authorize').textContent = `登录 ${isGoogle() ? 'Google' : 'pCloud'}`;
    $('#member-folder-authorize').hidden = !isGoogle() || !signedIn || member?.canUpload === true;
    $('#member-folder-authorize').disabled = memberBusy;
    $('#member-permission-help').textContent = isOpenList() ? '使用管理员为你创建的成员账号。' : isGoogle() ? '首次登录后，在 Google 文件夹选择器中选择素材文件夹。只授权所选文件夹；上传权限由 Drive 共享设置校验。' : '应用可获所有文件夹权限；本站只操作素材文件夹。';
    $('#member-logout').disabled = !signedIn;
    $('#member-recheck').hidden = !signedIn;
    $('#member-recheck').disabled = memberBusy;
    $('#member-login-message').textContent = isOpenList() ? '' : catalog.config.clientId ? '' : `管理员正在配置 ${cloudName()} 登录。`;
    $('#member-title').textContent = '登录';
    if (isOpenList()) {
      // 会话在本机就视为已登录；权限随目录一起返回，不显示核实过程。
      const name = member?.name || memberSession()?.username || '';
      $('#member-title').textContent = signedIn ? name : '登录';
      $('#member-avatar').setAttribute('aria-label', signedIn ? name : '登录');
      $('#member-avatar').title = signedIn ? name : '登录';
      $('#member-info').textContent = signedIn ? '已登录' : '';
      $('#member-permission-help').textContent = '';
      $('#member-status').textContent = message || (member && !member.canUpload ? '此账号没有上传权限' : '');
      $('#member-recheck').hidden = true;
    }
    $('#upload-button').replaceChildren(icon('file-upload'));
    $('#upload-button').setAttribute('aria-label', '上传素材');
    $('#upload-button').title = '上传素材';
    $('#trash-button').hidden = !isOpenList() || !signedIn;
    $('#backup-button').hidden = !canManage();
  }

  async function refreshMember(directoryAccess) {
    memberRequest?.abort();
    const session = memberSession();
    if (isOpenList() && session && directoryAccess) {
      // 目录接口已验证令牌并给出权限，不再额外请求账号资料；续期在后台进行。
      memberRequest = null; memberBusy = false;
      member = { name: session.username, role: session.role, avatarUrl: '', ...directoryAccess };
      renderMember();
      window.OpenListAuth.renewIfNeeded(memberSettings(), session).catch(() => {});
      return;
    }
    member = null;
    if (!session || !cloudFolderId) { memberRequest = null; memberBusy = false; renderMember(); return; }
    const controller = new AbortController();
    memberRequest = controller;
    memberBusy = true;
    renderMember();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const input = memberSettings();
      const client = cloudClient();
      const profile = await client.profile(input, session, controller.signal);
      if (memberRequest !== controller) return;
      member = { ...profile, canUpload: false };
      const access = isOpenList() && directoryAccess ? directoryAccess : await client.memberAccess(input, session, controller.signal);
      if (memberRequest !== controller) return;
      member = { ...profile, ...access };
      memberBusy = false;
      renderMember();
    } catch (error) {
      if (memberRequest !== controller) return;
      if ([1000, 2000, 401].includes(error.code)) cloudAuth().logout();
      memberBusy = false;
      renderMember(controller.signal.aborted ? '账号权限核实超时，请重试。' : error.message);
    } finally {
      clearTimeout(timeout);
      if (memberRequest === controller) { memberBusy = false; memberRequest = null; $('#member-recheck').disabled = false; }
    }
  }

  function openMember() {
    renderMember();
    if (isOpenList() && !$('#openlist-username').value) $('#openlist-username').value = window.OpenListAuth.remembered(catalog.config);
    window.StudioMotion.open($('#member-dialog'));
  }

  $('#member-avatar').addEventListener('click', openMember);
  $('#member-avatar-image').addEventListener('error', () => {
    $('#member-avatar-image').hidden = true;
    $('#member-avatar svg').removeAttribute('hidden');
  });
  $('#member-authorize').addEventListener('click', async () => {
    try {
      $('#member-login-message').textContent = '请完成官方登录窗口中的账号选择。';
      await cloudAuth().begin(catalog.config);
      if (isGoogle()) { renderMember(); await refreshMember(); }
    }
    catch (error) { $('#member-login-message').textContent = error.message; }
  });
  $('#member-folder-authorize').addEventListener('click', async () => {
    // The native modal would make Google's body-mounted Picker inert.
    $('#member-dialog').close();
    let message = '';
    try {
      await window.GoogleDriveAuth.selectFolder(catalog.config, cloudFolderName || '正经素材库');
      await refreshMember();
    } catch (error) { message = error.message; }
    openMember();
    if (message) $('#member-login-message').textContent = message;
  });
  $('#openlist-login-form').addEventListener('submit', async event => {
    event.preventDefault();
    const button = $('#openlist-login-submit');
    button.disabled = true;
    try {
      await window.OpenListAuth.begin(catalog.config, $('#openlist-username').value, $('#openlist-password').value);
      window.OpenListAuth.remember(catalog.config, $('#openlist-username').value);
      // 账号密码正确就直接进入素材库，目录在页面上加载。
      window.StudioMotion.close($('#member-dialog'));
      await refreshCloud();
    } catch (error) { $('#member-login-message').textContent = error.message; }
    finally { $('#openlist-password').value = ''; $('#openlist-password').type = 'password'; $('#password-toggle').setAttribute('aria-pressed','false'); $('#password-toggle').setAttribute('aria-label','显示密码'); $('#password-toggle').replaceChildren(icon('eye')); button.disabled = false; }
  });
  $('#password-toggle').addEventListener('click', () => {
    const input = $('#openlist-password'), shown = input.type === 'password';
    input.type = shown ? 'text' : 'password';
    $('#password-toggle').setAttribute('aria-pressed', String(shown));
    $('#password-toggle').setAttribute('aria-label', shown ? '隐藏密码' : '显示密码');
    $('#password-toggle').replaceChildren(icon(shown ? 'eye-slash' : 'eye'));
  });
  $('#member-recheck').addEventListener('click', () => refreshMember());
  $('#member-logout').addEventListener('click', async () => {
    clearThumbnails();
    stopPreview(); activeAsset = null; $('#detail-preview').replaceChildren();
    uploadRequest?.abort();
    memberRequest?.abort(); memberRequest = null;
    let logoutError = '';
    try { await cloudAuth().logout(catalog.config); } catch (error) { logoutError = error.message; }
    if (isOpenList()) { cloudRequest?.abort(); cacheCatalog(null); cloudAssets = []; cloudFolders = []; favorites = new Set(); cloudFolderId = null; setSelecting(false); render(); cloudStatus(''); }
    member = null; memberBusy = false;
    renderMember();
    window.StudioMotion.close($('#member-dialog'));
    toast(logoutError || '已退出登录');
  });

  function renderQueue() {
    $('#upload-queue').replaceChildren(...uploadQueue.map((item) => {
      const row = element('div', 'upload-row');
      row.append(element('strong', '', item.relativePath), element('span', '', item.status));
      return row;
    }));
    $('#upload-start').disabled = uploading || !uploadQueue.some((item) => !item.done);
    $('#upload-member').disabled = uploading;
    $('#choose-files').hidden = uploading;
    $('#choose-folder').hidden = uploading || !isOpenList();
    $('#upload-cancel').hidden = !uploading;
  }

  // 在文件夹里上传就放进这个文件夹；收藏和回收站里上传放到最外层。
  const uploadFolder = () => isSpecial() ? '' : currentFolder;
  function openUpload() {
    if (!memberSession() || !member?.canUpload || memberBusy) { openMember(); return; }
    $('#upload-message').textContent = '';
    $('#upload-member').value = member.name;
    // 只有在某个文件夹里上传时才需要说明去向。
    const target = uploadFolder();
    $('#upload-target').textContent = target ? `上传到 ${target.split('/').join(' / ')}` : '';
    renderQueue();
    window.StudioMotion.open($('#upload-dialog'));
  }

  function enqueueUploads(files) {
    uploadQueue = uploadQueue.filter(item => !item.done);
    for (const { file, relativePath } of files) {
      if (uploadQueue.some(item => item.relativePath === relativePath && item.file.size === file.size && item.file.lastModified === file.lastModified)) continue;
      uploadQueue.push({ file, relativePath, done: false, status: `${file.size < 1048576 ? `${Math.ceil(file.size / 1024)} KB` : `${(file.size / 1048576).toFixed(1)} MB`} · 等待上传` });
    }
    $('#upload-message').textContent = `${uploadQueue.length} 个文件待上传`;
    renderQueue();
  }
  function addUploadFiles(event) {
    if (uploading) return;
    enqueueUploads([...event.target.files].map(file => ({ file, relativePath: file.webkitRelativePath || file.name })));
    event.target.value = '';
  }
  $('#upload-files').addEventListener('change', addUploadFiles);
  $('#upload-folder').addEventListener('change', addUploadFiles);
  for (const [button, input] of [['#choose-files', '#upload-files'], ['#choose-folder', '#upload-folder']]) {
    $(button).addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); $(input).click(); }
    });
  }
  $('#upload-start').addEventListener('click', async () => {
    if (uploading) return;
    const session = memberSession();
    if (!session || !member?.canUpload) { $('#upload-message').textContent = '登录或权限已失效，请重新登录并核实上传权限。'; return; }
    uploading = true;
    uploadRequest = new AbortController();
    const settings = memberSettings();
    const client = cloudClient();
    const auth = cloudAuth();
    const previousCount = cloudAssets.length;
    const folderCache = new Map();
    folderCache.virtualBase = uploadFolder() ? uploadFolder().split('/') : [];
    let completed = 0;
    renderQueue();
    const total = uploadQueue.filter(item => !item.done).length;
    let index = 0, reported = 0;
    for (const item of uploadQueue) {
      if (item.done || uploadRequest.signal.aborted) continue;
      try {
        item.status = '正在上传…'; renderQueue();
        index++; reported = Date.now();
        presence({ action: 'upload', detail: `${index}/${total}`, folder: uploadFolder() });
        await client.upload(settings, item.file, (percent) => {
          item.status = `${percent}% · 正在上传`; renderQueue();
          if (Date.now() - reported > 30000) { reported = Date.now(); presence({ detail: `${index}/${total} ${percent}%` }); }
        }, uploadRequest.signal, session, item.relativePath, folderCache);
        item.done = true; item.status = '上传成功'; completed++;
      } catch (error) { item.status = error.message; if ([1000, 2000, 401].includes(error.code)) auth.logout(); }
      renderQueue();
    }
    const canceled = uploadRequest.signal.aborted;
    presence({ action: '', detail: '' });
    uploading = false;
    uploadRequest = null;
    renderQueue();
    await refreshCloud();
    $('#upload-message').textContent = canceled ? '已停止上传，已完成的文件会保留。' : !completed ? '没有文件上传成功，请看上面的提示。' : `已上传 ${completed} 个文件${cloudAssets.length <= previousCount ? '，目录稍后刷新可见，不用重复上传。' : '。'}`;
  });
  $('#upload-cancel').addEventListener('click', () => uploadRequest?.abort());
  $('#upload-dialog').addEventListener('cancel', (event) => { if (uploading) { event.preventDefault(); $('#upload-message').textContent = '请先点击“停止上传”，再关闭窗口。'; } });
  $('#refresh-button').addEventListener('click', () => { if (!isCloud()) toast('素材库尚未连接，请联系管理员。'); else refreshCloud(true); });

  const dropOverlay = $('#drop-overlay');
  let dragDepth = 0, readingDrop = false;
  function hideDrop() {
    dragDepth = 0;
    if (!readingDrop) { dropOverlay.hidden = true; document.body.classList.remove('is-file-dragging'); }
  }
  window.addEventListener('dragenter', event => {
    if (dragIds || !window.StudioUploadDrop.hasFiles(event.dataTransfer)) return; // 在网页里拖卡片整理，不是上传。
    event.preventDefault(); dragDepth++;
    dropOverlay.hidden = false; document.body.classList.add('is-file-dragging');
    $('#drop-label').textContent = viewOnly() ? '只看账号不能上传' : uploading ? '正在上传，请稍后添加' : !memberSession() || !member?.canUpload ? '请先登录，再拖入上传' : '松开上传';
  }, true);
  window.addEventListener('dragover', event => {
    if (dragIds || (!window.StudioUploadDrop.hasFiles(event.dataTransfer) && !dragDepth)) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = uploading || readingDrop ? 'none' : 'copy';
  }, true);
  window.addEventListener('dragleave', event => {
    if (!dragDepth) return;
    event.preventDefault();
    if (--dragDepth <= 0 || (!event.relatedTarget && (event.clientX <= 0 || event.clientY <= 0 || event.clientX >= innerWidth || event.clientY >= innerHeight))) hideDrop();
  }, true);
  window.addEventListener('drop', async event => {
    if (dragIds || (!window.StudioUploadDrop.hasFiles(event.dataTransfer) && !dragDepth)) return;
    event.preventDefault(); event.stopPropagation(); hideDrop();
    if (viewOnly()) { toast('只看账号不能上传。'); return; }
    if (uploading || readingDrop) { toast('请等待当前上传完成，再添加文件。'); return; }
    if (!memberSession() || !member?.canUpload || memberBusy) {
      if (!memberSession()) member = null;
      openMember(); toast('登录并获得上传权限后，再拖入文件。'); return;
    }
    const session = memberSession();
    readingDrop = true; dropOverlay.hidden = false;
    $('#drop-label').textContent = '正在读取文件夹…';
    try {
      const files = await window.StudioUploadDrop.collect(event.dataTransfer);
      if (memberSession()?.token !== session.token || !member?.canUpload) throw new Error('登录已变化，请重新拖入文件。');
      if (!files.length) { toast('空文件夹没有可上传的文件。'); return; }
      if (!isOpenList() && files.some(item => item.relativePath.includes('/'))) throw new Error('当前连接不支持文件夹上传。');
      for (const dialog of document.querySelectorAll('dialog[open]')) {
        if (dialog.id !== 'upload-dialog') dialog.close();
      }
      openUpload(); enqueueUploads(files);
      $('#upload-start').click();
    } catch (error) { toast(error.message || '无法读取文件夹，请使用“选择文件夹”重试。'); }
    finally { readingDrop = false; hideDrop(); }
  }, true);
  window.addEventListener('dragend', hideDrop, true);
  window.addEventListener('blur', hideDrop);

  function confirmChange(message, action) {
    pendingChange = action;
    $('#confirm-message').textContent = message;
    $('#change-confirmation').hidden = false;
    $('#confirm-change').focus();
  }

  function clearConfirmation() {
    pendingChange = null;
    $('#change-confirmation').hidden = true;
  }

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function icon(name) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
    svg.classList.add('icon'); svg.setAttribute('aria-hidden','true');
    const use = document.createElementNS('http://www.w3.org/2000/svg','use');
    use.setAttribute('href', `assets/ui-icons.svg?v=20261002-folders1#${name}`); svg.append(use);
    return svg;
  }
  function decorateChrome() {
    const types = { all:'squares-four', image:'image', video:'film-strip', audio:'music-notes', animation:'sparkle', other:'file', favorites:'heart' };
    document.querySelectorAll('[data-type]').forEach(button => button.querySelector('span').replaceChildren(icon(types[button.dataset.type])));
    document.querySelectorAll('[data-icon]').forEach(node => node.replaceChildren(icon(node.dataset.icon)));
    $('.search > span').replaceChildren(icon('magnifying-glass'));
    document.querySelectorAll('[data-view]').forEach(button => button.replaceChildren(icon(button.dataset.view === 'grid' ? 'squares-four' : 'list-view'), document.createTextNode(button.dataset.view === 'grid' ? '缩略图' : '列表')));
    document.querySelectorAll('.dialog-close').forEach(button => button.replaceChildren(icon('x')));
  }

  function toast(message) { window.StudioMotion.toast(message); }

  function safeUrl(value, localAllowed = true) {
    if (typeof value !== 'string' || value.length > 2048) return '';
    const input = value.trim();
    if (!input) return '';
    if (localAllowed && /^assets\/[\p{L}\p{N}_ ./-]+\.(svg|png|jpe?g|webp|gif|mp4|webm|mp3|wav|ogg|m4a)$/iu.test(input) && !input.includes('..')) return input;
    try {
      const url = new URL(input);
      if (url.protocol !== 'https:' || url.username || url.password) return '';
      return url.href;
    } catch { return ''; }
  }

  function pcloudUrl(value) {
    const address = safeUrl(value, false);
    if (!address) return '';
    const url = new URL(address);
    const host = url.hostname.toLowerCase();
    if (!['pcloud.com', 'pcloud.link'].some((domain) => host === domain || host.endsWith(`.${domain}`))) return '';
    if (/access_token|password|(?:[?&#])auth=/i.test(address)) return '';
    return address;
  }

  function validateCatalog(input) {
    if (!input || input.version !== 1 || !Array.isArray(input.assets) || input.assets.length > 5000) throw new Error('请选择 version 为 1 的目录 JSON，素材数量不能超过 5000。');
    const provider = input.config?.provider || 'pcloud';
    if (!['pcloud', 'google', 'openlist'].includes(provider)) throw new Error('素材托管平台无效。');
    const clientId = String(input.config?.clientId || '').trim();
    const folderUrl = String(input.config?.folderUrl || '').trim();
    const region = input.config?.region || 'us';
    const apiKey = String(input.config?.apiKey || '').trim();
    const projectNumber = String(input.config?.projectNumber || '').trim();
    const config = provider === 'openlist' ? { provider, folderUrl, folderPath: String(input.config?.folderPath || '/') } : provider === 'google' ? { provider, clientId, folderUrl, apiKey, projectNumber } : { provider, clientId, folderUrl, region };
    (provider === 'openlist' ? window.OpenListClient : provider === 'google' ? window.GoogleDriveClient : window.PCloudClient).config(config);
    const ids = new Set();
    const assets = input.assets.map((asset) => {
      if (!asset || typeof asset.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(asset.id) || ids.has(asset.id)) throw new Error('素材 ID 无效或重复。');
      ids.add(asset.id);
      if (typeof asset.name !== 'string' || !asset.name.trim() || asset.name.length > 100 || !TYPES[asset.type]) throw new Error('素材名称或类型无效。');
      if (!Array.isArray(asset.tags) || asset.tags.length > 20 || asset.tags.some((tag) => typeof tag !== 'string' || tag.length > 40)) throw new Error('每份素材最多 20 个标签，每个标签最多 40 字。');
      if (typeof asset.member !== 'string' || asset.member.length > 30 || typeof asset.description !== 'string' || asset.description.length > 1000) throw new Error('成员或说明字段无效。');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(asset.date) || Number.isNaN(Date.parse(asset.date))) throw new Error('素材日期格式应为 YYYY-MM-DD。');
      const sourceUrl = asset.demo === true ? safeUrl(asset.sourceUrl) : pcloudUrl(asset.sourceUrl);
      if (!sourceUrl) throw new Error(`“${asset.name}”缺少有效的原文件地址。`);
      const previewUrl = asset.previewUrl ? safeUrl(asset.previewUrl) : '';
      if (asset.previewUrl && !previewUrl) throw new Error(`“${asset.name}”的预览地址无效。`);
      if (previewUrl && /^https:/.test(previewUrl) && pcloudUrl(previewUrl)) throw new Error('pCloud 分享页不能作为预览直链，请留空或使用单独的小预览。');
      const sizeMB = asset.sizeMB == null ? null : asset.sizeMB;
      if (sizeMB !== null && (typeof sizeMB !== 'number' || !Number.isFinite(sizeMB) || sizeMB <= 0 || sizeMB > 10240)) throw new Error('文件大小必须为 0–10240MB 之间的正数，或留空。');
      return { id: asset.id, name: asset.name.trim(), type: asset.type, tags: [...asset.tags], description: asset.description, member: asset.member, date: asset.date, sizeMB, previewUrl, sourceUrl, demo: asset.demo === true };
    });
    return { version: 1, config, assets };
  }

  function saveCatalog(nextCatalog) {
    const validated = validateCatalog(nextCatalog);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...validated, _publishedConnection: JSON.stringify(published.config) })); }
    catch { throw new Error('浏览器无法保存草稿，可能禁用了本地存储或空间已满。请先导出备份。'); }
    catalog = validated;
    draft = true;
    render();
  }

  try {
    catalog = validateCatalog(published);
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const local = JSON.parse(saved);
      if (local._publishedConnection === JSON.stringify(published.config) || !local._publishedConnection && (!published.config.provider || published.config.provider === 'pcloud')) { catalog = validateCatalog(local); draft = true; }
      else storageWarning = '网站连接已更新，已使用最新发布的设置。旧本机设置仍保留在此浏览器。';
    }
    const savedFavorites = JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]');
    if (Array.isArray(savedFavorites)) favorites = new Set(savedFavorites.filter((id) => typeof id === 'string'));
    if (localStorage.getItem(VIEW_KEY) === 'list') activeView = 'list';
  } catch {
    catalog = validateCatalog(published);
    draft = false;
    storageWarning = '本地目录未能读取，已使用网站发布的目录。你仍可浏览和导出。';
  }

  function fileSize(asset) {
    if (asset.sizeMB === null) return asset.demo ? '演示素材' : '大小未填写';
    return asset.sizeMB >= 1024 ? `${(asset.sizeMB / 1024).toFixed(2)} GB` : `${Number(asset.sizeMB.toFixed(2))} MB`;
  }

  function audioArt() {
    const artwork = element('div', 'audio-art');
    artwork.setAttribute('aria-hidden', 'true');
    for (let index = 0; index < 28; index++) {
      const bar = element('span');
      bar.style.height = `${10 + Math.abs(Math.sin(index * .68) * Math.cos(index * .13)) * 65}px`;
      artwork.append(bar);
    }
    return artwork;
  }

  function fallback(type, label = '') {
    const node = element('div', 'preview-fallback');
    node.append(icon({ image:'image', video:'play', audio:'music-notes', animation:'image', other:'file' }[type] || 'file'));
    if (label) node.append(element('small', '', label));
    return node;
  }

  function tagsFor(asset) {
    const node = element('div', 'tag-list');
    asset.tags.forEach((tag) => node.append(element('span', 'tag', tag)));
    return node;
  }

  function favoriteLabel(button, asset) {
    const selected = favorites.has(asset.id);
    button.replaceChildren(icon(selected ? 'heart-filled' : 'heart'));
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-label', `${selected ? '取消收藏' : '收藏'} ${asset.name}`);
    button.setAttribute('aria-pressed', String(selected));
  }

  async function toggleFavorite(asset) {
    const on = !favorites.has(asset.id), next = new Set(favorites);
    if (on) next.add(asset.id); else next.delete(asset.id);
    if (!isOpenList()) {
      try { localStorage.setItem(FAVORITES_KEY, JSON.stringify([...next])); }
      catch { toast('浏览器无法保存收藏，请检查本地存储设置。'); return; }
    }
    favorites = next;
    showFavorite(asset, true);
    toast(on ? '已收藏' : '已取消收藏');
    if (!isOpenList()) return;
    try { await window.OpenListClient.manage(catalog.config, 'favorite', { ids: [asset.id], on }, AbortSignal.timeout(20000)); cacheFavorites(); }
    catch (error) {
      // 没存上就恢复原样，免得手机和电脑看到的不一样。
      favorites = new Set(favorites); if (on) favorites.delete(asset.id); else favorites.add(asset.id);
      showFavorite(asset, false); toast(error.message);
    }
  }
  function showFavorite(asset, pop) {
    render();
    if (pop) window.StudioMotion.pop($(`.asset-card[data-id="${CSS.escape(asset.id)}"] .favorite-button`));
    if (activeAsset) { updateDetailFavorite(); if (pop) window.StudioMotion.pop($('#detail-favorite .icon')); }
  }

  // 多选：点“多选”或按住 Ctrl / Shift 点卡片；选中后可一起移动或移入回收站。
  const canSelect = asset => canManage() && asset.managed && !asset.deleted && !asset.pending && activeType !== 'trash';
  function setSelecting(on) {
    selecting = on;
    if (!on) selection.clear();
    document.body.classList.toggle('is-selecting', on);
    $('#select-button').setAttribute('aria-pressed', String(on));
    const bar = $('#selection-bar');
    if (on && bar.hidden) window.StudioMotion.reveal(bar);
    else if (!on && !bar.hidden) window.StudioMotion.conceal(bar);
    document.querySelectorAll('.asset-card[data-id]').forEach(card => card.classList.toggle('is-selected', selection.has(card.dataset.id)));
    updateSelection();
  }
  function toggleSelected(id, card) {
    if (!selecting) setSelecting(true);
    if (selection.has(id)) selection.delete(id); else selection.add(id);
    card.classList.toggle('is-selected', selection.has(id));
    if (selection.has(id)) window.StudioMotion.pop(card.querySelector('.select-mark'));
    updateSelection();
  }
  function updateSelection() {
    $('#selection-count').textContent = selection.size ? `已选 ${selection.size} 项` : '点选素材';
    $('#selection-move').disabled = $('#selection-trash').disabled = !selection.size;
  }

  // 拖动整理：电脑按住直接拖，手机和平板长按后拖。卡片浮起跟着走：放到文件夹或路径上的上一级就是移动；
  // 在“全部素材”里放到同组卡片之间就是排序，排好的顺序所有成员都一样。手机长按后不动就松手，弹出操作菜单。
  let press = null, drag = null, renderLater = false, suppressClick = 0;
  function draggable(card, asset) {
    if (!canSelect(asset)) return;
    card.addEventListener('pointerdown', event => {
      if (press || drag || event.button !== 0 || !event.isPrimary || event.target.closest('.card-actions,.card-meta,a')) return;
      press = { card, asset, pointer: event.pointerId, type: event.pointerType, x: event.clientX, y: event.clientY, timer: 0 };
      if (event.pointerType !== 'mouse') press.timer = setTimeout(() => liftCard(press.x, press.y), 320);
    });
  }
  function dropTarget(node, folder) { if (canManage()) node.dataset.dropFolder = folder; }
  function cancelPress() { if (press) clearTimeout(press.timer); press = null; }
  const canReorder = d => d.ids.length === 1 && activeType === 'all' && !$('#search-input').value.trim();
  function liftCard(x, y) {
    const { card, asset, pointer, type } = press; cancelPress();
    if (!card.isConnected) return;
    if (manageBusy || uploading) { toast('请先等待当前操作完成。'); return; }
    const ids = selection.has(asset.id) ? [...selection] : [asset.id];
    const tile = card.querySelector('.preview-button'), rect = tile.getBoundingClientRect();
    // 浮起的是缩略图的一份拷贝，原卡片留在原位变淡，标出放回去的位置。
    const ghost = element('div', 'asset-grid drag-ghost'); ghost.setAttribute('aria-hidden', 'true');
    const copy = tile.cloneNode(true); copy.removeAttribute('aria-label'); copy.tabIndex = -1;
    ghost.append(copy);
    if (ids.length > 1) { ghost.classList.add('is-stack'); ghost.append(element('b', 'drag-count', String(ids.length))); }
    const ox = x - rect.left, oy = y - rect.top;
    ghost.style.width = `${rect.width}px`;
    ghost.style.translate = `${rect.left}px ${rect.top}px`;
    ghost.style.transformOrigin = `${ox}px ${oy}px`;
    document.body.append(ghost);
    drag = { card, asset, ids, pointer, type, ghost, x, y, startX: x, startY: y, gx: rect.left, gy: rect.top, ox, oy, target: null, home: [...card.parentNode.children].indexOf(card), shifted: 0, kind: kindOf(asset) };
    dragIds = ids;
    card.classList.add('is-lifted');
    document.body.classList.add('is-moving-assets');
    getSelection()?.removeAllRanges();
    navigator.vibrate?.(10);
    presence({ action: 'move', detail: '' });
    // 先轻轻弹起，再缩到不挡住目标的大小。
    requestAnimationFrame(() => { ghost.style.setProperty('--s', String(Math.min(1, 168 / rect.width))); ghost.classList.add('is-up'); });
    drag.frame = requestAnimationFrame(followDrag);
  }
  function followDrag() {
    const d = drag; if (!d) return;
    // 拖到屏幕上下边缘时自动滚动。
    const top = 90, bottom = innerHeight - 90;
    const speed = d.y < top ? -(top - d.y) / 5 : d.y > bottom ? (d.y - bottom) / 5 : 0;
    if (speed) scrollBy(0, Math.max(-20, Math.min(20, speed)));
    d.gx += (d.x - d.ox - d.gx) * .42; d.gy += (d.y - d.oy - d.gy) * .42;
    d.ghost.style.translate = `${d.gx}px ${d.gy}px`;
    hitTest(d);
    d.frame = requestAnimationFrame(followDrag);
  }
  function hitTest(d) {
    const under = document.elementFromPoint(d.x, d.y);
    if (under?.closest('.folder-toggle')) setFoldersOpen(true);
    const target = under?.closest('[data-drop-folder]') || null;
    if (target !== d.target) {
      d.target?.classList.remove('is-drop-target');
      d.target = target;
      target?.classList.add('is-drop-target');
      d.ghost.classList.toggle('is-over-folder', Boolean(target));
      if (target) navigator.vibrate?.(6);
    }
    if (!target) reorderAt(d);
  }
  // 按卡片的布局位置判断指在哪张上（不受滑动动画影响），同组之间才换位。
  function reorderAt(d) {
    if (!canReorder(d) || performance.now() - d.shifted < 90) return;
    const grid = d.card.parentNode, base = d.card.offsetParent?.getBoundingClientRect();
    if (!base) return;
    const px = d.x - base.left, py = d.y - base.top;
    const over = [...grid.children].find(card => card !== d.card && card.matches('.asset-card:not(.folder-card)') && px >= card.offsetLeft && px < card.offsetLeft + card.offsetWidth && py >= card.offsetTop && py < card.offsetTop + card.offsetHeight);
    const asset = over && cloudAssets.find(item => item.id === over.dataset.id);
    if (!asset || kindOf(asset) !== d.kind || asset.pending) return;
    const after = grid.classList.contains('list-view') ? py > over.offsetTop + over.offsetHeight / 2 : px > over.offsetLeft + over.offsetWidth / 2;
    const next = after ? over.nextSibling : over;
    if (next === d.card || next === d.card.nextSibling) return;
    d.shifted = performance.now();
    window.StudioMotion.reflow(grid, () => grid.insertBefore(d.card, next));
  }
  function dropCard(cancel = false) {
    const d = drag; if (!d) return;
    drag = null; dragIds = null; cancelAnimationFrame(d.frame);
    presence({ action: '', detail: '' });
    suppressClick = Date.now() + 400;
    document.body.classList.remove('is-moving-assets');
    d.target?.classList.remove('is-drop-target');
    const ghost = d.ghost;
    const finish = () => { ghost.remove(); d.card.classList.remove('is-lifted'); if (renderLater || cancel) render(); };
    const fly = (x, y, scale, done) => {
      ghost.classList.add('is-landing');
      ghost.style.translate = `${x}px ${y}px`; ghost.style.setProperty('--s', String(scale));
      setTimeout(done, 420);
    };
    if (!cancel && d.target) {
      // 放进文件夹：浮起的卡片缩进目标里，文件夹轻轻一弹。
      const folder = d.target.dataset.dropFolder, rect = d.target.getBoundingClientRect();
      ghost.classList.add('is-into');
      fly(rect.left + rect.width / 2 - d.ox, rect.top + rect.height / 2 - d.oy, .1, () => ghost.remove());
      d.card.classList.remove('is-lifted');
      moveAssets(d.ids, folder);
      if (renderLater) render();
      setTimeout(() => {
        const landed = document.querySelector(`.asset-card[data-id="${CSS.escape('folder:' + folder)}"] .icon`) || (d.target.isConnected ? d.target : null);
        window.StudioMotion.pop(landed);
      }, 260);
      return;
    }
    // 手机长按后没有拖动：当作“更多操作”。
    if (!cancel && d.type !== 'mouse' && Math.hypot(d.x - d.startX, d.y - d.startY) < 12) {
      const menu = d.card.querySelector('.asset-menu-button');
      if (menu) setTimeout(() => showAssetActions(menu, d.asset, d.card), 60);
    }
    const moved = !cancel && [...d.card.parentNode.children].indexOf(d.card) !== d.home;
    const slot = d.card.querySelector('.preview-button').getBoundingClientRect();
    fly(slot.left, slot.top, 1, finish);
    if (moved) saveOrder(d);
  }
  addEventListener('pointermove', event => {
    if (press && event.pointerId === press.pointer) {
      const far = Math.hypot(event.clientX - press.x, event.clientY - press.y) > (press.type === 'mouse' ? 6 : 10);
      if (far && press.type === 'mouse') liftCard(event.clientX, event.clientY);
      else if (far) cancelPress(); // 长按前手指已经移动：这是在滑动页面。
    }
    if (drag && event.pointerId === drag.pointer) { event.preventDefault(); drag.x = event.clientX; drag.y = event.clientY; }
  }, { passive: false });
  addEventListener('pointerup', event => {
    if (press?.pointer === event.pointerId) cancelPress();
    if (drag?.pointer === event.pointerId) { drag.x = event.clientX; drag.y = event.clientY; hitTest(drag); dropCard(); } // 拖得很快时，松手这一刻再认一次目标。
  });
  addEventListener('pointercancel', event => { if (press?.pointer === event.pointerId) cancelPress(); if (drag?.pointer === event.pointerId) dropCard(true); });
  addEventListener('blur', () => { cancelPress(); dropCard(true); });
  document.addEventListener('touchmove', event => { if (drag) event.preventDefault(); }, { passive: false });
  document.addEventListener('contextmenu', event => { if (drag || (press && press.type !== 'mouse')) event.preventDefault(); }, true);
  document.addEventListener('click', event => { if (Date.now() < suppressClick && event.target.closest?.('.asset-card')) { event.preventDefault(); event.stopPropagation(); } }, true);
  // 排序只改网站目录：先在页面上排好，后台没存上再恢复。
  async function saveOrder(d) {
    const ids = [...$('#asset-grid').children].map(card => cloudAssets.find(item => item.id === card.dataset.id)).filter(item => item && !item.pending && kindOf(item) === d.kind).map(item => item.id);
    const before = cloudAssets, position = new Map(ids.map((id, index) => [id, index]));
    cloudAssets = cloudAssets.map(item => position.has(item.id) ? { ...item, order: position.get(item.id) } : item);
    if ($('#sort-select').value !== 'custom') { $('#sort-select').value = 'custom'; rememberSort(); toast('已切换为自定义顺序'); }
    renderLater = true;
    manageBusy = true;
    try {
      await window.OpenListClient.manage(catalog.config, 'order', { folder: currentFolder, ids }, AbortSignal.timeout(20000));
      organized();
      cacheAssets();
    } catch (error) { cloudAssets = before; render(); toast(error.message); }
    finally { manageBusy = false; }
  }
  function cacheAssets() {
    try {
      const data = JSON.parse(localStorage.getItem(CATALOG_CACHE) || 'null');
      const order = new Map(cloudAssets.map(item => [item.id, item.order]));
      if (data) localStorage.setItem(CATALOG_CACHE, JSON.stringify({ ...data, assets: data.assets.map(item => order.has(item.id) ? { ...item, order: order.get(item.id) } : item) }));
    } catch { /* 下次打开时以后台为准。 */ }
  }
  // 排序方式记在这台浏览器上。
  const SORT_KEY = 'studio-sort-v1';
  function rememberSort() { try { localStorage.setItem(SORT_KEY, $('#sort-select').value); } catch { /* 只是下次回到默认排序。 */ } }
  try { const saved = localStorage.getItem(SORT_KEY); if (saved && $(`#sort-select option[value="${saved}"]`)) $('#sort-select').value = saved; } catch { /* 默认排序 */ }

  // 移动只改网站目录：先在页面上挪过去，后台确认失败再挪回来。
  async function moveAssets(ids, folder) {
    const moving = ids.filter(id => { const asset = cloudAssets.find(item => item.id === id); return asset && folderOf(asset) !== folder; });
    if (!moving.length) return;
    if (manageBusy || uploading) { toast('请先等待当前操作完成。'); return; }
    manageBusy = true;
    const before = cloudAssets;
    const tags = folder ? folder.split('/') : [];
    cloudAssets = cloudAssets.map(asset => moving.includes(asset.id) ? { ...asset, tags, folder: folder || '根目录' } : asset);
    if (selecting) setSelecting(false);
    render();
    try {
      await window.OpenListClient.manage(catalog.config, 'move', { ids: moving, folder }, AbortSignal.timeout(30000));
      organized();
      toast(`已移动 ${moving.length} 项到“${folder ? folder.split('/').at(-1) : TITLES.all}”`);
      manageBusy = false;
      await refreshCloud();
    } catch (error) { cloudAssets = before; render(); toast(error.message); }
    finally { manageBusy = false; }
  }

  // 进入文件夹、切换分类、返回上一级都经过这里，并写进地址栏。
  function navigate(type, folder = currentFolder, push = true) {
    const changed = type !== activeType || (!isSpecial(type) && folder !== currentFolder);
    activeType = type;
    if (!isSpecial(type)) currentFolder = folder;
    if (selecting) setSelecting(false);
    writeHash(push && changed);
    render();
    const top = $('.library').getBoundingClientRect().top;
    if (changed && top < 0) window.scrollTo({ top: scrollY + top - 12, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }
  window.addEventListener('popstate', () => {
    ({ type: activeType, folder: currentFolder } = readHash());
    if (selecting) setSelecting(false);
    render();
  });

  function renderBreadcrumb(special) {
    const nav = $('#breadcrumb');
    const parts = special ? [] : currentFolder.split('/').filter(Boolean);
    const crumbs = [[TITLES[activeType], ''], ...parts.map((name, index) => [name, parts.slice(0, index + 1).join('/')])];
    const key = JSON.stringify([activeType, crumbs, canManage()]);
    if (nav.dataset.key === key) return;
    const first = !nav.dataset.key;
    nav.dataset.key = key;
    nav.replaceChildren(...crumbs.flatMap(([label, path], index) => {
      const separator = element('span', 'crumb-separator', '›'); separator.setAttribute('aria-hidden', 'true');
      let node;
      if (index === crumbs.length - 1) { node = element('h2', '', label); node.id = 'library-title'; }
      else {
        node = element('button', 'crumb', label); node.type = 'button';
        node.addEventListener('click', () => navigate(activeType, path));
        dropTarget(node, path);
      }
      return index ? [separator, node] : [node];
    }));
    if (!first) window.StudioMotion.swap(nav);
  }

  function folderCardFor(path, count) {
    const name = path.split('/').at(-1);
    const card = element('article', 'asset-card folder-card');
    card.dataset.id = 'folder:' + path;
    const open = element('button', 'preview-button folder-preview'); open.type = 'button';
    open.setAttribute('aria-label', `打开文件夹 ${name}`);
    open.append(icon('folder-fill'));
    open.addEventListener('click', () => navigate(activeType, path));
    const content = element('div', 'card-content');
    const titleRow = element('div', 'card-title-row');
    const title = element('button', 'card-title', name); title.title = name;
    title.addEventListener('click', () => navigate(activeType, path));
    const actions = element('div', 'card-actions');
    if (canManage()) {
      const more = element('button', 'asset-menu-button'); more.type = 'button';
      more.setAttribute('aria-label', `整理文件夹 ${name}`); more.title = '重命名、移动或删除';
      more.append(moreIcon());
      more.addEventListener('click', () => openManage('folder-edit', { folder: path }));
      actions.append(more);
    }
    titleRow.append(title, actions);
    const meta = element('div', 'card-meta'); meta.append(element('span', 'card-size', count ? `${count} 份` : '空文件夹'));
    content.append(titleRow, meta);
    card.append(open, content);
    dropTarget(card, path);
    return card;
  }

  function downloadLink(asset) {
    const download = element('a', 'card-download');
    download.append(icon('file-download'));
    download.title = '下载';
    download.href = asset.cloud ? cloudClient().downloadUrl(catalog.config, asset) : safeUrl(asset.sourceUrl);
    download.setAttribute('aria-label', `下载 ${asset.name}${asset.cloud && asset.provider === 'pcloud' ? '（ZIP）' : ''}`);
    if (asset.demo) download.download = asset.sourceUrl.split('/').pop();
    if (asset.provider === 'google') { download.target = '_blank'; download.rel = 'noopener noreferrer'; }
    if (asset.provider === 'openlist') download.addEventListener('click', event => downloadOpenList(event, asset));
    return download;
  }

  function cardFor(asset) {
    const card = element('article', 'asset-card');
    card.dataset.id = asset.id;
    const preview = element('button', 'preview-button');
    if (asset.type === 'video') preview.dataset.surface = 'opaque';
    preview.setAttribute('aria-label', `预览 ${asset.name}`);
    // 先显示占位，进入可见区域后读取小型缩略图；视频不自动播放。
    if (asset.type === 'audio') preview.append(audioArt());
    else preview.append(fallback(asset.type, asset.pending ? '移动待确认' : ''));
    const mark = element('span', 'select-mark'); mark.setAttribute('aria-hidden', 'true'); mark.append(icon('check'));
    preview.append(mark);
    card.classList.toggle('is-selected', selection.has(asset.id));
    // 多选时点卡片是选中；按住 Ctrl / Shift 点卡片直接进入多选。
    const activate = event => {
      if (canSelect(asset) && (selecting || event.ctrlKey || event.metaKey || event.shiftKey)) { event.preventDefault(); toggleSelected(asset.id, card); return; }
      openDetail(asset);
    };
    preview.addEventListener('click', activate);
    const content = element('div', 'card-content');
    const titleRow = element('div', 'card-title-row');
    const title = element('button', 'card-title', asset.name); title.title = asset.name;
    title.addEventListener('click', activate);
    // 操作收在名称右侧：电脑上悬停才出现，手机上只留“···”；已收藏的爱心一直显示。
    const actions = element('div', 'card-actions');
    const live = !asset.deleted && !asset.pending;
    if (live && !viewOnly()) {
      const favorite = element('button', 'favorite-button'); favorite.type = 'button';
      favoriteLabel(favorite, asset);
      favorite.addEventListener('click', () => toggleFavorite(asset));
      actions.append(favorite, downloadLink(asset));
    }
    if ((live && !viewOnly()) || canManage()) {
      const more = element('button', 'asset-menu-button'); more.type = 'button';
      more.setAttribute('aria-label', `更多操作 ${asset.name}`); more.title = '更多';
      more.append(moreIcon());
      more.addEventListener('click', () => showAssetActions(more, asset, card));
      actions.append(more);
    }
    titleRow.append(title, actions);
    // 第二行浅色信息：不在当前文件夹时先写它在哪（点一下过去），再写大小。
    const meta = element('div', 'card-meta');
    const place = folderOf(asset);
    const relative = !isSpecial() && currentFolder && within(place, currentFolder) ? place.slice(currentFolder.length + 1) : place;
    if (asset.cloud && relative) {
      const chip = element('button', 'folder-chip', relative.split('/').join(' / ')); chip.type = 'button';
      chip.title = `打开文件夹 ${place.split('/').join(' / ')}`;
      chip.addEventListener('click', () => navigate('all', place));
      meta.append(chip);
    }
    meta.append(element('span', asset.demo ? 'card-size demo-tag' : 'card-size', fileSize(asset)));
    if (!live) {
      preview.disabled = true; title.disabled = true;
      if (canManage()) {
        const restore = element('button', 'card-restore', asset.pending ? '重试移动' : '恢复'); restore.type = 'button';
        restore.addEventListener('click', () => openManage(asset.pending ? (asset.deleted ? 'restore' : 'trash') : 'restore', asset));
        meta.append(restore);
      }
    }
    content.append(titleRow, meta);
    card.append(preview, content);
    draggable(card, asset);
    return card;
  }

  // 同类放一起：混在一起的列表按 图片 → 动图 → 视频 → 音频 分组，各组内再按所选顺序排。
  const KINDS = [['image', '图片'], ['gif', '动图'], ['video', '视频'], ['audio', '音频'], ['other', '其他']];
  const kindOf = asset => asset.type === 'animation' || (asset.type === 'image' && /.(gif|apng)$/i.test(asset.name)) ? 'gif' : KINDS.some(([kind]) => kind === asset.type) ? asset.type : 'other';
  const kindRank = asset => KINDS.findIndex(([kind]) => kind === kindOf(asset));
  function groupHeading(id, label, count) {
    const heading = element('h3', 'grid-group', label);
    heading.dataset.id = 'group:' + id;
    heading.append(element('span', 'group-count', String(count)));
    // 收成小分栏后，点它回到这一组的开头。
    heading.addEventListener('click', () => { if (heading.classList.contains('is-stuck')) scrollToGroup(heading); });
    return heading;
  }
  // 往下滑时各组小标题滑到顶部依次叠成小分栏（CSS sticky）；这里只标出哪些已经收起，
  // 收起的那条显示阴影和这一组的几张小缩略图。
  let stuckFrame = 0;
  function updateStuck() {
    stuckFrame = 0;
    for (const node of document.querySelectorAll('.section-heading, #asset-grid > .grid-group')) {
      const top = parseFloat(getComputedStyle(node).top);
      const stuck = scrollY > 0 && Number.isFinite(top) && node.getBoundingClientRect().top <= top + .5;
      if (stuck === node.classList.contains('is-stuck')) continue;
      node.classList.toggle('is-stuck', stuck);
      if (stuck && node.matches('.grid-group:not(.folder-toggle)') && !node.querySelector('.group-peek')) {
        const peek = element('span', 'group-peek'); peek.setAttribute('aria-hidden', 'true');
        for (let card = node.nextElementSibling; card && !card.classList.contains('grid-group') && peek.children.length < 4; card = card.nextElementSibling) {
          const source = card.querySelector('.preview-button > img');
          if (source?.src) { const image = element('img'); image.src = source.src; image.alt = ''; peek.append(image); }
        }
        if (peek.children.length) node.append(peek);
      }
    }
  }
  const watchStuck = () => { if (!stuckFrame) stuckFrame = requestAnimationFrame(updateStuck); };
  // 面板上沿的小横条：点一下把面板推上去盖住 Logo；已经盖住时再点回到顶上。
  $('#sheet-grabber').addEventListener('click', () => {
    const top = $('.library').getBoundingClientRect().top + scrollY;
    scrollTo({ top: scrollY < top - 1 ? top : 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  });
  addEventListener('scroll', watchStuck, { passive: true });
  addEventListener('resize', watchStuck, { passive: true });
  function scrollToGroup(heading) {
    let first = heading.nextElementSibling;
    while (first && !first.getClientRects().length) first = first.nextElementSibling;
    if (!first || first.classList.contains('grid-group')) return;
    const top = first.getBoundingClientRect().top + scrollY - (parseFloat(getComputedStyle(heading).top) || 0) - heading.offsetHeight - 16;
    scrollTo({ top: Math.max(0, top), behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }

  // 文件夹那一组的小标题可以点：收起时只剩“文件夹 N ›”。
  function folderToggle(count) {
    const heading = element('h3', 'grid-group folder-toggle');
    heading.dataset.id = 'group:folders';
    const button = element('button', '', '文件夹'); button.type = 'button';
    button.setAttribute('aria-expanded', String(foldersOpen));
    button.append(element('span', 'group-count', String(count)), icon('caret-right'));
    // 收成小分栏时，点它展开并回到文件夹；平时点它展开或收起。
    button.addEventListener('click', () => {
      if (!heading.classList.contains('is-stuck')) { setFoldersOpen(!foldersOpen); return; }
      setFoldersOpen(true); scrollToGroup(heading);
    });
    heading.append(button);
    return heading;
  }
  function setFoldersOpen(open) {
    if (foldersOpen === open) return;
    foldersOpen = open;
    const grid = $('#asset-grid');
    grid.querySelector('.folder-toggle button')?.setAttribute('aria-expanded', String(open));
    if (!grid.querySelector('.folder-toggle')) return;
    window.StudioMotion.reflow(grid, () => grid.classList.toggle('folders-collapsed', !foldersOpen), open ? [] : [...grid.querySelectorAll('.folder-card')]);
  }

  // 成员在线：左侧列出在线的人（绿点 + Online + 名字）；正在上传、拖动或整理的显示“操控中”和在哪个文件夹。
  const ACTION_TEXT = { upload: '上传', move: '拖动', organize: '整理' };
  const ACTION_TTL = { upload: 120000, move: 60000, organize: 20000 };
  let presenceTimer = 0, organizeTimer = 0, presenceNames = new Set();
  function presence(patch) { window.StudioPresence?.update(patch); }
  // 刚完成一次整理：别人那里亮 20 秒“操控中”，之后自己清掉。
  function organized() {
    presence({ action: 'organize', detail: '' });
    clearTimeout(organizeTimer);
    organizeTimer = setTimeout(() => presence({ action: '', detail: '' }), ACTION_TTL.organize);
  }
  function syncPresence() {
    const session = isOpenList() ? memberSession() : null;
    if (!session?.token || !session.endpoint || !window.StudioPresence) { window.StudioPresence?.disconnect(); return; }
    window.StudioPresence.connect(`${session.endpoint.replace(/^http/, 'ws')}/api/studio_presence`, session.token);
    presence({ folder: isSpecial() ? '' : currentFolder });
  }
  function renderPresence() {
    clearTimeout(presenceTimer);
    const members = window.StudioPresence?.members || [], box = $('#presence');
    box.hidden = !members.length;
    if (!members.length) { box.classList.remove('is-open'); presenceNames = new Set(); return; }
    const me = memberSession()?.username, now = Date.now();
    let soonest = Infinity;
    // 自己排第一，其他人按上线先后。
    $('#presence-list').replaceChildren(...[...members].sort((a, b) => (b.name === me) - (a.name === me)).map(member => {
      const left = ACTION_TEXT[member.action] ? ACTION_TTL[member.action] - (now - member.localAt) : 0;
      const busy = left > 0, place = member.folder.split('/').at(-1);
      if (busy) soonest = Math.min(soonest, left);
      const status = busy ? '操控中' : member.visible ? 'Online' : '离开';
      const detail = busy ? `${ACTION_TEXT[member.action]}${member.detail ? ' ' + member.detail : ''} · ${place || TITLES.all}` : member.visible && place ? `在「${place}」` : '';
      const name = member.name === me ? `${member.name}（你）` : member.name;
      const row = element('li', `presence-row is-${busy ? 'busy' : member.visible ? 'online' : 'away'}`);
      if (presenceNames.size && !presenceNames.has(member.name)) row.classList.add('is-new'); // 新上线的人滑进来，其他行不重复动画。
      row.title = [name, member.visible || busy ? status : '页面在后台', detail].filter(Boolean).join(' · ');
      const avatar = element('span', 'presence-avatar', [...member.name][0]?.toUpperCase() || '?'); avatar.setAttribute('aria-hidden', 'true');
      const line = element('span', 'presence-line');
      line.append(element('i', 'presence-dot'), element('span', 'presence-status', status), element('span', 'presence-name', member.name)); // “（你）”只放在悬停提示里，窄栏里不挤掉名字。
      row.append(avatar, line);
      if (detail) row.append(element('span', 'presence-detail', detail));
      return row;
    }));
    presenceNames = new Set(members.map(member => member.name));
    $('#presence-count').textContent = `${members.length} 在线`;
    // 别人的“操控中”到时自己隐去，不再向后台询问。
    if (soonest < Infinity) presenceTimer = setTimeout(renderPresence, soonest + 50);
  }
  window.StudioPresence?.onChange(renderPresence);
  // 手机上是一个“● 3 在线”小胶囊，点开看名单。
  $('#presence-toggle').addEventListener('click', () => {
    const open = $('#presence').classList.toggle('is-open');
    $('#presence-toggle').setAttribute('aria-expanded', String(open));
  });
  document.addEventListener('click', event => {
    if ($('#presence').classList.contains('is-open') && !event.target.closest?.('#presence')) { $('#presence').classList.remove('is-open'); $('#presence-toggle').setAttribute('aria-expanded', 'false'); }
  });

  function render() {
    if (drag) { renderLater = true; return; } // 拖动中不重排网格，放下后再刷新。
    renderLater = false;
    syncPresence();
    document.body.classList.toggle('is-viewer', viewOnly());
    const term = $('#search-input').value.trim().toLocaleLowerCase('zh-CN');
    const sort = $('#sort-select').value;
    const special = isSpecial();
    const assets = allAssets();
    // 已知文件夹：后台保存的，加上素材所在路径的每一层。
    const known = new Set(cloudFolders);
    for (const asset of (isCloud() ? cloudAssets : catalog.assets)) if (!asset.deleted) asset.tags.forEach((_, index) => known.add(asset.tags.slice(0, index + 1).join('/')));
    if (currentFolder && !cloudBusy && isCloud() && memberSession() && !known.has(currentFolder)) { currentFolder = ''; writeHash(false); }
    // 全部素材且没有搜索时像文件管理器：先列下一层文件夹，再列这一层的素材。
    // 图片/视频/音频和搜索则列出当前位置及其所有下层里符合的素材。
    const browse = activeType === 'all' && !term;
    const matchesTerm = asset => !term || [asset.name, asset.description, asset.member, ...asset.tags].join(' ').toLocaleLowerCase('zh-CN').includes(term);
    const visible = assets.filter(asset => {
      if (activeType === 'trash') return matchesTerm(asset);
      if (activeType === 'favorites') return favorites.has(asset.id) && matchesTerm(asset);
      const place = folderOf(asset);
      if (browse ? place !== currentFolder : !within(place, currentFolder)) return false;
      const matchesType = activeType === 'all' || (activeType === 'image' ? ['image', 'animation'].includes(asset.type) : asset.type === activeType);
      return matchesType && matchesTerm(asset);
    }).sort((a, b) => kindRank(a) - kindRank(b) || compare(a, b));
    function compare(a, b) {
      if (sort === 'name') return a.name.localeCompare(b.name, 'zh-CN');
      // 自定义顺序：还没排过的（比如新上传的）排在前面，按添加时间。
      if (sort === 'custom') return (a.order ?? -1) - (b.order ?? -1) || String(b.modified || b.date).localeCompare(String(a.modified || a.date));
      if (sort === 'largest' || sort === 'smallest') {
        if (a.sizeMB === null) return b.sizeMB === null ? 0 : 1;
        if (b.sizeMB === null) return -1;
        return sort === 'largest' ? b.sizeMB - a.sizeMB : a.sizeMB - b.sizeMB;
      }
      return sort === 'oldest' ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date);
    }
    const subfolders = browse ? [...known].filter(path => parentOf(path) === currentFolder).sort((a, b) => a.localeCompare(b, 'zh-CN')) : [];
    $('#asset-grid').classList.toggle('list-view', activeView === 'list');
    filteredAssets = visible;
    document.body.dataset.loading = String(cloudBusy);
    const countIn = path => assets.filter(asset => within(folderOf(asset), path)).length;
    // 只有一类时不加小标题；在“图片”里把不动的那组叫“静态图片”，免得和标题重复。
    const groups = KINDS.map(([kind, label]) => [kind, activeType === 'image' && kind === 'image' ? '静态图片' : label, visible.filter(asset => kindOf(asset) === kind)]).filter(([, , items]) => items.length);
    const headed = groups.length + (subfolders.length ? 1 : 0) > 1;
    const cards = [];
    // 这一层既有文件夹又有素材时，文件夹按折叠状态收起；只有文件夹时直接列出。
    $('#asset-grid').classList.toggle('folders-collapsed', headed && subfolders.length > 0 && !foldersOpen);
    if (subfolders.length) { if (headed) cards.push(folderToggle(subfolders.length)); cards.push(...subfolders.map(path => folderCardFor(path, countIn(path)))); }
    for (const [kind, label, items] of groups) { if (headed) cards.push(groupHeading(kind, label, items.length)); cards.push(...items.map(cardFor)); }
    // 小分栏按出现顺序叠在顶部：第几条就往下错开几格。
    cards.filter(card => card.classList.contains('grid-group')).forEach((heading, index) => heading.style.setProperty('--i', index));
    window.StudioMotion.grid($('#asset-grid'), cards);
    watchStuck();
    if (cloudBusy && !visible.length && !subfolders.length) {
      for (let index=0; index<6; index++) { const tile=element('div','asset-skeleton'); tile.setAttribute('aria-hidden','true'); $('#asset-grid').append(tile); }
    }
    observeThumbnails();
    const empty = !visible.length && !subfolders.length;
    $('#empty-state').hidden = !empty || cloudBusy;
    const needsLogin = isOpenList() && !memberSession();
    // 只有确实在搜索时，才给“清除搜索”。
    const filtered = Boolean(term);
    $('#empty-state h3').textContent = needsLogin ? '登录后查看素材' : filtered ? '没有找到素材' : activeType === 'trash' ? '回收站是空的' : activeType === 'favorites' ? '还没有收藏' : currentFolder ? '这个文件夹是空的' : '这里暂时没有素材';
    $('#empty-login').hidden = !needsLogin;
    $('#reset-filters').hidden = needsLogin || !filtered;
    renderBreadcrumb(special);
    // 返回键：收藏、回收站回到素材；文件夹里回到上一级。
    $('#view-back').hidden = !special && !currentFolder;
    $('#view-back').setAttribute('aria-label', special ? '返回全部素材' : '返回上一级');
    $('#view-back').title = $('#view-back').getAttribute('aria-label');
    $('#select-button').hidden = !canManage() || activeType === 'trash';
    $('#new-folder-button').hidden = !canManage() || !browse;
    $('#search-input').placeholder = currentFolder && !special ? `在“${currentFolder.split('/').at(-1)}”中搜索` : '搜索素材';
    $('#trash-button').classList.toggle('active', activeType === 'trash');
    $('#trash-button').setAttribute('aria-pressed', String(activeType === 'trash'));
    const demoCount = visible.filter((asset) => asset.demo).length;
    $('#results-text').textContent = cloudBusy && empty ? '' : `${subfolders.length ? `${subfolders.length} 个文件夹 · ` : ''}${visible.length} 份${demoCount ? ` · ${demoCount} 份演示` : ''}`;
    $('#nav-count').textContent = (isCloud() ? cloudAssets : catalog.assets).filter(a => !a.deleted).length;
    $('#refresh-button').disabled = cloudBusy;
    $('#draft-notice').hidden = !draft;
    $('#footer-status').textContent = isCloud() ? '' : draft ? '本机设置草稿 · 尚未发布' : '演示目录 · 尚未接入真实仓库';
    $('#upload-duplicate-note').textContent = isOpenList() ? '' : isGoogle() ? '同名文件保留为新文件。' : '同名文件自动改名。';
    document.querySelectorAll('[data-view]').forEach(button => {
      const selected = button.dataset.view === activeView;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    let activeCategory = null;
    document.querySelectorAll('[data-type]').forEach((button) => {
      const selected = button.dataset.type === activeType;
      if (selected) activeCategory = button;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    // 分类底色像灵动岛一样滑到选中项；收藏和回收站时收起。
    window.StudioMotion.indicator($('#sidebar-filters .nav-indicator'), activeCategory);
    const inFavorites = activeType === 'favorites';
    $('#favorites-button').classList.toggle('active', inFavorites);
    $('#favorites-button').setAttribute('aria-pressed', String(inFavorites));
    $('#favorites-button').setAttribute('aria-label', inFavorites ? '返回全部素材' : '查看收藏');
    $('#favorites-button').title = inFavorites ? '返回全部素材' : '查看收藏';
  }

  function setType(type) { navigate(type); }

  function canManage() { return isOpenList() && !!memberSession() && member?.canManage === true && !memberBusy; }
  // 只看账号（比如给朋友看的“游客”）：只能浏览、搜索、预览；上传、收藏、下载、复制、整理、回收站都不出现。
  function viewOnly() { return isOpenList() && !!memberSession() && member?.canManage === false; }
  function moreIcon() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add('icon'); svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true');
    for (const x of [5, 12, 19]) { const dot = document.createElementNS(svg.namespaceURI, 'circle'); dot.setAttribute('cx', x); dot.setAttribute('cy', '12'); dot.setAttribute('r', '1.8'); dot.setAttribute('fill', 'currentColor'); svg.append(dot); }
    return svg;
  }
  // 复制图片：可直接粘贴到聊天、PS 或剪辑软件。剪贴板只收 PNG，GIF 会变成第一帧。
  const canCopy = asset => asset.type === 'image' && asset.provider === 'openlist' && Boolean(navigator.clipboard?.write && window.ClipboardItem);
  function copyImage(asset) {
    const input = { ...catalog.config }, session = memberSession();
    const png = (async () => {
      const result = await window.StudioPreviewCache.load(previewKey(input, session, asset, 'image'), () => window.OpenListClient.resolve(input, asset, AbortSignal.timeout(20000)), { kind: 'image', limit: 20 * 1048576 });
      if (result.blob.type === 'image/png') return result.blob;
      const bitmap = await createImageBitmap(result.blob);
      const canvas = element('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
      canvas.getContext('2d').drawImage(bitmap, 0, 0); bitmap.close?.();
      return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('这张图片无法复制。')), 'image/png'));
    })();
    png.catch(() => {});
    toast('正在复制…');
    // 先把“稍后给出图片”交给剪贴板，Safari 才认这次点击；不支持的浏览器等图片好了再写。
    let writing;
    try { writing = navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]); }
    catch { writing = png.then(blob => navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])); }
    writing.then(() => toast('已复制，可以直接粘贴'), error => toast(error?.name === 'NotAllowedError' ? '浏览器没有允许复制图片。' : error?.message || '这张图片无法复制。'));
  }
  function showAssetActions(trigger, asset, card) {
    const menu = $('#asset-actions');
    const manage = asset.managed && canManage();
    const items = asset.deleted ? (manage ? [['restore', '恢复素材']] : [])
      : asset.pending ? (manage ? [['trash', '重试移入回收站']] : [])
      : [...(viewOnly() ? [] : [['favorite', favorites.has(asset.id) ? '取消收藏' : '收藏'], ['download', '下载'], ...(canCopy(asset) ? [['copy', '复制图片']] : [])]), ...(manage ? [['rename', '重命名'], ['move', '移动到…'], ['trash', '移入回收站']] : [])];
    if (!items.length) return;
    menu.replaceChildren(...items.map(([action, label]) => {
      const button = element('button', action === 'trash' ? 'danger' : '', label); button.type = 'button';
      button.addEventListener('click', () => {
        menu.hidePopover();
        if (action === 'favorite') toggleFavorite(asset);
        else if (action === 'download') card?.querySelector('.card-download')?.click();
        else if (action === 'copy') copyImage(asset);
        else openManage(action, asset);
      });
      return button;
    }));
    menu.showPopover();
    const rect = trigger.getBoundingClientRect();
    menu.style.left = `${Math.max(12, Math.min(rect.right - 180, window.innerWidth - 192))}px`;
    menu.style.top = `${Math.max(12, Math.min(rect.bottom + 6, window.innerHeight - menu.offsetHeight - 12))}px`;
  }
  let manageIntent = null, manageBusy = false;
  function openManage(action, asset = {}) {
    if (!canManage()) { openMember(); return; }
    if (manageBusy || uploading) { toast('请先等待当前操作完成。'); return; }
    const dialog = $('#manage-dialog');
    const folderAction = action.startsWith('folder-');
    const count = asset.ids?.length || 0;
    const folder = folderAction ? asset.folder || '' : (asset.tags || []).join('/');
    const current = action === 'folder-create' || action === 'move-many' ? uploadFolder() : folder;
    manageIntent = { action, asset, current };
    const names = { rename: '重命名', move: '移动到', 'move-many': `移动 ${count} 项到`, trash: '移入回收站', 'trash-many': '移入回收站', restore: '恢复素材', 'folder-create': '新建文件夹', 'folder-edit': '文件夹' };
    $('#manage-title').textContent = names[action];
    $('#manage-name-label').hidden = !['rename', 'folder-create', 'folder-edit'].includes(action);
    $('#manage-name').required = !$('#manage-name-label').hidden;
    $('#manage-name').value = folderAction ? action === 'folder-create' ? '' : folder.split('/').at(-1) : asset.name || '';
    $('#manage-folder-label').hidden = !['move', 'move-many', 'folder-create', 'folder-edit'].includes(action);
    // 可选位置：全部已知文件夹；改文件夹时不能放进它自己里面。
    const known = new Set(cloudFolders);
    cloudAssets.forEach(item => item.tags.forEach((_, index) => known.add(item.tags.slice(0, index + 1).join('/'))));
    const available = ['', ...[...known].sort((x, y) => x.localeCompare(y, 'zh-CN'))].filter(path => !(action === 'folder-edit' && within(path, folder) && path));
    $('#manage-folder').replaceChildren(...available.map(path => { const option = element('option', '', path ? path.split('/').join(' / ') : TITLES.all); option.value = path; return option; }));
    $('#manage-folder').value = action === 'folder-edit' ? parentOf(folder) : current;
    $('#manage-help').textContent = action === 'trash' ? `“${asset.name}”可在回收站恢复。` : action === 'trash-many' ? `${count} 项可在回收站恢复。` : action === 'restore' ? `“${asset.name}”会回到原来的文件夹。` : action === 'rename' ? '保留扩展名。' : '';
    $('#manage-error').textContent = '';
    $('#manage-submit').textContent = ['trash', 'trash-many'].includes(action) ? '移入回收站' : action === 'restore' ? '恢复' : ['move', 'move-many'].includes(action) ? '移动' : action === 'folder-create' ? '新建' : '保存';
    $('#manage-submit').disabled = false;
    $('#manage-delete-folder').hidden = action !== 'folder-edit' || cloudAssets.some(item => within(folderOf(item), folder)) || [...known].some(path => path.startsWith(folder + '/'));
    window.StudioMotion.open(dialog);
    if (!$('#manage-name-label').hidden) { $('#manage-name').focus(); $('#manage-name').select(); }
    else $('#manage-submit').focus();
  }
  async function submitManage(removeFolder = false) {
    if (manageBusy || !manageIntent || !canManage()) return;
    const intent = manageIntent, { action, asset } = intent;
    let route, body, next = null;
    const name = $('#manage-name').value.trim(), parentFolder = $('#manage-folder').value;
    if (action.startsWith('folder-')) {
      route = 'folder'; next = (parentFolder ? parentFolder + '/' : '') + name;
      if (action === 'folder-edit' && !removeFolder && next === intent.current) { window.StudioMotion.close($('#manage-dialog')); return; }
      body = action === 'folder-create' ? { action: 'create', folder: next } : { action: removeFolder ? 'delete' : 'move', folder: intent.current, next };
    } else if (action === 'move-many') { route = 'move'; body = { ids: asset.ids, folder: parentFolder }; }
    else if (action !== 'trash-many') { route = ['rename', 'move'].includes(action) ? 'edit' : action; body = { id: asset.id, revision: asset.revision, ...(action === 'rename' ? { name } : action === 'move' ? { folder: parentFolder } : {}) }; }
    manageBusy = true; $('#manage-submit').disabled = true; $('#manage-delete-folder').disabled = true;
    $('#manage-error').textContent = ''; const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 90000);
    let done = 0;
    try {
      if (action === 'trash-many') {
        // 每份原件都要在云盘里真正移走，逐个确认；中途出错就停下，已完成的保留。
        route = 'trash';
        for (const id of asset.ids) {
          $('#manage-help').textContent = `正在移入回收站 ${done + 1} / ${asset.ids.length}`;
          await window.OpenListClient.manage(catalog.config, 'trash', { id }, controller.signal);
          done++;
        }
      } else await window.OpenListClient.manage(catalog.config, route, body, controller.signal);
      window.StudioMotion.close($('#manage-dialog'));
      organized();
      if ($('#detail-dialog').open && activeAsset?.id === asset.id) window.StudioMotion.close($('#detail-dialog'));
      if (action.endsWith('-many')) setSelecting(false);
      if (action === 'folder-create') foldersOpen = true; // 新建后直接看到它。
      // 改名、移动或删除了当前所在的文件夹时，跟着去新的位置。
      if (action === 'folder-edit' && currentFolder && within(currentFolder, intent.current)) {
        currentFolder = removeFolder ? parentOf(intent.current) : next + currentFolder.slice(intent.current.length);
        writeHash(false);
      }
      manageBusy = false;
      await refreshCloud();
      toast(action === 'trash-many' ? `已移入回收站 ${done} 项` : route === 'trash' ? '已移入回收站' : route === 'restore' ? '已恢复' : route === 'move' ? `已移动 ${body.ids.length} 项` : action === 'folder-create' ? '已新建文件夹' : removeFolder ? '已删除文件夹' : '已保存');
    } catch (error) {
      $('#manage-error').textContent = controller.signal.aborted ? '操作超时。请刷新目录，再重试移动；不要重复上传原文件。' : (done ? `已移入 ${done} 项，其余未完成：` : '') + error.message;
      if (done) refreshCloud();
      if (!$('#manage-dialog').open) toast($('#manage-error').textContent);
    } finally { clearTimeout(timer); manageBusy = false; $('#manage-submit').disabled = false; $('#manage-delete-folder').disabled = false; }
  }
  $('#manage-form').addEventListener('submit', event => { event.preventDefault(); submitManage(); });
  $('#manage-delete-folder').addEventListener('click', () => submitManage(true));
  $('#new-folder-button').addEventListener('click', () => openManage('folder-create'));
  $('#select-button').addEventListener('click', () => setSelecting(!selecting));
  $('#selection-cancel').addEventListener('click', () => setSelecting(false));
  $('#selection-move').addEventListener('click', () => openManage('move-many', { ids: [...selection] }));
  $('#selection-trash').addEventListener('click', () => openManage('trash-many', { ids: [...selection] }));
  $('#backup-button').addEventListener('click', async () => {
    // 网站目录是仓库唯一的地图：导出一份，网站出问题时也能对上每个原件。
    try {
      const data = await window.OpenListClient.manage(catalog.config, 'backup', {}, AbortSignal.timeout(30000));
      exportFile(`正经素材库目录备份-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 2), 'application/json;charset=utf-8');
      toast('目录备份已下载');
    } catch (error) { toast(error.message); }
  });
  // 回收站和收藏是临时视图；文件夹里返回上一级。Esc 先退出多选。
  const goBack = () => isSpecial() ? navigate('all') : currentFolder ? navigate(activeType, parentOf(currentFolder)) : null;
  $('#trash-button').addEventListener('click', () => navigate(activeType === 'trash' ? 'all' : 'trash'));
  $('#view-back').addEventListener('click', goBack);
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    if (drag) { dropCard(true); return; }
    if (document.querySelector('dialog[open], [popover]:not(#toast):popover-open') || event.target.closest?.('input,textarea,select')) return;
    if (selecting) setSelecting(false); else goBack();
  });
  window.addEventListener('scroll', () => { if ($('#asset-actions').matches(':popover-open')) $('#asset-actions').hidePopover(); }, { passive: true });
  // 空格快速预览：指着或选中一张卡片按空格打开，再按空格关上，方向键翻看（像 Mac 的快速查看）。
  let hoveredCard = null;
  $('#asset-grid').addEventListener('pointerover', event => { if (event.pointerType === 'mouse') hoveredCard = event.target.closest('.asset-card:not(.folder-card)'); });
  $('#asset-grid').addEventListener('pointerleave', () => { hoveredCard = null; });
  document.addEventListener('keydown', event => {
    if (event.key !== ' ' || event.repeat || event.ctrlKey || event.metaKey || event.altKey || event.target.closest?.('input,textarea,select,video,audio,[contenteditable]')) return;
    if ($('#detail-dialog').open) {
      if (event.target.closest?.('#detail-dialog button:not(.dialog-close)')) return;
      event.preventDefault(); window.StudioMotion.close($('#detail-dialog')); return;
    }
    if (document.querySelector('dialog[open], [popover]:not(#toast):popover-open')) return;
    const card = document.activeElement?.closest?.('.asset-card:not(.folder-card)') || hoveredCard;
    const asset = card?.isConnected && filteredAssets.find(item => item.id === card.dataset.id);
    if (!asset || asset.deleted || asset.pending) return;
    event.preventDefault(); openDetail(asset);
  });

  function updateDetailFavorite() {
    $('#detail-favorite').replaceChildren(icon(favorites.has(activeAsset.id) ? 'heart-filled' : 'heart'), document.createTextNode(favorites.has(activeAsset.id) ? '已收藏' : '收藏'));
    $('#detail-favorite').setAttribute('aria-pressed', String(favorites.has(activeAsset.id)));
    $('#detail-favorite').classList.toggle('selected', favorites.has(activeAsset.id));
  }

  async function downloadOpenList(event, asset) {
    event.preventDefault();
    const link = event.currentTarget;
    if (link.dataset.busy) return;
    link.dataset.busy = '1';
    const input = { ...catalog.config };
    const session = memberSession();
    try {
      const url = await window.OpenListClient.resolve(input, asset, AbortSignal.timeout(20000));
      if (catalog.config.provider !== 'openlist' || memberSession()?.token !== session?.token) return;
      const anchor = element('a'); anchor.href = url; anchor.download = asset.name; anchor.rel = 'noreferrer'; document.body.append(anchor); anchor.click(); anchor.remove();
    } catch (error) { toast(error.message); }
    finally { delete link.dataset.busy; }
  }

  async function openDetail(asset, direction = 0) {
    stopPreview();
    const controller = new AbortController(); previewRequest = controller;
    const input = { ...catalog.config }, session = memberSession();
    activeAsset = asset;
    const index = filteredAssets.findIndex(item => item.id === asset.id);
    $('#detail-position').textContent = index >= 0 ? `${index+1} / ${filteredAssets.length}` : '';
    $('#detail-previous').disabled = index <= 0;
    $('#detail-next').disabled = index < 0 || index >= filteredAssets.length-1;
    $('#detail-type').textContent = [TYPES[asset.type], asset.demo ? '项目演示' : asset.tags.join(' / ')].filter(Boolean).join(' · ');
    $('#detail-name').textContent = asset.name;
    $('#detail-description').textContent = asset.cloud ? '' : asset.description || '';
    $('#detail-tags').replaceChildren(...(asset.cloud ? [] : [tagsFor(asset)])); // 云端素材的文件夹已写在顶部，不再重复成标签。
    $('#detail-meta').replaceChildren(...[asset.member, asset.date, fileSize(asset)].filter(Boolean).map(text => element('span', '', text)));
    const preview = $('#detail-preview');
    preview.dataset.surface = asset.type === 'video' ? 'opaque' : 'unknown';
    preview.replaceChildren();
    preview.append(fallback(asset.type));
    const download = $('#detail-download');
    download.hidden = false;
    download.href = asset.cloud ? cloudClient().downloadUrl(catalog.config, asset) : safeUrl(asset.sourceUrl);
    download.replaceChildren(icon(asset.demo || asset.cloud ? 'file-download' : 'external-link'), document.createTextNode(asset.demo || ['google', 'openlist'].includes(asset.provider) ? '下载' : asset.cloud ? '下载 ZIP' : '在 pCloud 获取原文件'));
    if (asset.demo || asset.cloud && asset.provider !== 'google') download.removeAttribute('target'); else download.target = '_blank';
    const source = $('#detail-source');
    source.hidden = !asset.cloud || asset.provider === 'openlist';
    source.href = safeUrl(asset.sourceUrl);
    source.replaceChildren(icon('external-link'), document.createTextNode(asset.provider === 'google' ? '在 Drive 预览' : 'pCloud 预览'));
    download.onclick = asset.provider === 'openlist' ? event => downloadOpenList(event, asset) : asset.cloud ? () => toast(asset.provider === 'google' ? '已发起原文件下载' : '已发起 ZIP 下载') : null;
    if (asset.demo) download.setAttribute('download', asset.sourceUrl.split('/').pop());
    else download.removeAttribute('download');
    $('#detail-note').textContent = '';
    updateDetailFavorite();
    // 上一份/下一份只让内容滑动换入，不重新弹出整个窗口。
    if ($('#detail-dialog').open && direction) window.StudioMotion.swap($('#detail-dialog'), direction, '#detail-preview, .detail-content > :not(.preview-navigation)');
    else window.StudioMotion.open($('#detail-dialog'));
    $('#detail-dialog').scrollTop = 0;
    const current = () => !controller.signal.aborted && activeAsset === asset && catalog.config.folderUrl === input.folderUrl && catalog.config.provider === input.provider && (!isOpenList() || memberSession()?.token === session?.token);
    async function loadPart(part, resolveUrl, kind, limit, onProgress) {
      if (asset.provider === 'openlist' && !session) throw new Error('请先登录素材库');
      const result = await window.StudioPreviewCache.load(previewKey(input, session, asset, part), resolveUrl, { signal: controller.signal, kind, limit, onProgress });
      if (!current()) return null;
      const url = URL.createObjectURL(result.blob); previewObjectUrls.push(url);
      return url;
    }
    const imageSource = () => asset.provider === 'openlist' && asset.type === 'image' ? window.OpenListClient.resolve(input, asset, controller.signal) : safeUrl(asset.detailPreviewUrl || asset.previewUrl);
    const originalSource = () => asset.provider === 'openlist' ? window.OpenListClient.resolve(input, asset, controller.signal) : !asset.cloud ? safeUrl(asset.previewUrl) : '';
    try {
      if (asset.type === 'video') {
        const stage = element('div', 'preview-stage');
        preview.replaceChildren(stage);
        try {
          const poster = await loadPart('poster', () => safeUrl(asset.previewUrl), 'image', 4 * 1048576);
          if (!current()) return;
          if (poster) { const image = element('img'); image.src = poster; image.alt = `${asset.name} 缩略图`; stage.append(image); }
        } catch (error) { if (controller.signal.aborted) return; }
        if (!current()) return;
        if (!stage.children.length) stage.append(fallback('video'));
        const extension = asset.name.split('.').pop().toLowerCase();
        // MOV / ProRes 和 MKV 的浏览器兼容性不足，不为试播下载整份大原件。
        const nativeVideo = ['mp4', 'webm', 'm4v'].includes(extension) && (asset.provider === 'openlist' || !asset.cloud) && (!asset.sizeMB || asset.sizeMB <= 512);
        if (nativeVideo) {
          const play = element('button', 'button primary preview-play');
          play.append(icon('play'), document.createTextNode('播放'));
          stage.append(play);
          play.addEventListener('click', async () => {
            play.disabled = true; play.textContent = '加载中';
            try {
              const url = await loadPart('video', originalSource, 'video', 512 * 1048576, (bytes, total) => {
                if (current()) play.textContent = total ? `加载中 ${Math.floor(bytes / total * 100)}%` : `加载中 ${(bytes / 1048576).toFixed(1)} MB`;
              });
              if (!current() || !url) return;
              const video = element('video'); video.src = url; video.controls = true; video.preload = 'none'; video.setAttribute('playsinline', '');
              video.addEventListener('error', () => { if (current()) preview.replaceChildren(fallback('video', '网页无法播放，请下载')); }, { once: true });
              stage.replaceChildren(video); video.play().catch(() => {});
            } catch (error) { if (current()) { play.disabled = false; play.replaceChildren(icon('play'), document.createTextNode('重试')); toast(error.message); } }
          });
        } else stage.append(element('span', 'preview-caption', asset.sizeMB > 512 ? '文件较大，下载后播放' : '下载后播放'));
      } else if (asset.type === 'other') {
        preview.replaceChildren(fallback('other')); // 非图片、视频、音频不读取原件，直接下载。
      } else {
        const audio = asset.type === 'audio';
        const url = await loadPart(audio ? 'audio' : 'image', audio ? originalSource : imageSource, audio ? 'audio' : 'image', 20 * 1048576);
        if (!current()) return;
        const media = element(audio ? 'audio' : 'img'); media.src = url;
        if (audio) { media.controls = true; media.preload = 'none'; } else {
          media.alt = asset.name;
          media.addEventListener('load', () => { if (current()) preview.dataset.surface = imageSurface(media); }, { once:true });
        }
        media.addEventListener('error', () => { if (current()) preview.replaceChildren(fallback(asset.type, '预览不可用')); }, { once: true });
        preview.replaceChildren(media);
      }
    } catch (error) { if (current()) { preview.replaceChildren(fallback(asset.type, '暂无预览')); $('#detail-note').textContent = error.message; } }
  }

  function adjacentAsset(direction) {
    const index = filteredAssets.findIndex(asset => asset.id === activeAsset?.id);
    if (index < 0) return;
    const next = filteredAssets[index+direction];
    if (next) openDetail(next, direction);
  }
  $('#detail-previous').addEventListener('click', () => adjacentAsset(-1));
  $('#detail-next').addEventListener('click', () => adjacentAsset(1));
  $('#empty-login').addEventListener('click', openMember);
  $('#copyright-button').addEventListener('click', () => window.StudioMotion.open($('#copyright-dialog')));
  document.addEventListener('keydown', event => {
    if (!$('#detail-dialog').open || !['ArrowLeft','ArrowRight'].includes(event.key) || event.target.matches('input,textarea,select,video,audio')) return;
    event.preventDefault(); adjacentAsset(event.key === 'ArrowLeft' ? -1 : 1);
  });

  function openSettings(message = '') {
    clearConfirmation();
    fillSettings();
    $('#settings-error').textContent = '';
    $('#settings-message').textContent = message;
    window.StudioMotion.open($('#settings-dialog'));
  }

  function updateProviderFields() {
    const google = $('#storage-provider').value === 'google';
    const openlist = $('#storage-provider').value === 'openlist';
    $('#openlist-fields').hidden = !openlist;
    $('#folder-url-label').textContent = openlist ? '云端后台网址' : '文件夹分享链接';
    $('#pcloud-fields').hidden = google || openlist;
    $('#google-fields').hidden = !google;
    $('#folder-url').placeholder = openlist ? 'https://你的后台.workers.dev/' : google ? 'https://drive.google.com/drive/folders/…' : '粘贴 pCloud 文件夹分享链接';
    $('#connection-provider-help').textContent = openlist ? '管理员在云端创建五个独立成员账号；不要在这里填写密码或云盘令牌。文件保存在中国移动云盘。' : google ? '文件夹公开权限设为查看者；指定成员单独设为编辑者。API Key 必须限制为本网站和 Drive／Picker API。' : '在 pCloud 邀请成员并授予上传权限。旧的匿名上传入口需在 pCloud 停用。';
  }
  function fillSettings() {
    $('#storage-provider').value = catalog.config.provider || 'pcloud';
    $('#folder-url').value = catalog.config.folderUrl;
    $('#openlist-folder-path').value = catalog.config.folderPath || '/';
    $('#pcloud-client-id').value = isGoogle() ? '' : catalog.config.clientId;
    $('#cloud-region').value = catalog.config.region || 'us';
    $('#google-client-id').value = isGoogle() ? catalog.config.clientId : '';
    $('#google-api-key').value = catalog.config.apiKey || '';
    $('#google-project-number').value = catalog.config.projectNumber || '';
    updateProviderFields();
  }
  $('#storage-provider').addEventListener('change', () => {
    $('#folder-url').value = '';
    updateProviderFields();
  });

  function exportFile(filename, content, type) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const link = element('a');
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  document.querySelectorAll('[data-type]').forEach((button) => button.addEventListener('click', () => setType(button.dataset.type)));
  $('#favorites-button').addEventListener('click', () => setType(activeType === 'favorites' ? 'all' : 'favorites'));
  $('#search-input').addEventListener('input', render);
  $('#clear-search').addEventListener('click', () => {
    $('#search-input').value = '';
    render();
    $('#search-input').focus({ preventScroll:true });
  });
  $('#sort-select').addEventListener('change', () => { rememberSort(); render(); });
  document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => {
    activeView = button.dataset.view;
    try { localStorage.setItem(VIEW_KEY, activeView); } catch { /* view stays usable */ }
    render();
  }));
  $('#reset-filters').addEventListener('click', () => { $('#search-input').value = ''; render(); });
  $('#upload-button').addEventListener('click', openUpload);
  $('#detail-favorite').addEventListener('click', () => toggleFavorite(activeAsset));
  document.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', () => {
    const dialog = button.closest('dialog');
    if (dialog.id === 'upload-dialog' && uploading) { $('#upload-message').textContent = '请先点击“停止上传”，再关闭窗口。'; return; }
    window.StudioMotion.close(dialog);
  }));
  document.querySelectorAll('dialog').forEach((dialog) => {
    dialog.addEventListener('close', () => {
      if (dialog.open) return; // 快速重新打开时，旧的 close 事件不能清空新预览。
      dialog.querySelectorAll('audio,video').forEach((media) => { media.pause(); media.removeAttribute('src'); media.load(); });
      if (dialog.id === 'member-dialog') { $('#openlist-password').value = ''; $('#member-login-message').textContent = ''; }
      if (dialog.id === 'detail-dialog') { stopPreview(); activeAsset = null; $('#detail-preview').replaceChildren(); }
    });
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey && !['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName) && !document.querySelector('dialog[open]')) {
      event.preventDefault(); $('#search-input').focus();
    }
  });

  $('#settings-form').addEventListener('submit', (event) => {
    event.preventDefault();
    try {
      if (uploading) throw new Error('请先完成或停止上传，再更改素材库连接。');
      const google = $('#storage-provider').value === 'google';
      const next = $('#storage-provider').value === 'openlist' ? { provider: 'openlist', folderUrl: $('#folder-url').value.trim(), folderPath: $('#openlist-folder-path').value.trim() || '/' } : google ? { provider: 'google', clientId: $('#google-client-id').value.trim(), folderUrl: $('#folder-url').value.trim(), apiKey: $('#google-api-key').value.trim(), projectNumber: $('#google-project-number').value.trim() } : { provider: 'pcloud', clientId: $('#pcloud-client-id').value.trim(), folderUrl: $('#folder-url').value.trim(), region: $('#cloud-region').value };
      (next.provider === 'openlist' ? window.OpenListClient : google ? window.GoogleDriveClient : window.PCloudClient).config(next);
      if (next.clientId && !next.folderUrl) throw new Error('请同时填写素材文件夹分享链接。');
      if (google && (!next.folderUrl || !next.apiKey)) throw new Error('请填写 Google 文件夹分享链接和 API Key。OAuth Client ID、项目编号用于成员上传，可稍后填写。');
      cloudAssets = [];
      saveCatalog({ ...catalog, config: next });
      refreshCloud();
      $('#settings-error').textContent = '';
      $('#settings-message').textContent = '连接设置已保存。首次导出并发布一次；之后上传文件无需再次发布。';
      toast('设置已保存');
    } catch (error) { $('#settings-error').textContent = error.message; }
  });
  $('#export-button').addEventListener('click', () => {
    const json = JSON.stringify(catalog, null, 2).replace(/</g, '\\u003c');
    exportFile('catalog.js', `// 发布此文件后，团队成员才能看到目录更新。\nwindow.STUDIO_CATALOG = ${json};\n`, 'text/javascript;charset=utf-8');
    $('#settings-message').textContent = '已导出 catalog.js。替换项目 data/catalog.js 后发布网站。';
  });
  $('#export-json-button').addEventListener('click', () => exportFile('catalog-backup.json', JSON.stringify(catalog, null, 2), 'application/json;charset=utf-8'));
  $('#cancel-change').addEventListener('click', clearConfirmation);
  $('#confirm-change').addEventListener('click', () => {
    const action = pendingChange;
    clearConfirmation();
    try { action?.(); }
    catch (error) { $('#settings-error').textContent = error.message; }
  });
  $('#import-input').addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    clearConfirmation();
    $('#settings-error').textContent = '';
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error('目录 JSON 不能超过 5MB。不要导入原素材文件。');
      const data = validateCatalog(JSON.parse(await file.text()));
      confirmChange(`导入 ${data.assets.length} 份素材将替换当前目录草稿。请先导出备份。`, () => {
        if (uploading) throw new Error('请先停止上传，再导入连接设置。');
        saveCatalog(data);
        fillSettings();
        cloudAssets = []; refreshCloud();
        $('#settings-error').textContent = '';
        $('#settings-message').textContent = '目录已导入本机，发布前请检查并导出 catalog.js。';
      });
    } catch (error) { $('#settings-error').textContent = error instanceof SyntaxError ? '文件不是有效的 JSON 目录。' : error.message; }
    finally { event.target.value = ''; }
  });
  $('#restore-button').addEventListener('click', () => {
    confirmChange('恢复网站发布的目录将清除此浏览器的目录草稿。请先导出备份；收藏会保留。', () => {
    if (uploading) throw new Error('请先停止上传，再恢复连接设置。');
    try { localStorage.removeItem(STORAGE_KEY); }
    catch { $('#settings-error').textContent = '浏览器无法清除草稿，请检查本地存储设置。'; return; }
    catalog = validateCatalog(published);
    draft = false;
    fillSettings();
    $('#settings-message').textContent = '已恢复网站发布的目录，个人收藏保留。';
    render();
    refreshCloud();
    });
  });

  window.StudioMotion.bindDialogs();
  decorateChrome();
  $('#tools-menu').addEventListener('click', event => {
    if (event.target.closest('button') && $('#tools-menu').matches(':popover-open')) $('#tools-menu').hidePopover();
  });
  const dock = $('.library-dock');
  let dockIdleTimer, previousScrollY = window.scrollY;
  function showDock() {
    clearTimeout(dockIdleTimer);
    dock.classList.remove('is-scroll-moving');
    dock.inert = false;
    dock.removeAttribute('aria-hidden');
  }
  window.addEventListener('scroll', () => {
    const distance = window.scrollY - previousScrollY;
    previousScrollY = window.scrollY;
    // 往上、往下滑都先藏起来，停下再出现。
    if (document.activeElement === $('#search-input') || Math.abs(distance) <= 2) { showDock(); return; }
    dock.classList.add('is-scroll-moving');
    dock.inert = true;
    dock.setAttribute('aria-hidden', 'true');
    clearTimeout(dockIdleTimer);
    dockIdleTimer = setTimeout(showDock, 120);
  }, { passive:true });
  window.addEventListener('scrollend', showDock, { passive:true });
  dock.addEventListener('focusin', showDock);
  dock.addEventListener('pointerenter', showDock);
  render();
  refreshCloud();
  if (storageWarning) toast(storageWarning);
})();
