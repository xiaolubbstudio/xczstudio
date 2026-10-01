(() => {
  'use strict';

  const $ = (selector) => document.querySelector(selector);
  const TYPES = { image: '图片', video: '视频', audio: '音频', animation: '动画', other: '其他' };
  const TITLES = { all: '全部素材', image: '图片与背景', video: '视频素材', audio: '音效与音乐', animation: '动画与元素', other: '其他文件', favorites: '我的收藏' };
  const STORAGE_KEY = 'orange-library-catalog-v1';
  const FAVORITES_KEY = 'orange-library-favorites-v1';
  const VIEW_KEY = 'orange-library-view-v1';
  const published = window.STUDIO_CATALOG;
  let catalog = published;
  let draft = false;
  let favorites = new Set();
  let activeType = 'all';
  let activeView = 'grid';
  let activeAsset = null;
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
  const isGoogle = () => catalog.config.provider === 'google';
  const isOpenList = () => catalog.config.provider === 'openlist';
  const cloudName = () => isOpenList() ? '素材库后台' : isGoogle() ? 'Google Drive' : 'pCloud';
  const cloudClient = () => isOpenList() ? window.OpenListClient : isGoogle() ? window.GoogleDriveClient : window.PCloudClient;
  const cloudAuth = () => isOpenList() ? window.OpenListAuth : isGoogle() ? window.GoogleDriveAuth : window.PCloudAuth;
  const memberSession = () => cloudAuth().get(catalog.config);
  const memberSettings = () => ({ ...catalog.config, folderId: cloudFolderId });
  const isCloud = () => Boolean(catalog.config.folderUrl);
  const allAssets = () => isCloud() ? cloudAssets : catalog.assets;

  function cloudStatus(message, error = false) {
    $('#cloud-status').textContent = message;
    $('#cloud-status').classList.toggle('error', error);
  }

  async function refreshCloud(notify = false) {
    cloudRequest?.abort();
    cloudRequest = null;
    memberRequest?.abort(); memberRequest = null;
    member = null; memberBusy = false; cloudFolderId = null;
    renderMember();
    cloudFolderName = '';
    if (isGoogle()) window.GoogleDriveAuth.prepare(catalog.config).catch(error => { if (isGoogle()) $('#member-login-message').textContent = error.message; });
    if (!isCloud()) { cloudAssets = []; cloudBusy = false; cloudStatus(`尚未连接 ${cloudName()}`); render(); return; }
    const controller = new AbortController();
    cloudRequest = controller;
    cloudBusy = true;
    cloudStatus(`正在读取 ${cloudName()} 素材目录…`);
    render();
    const timeout = setTimeout(() => controller.abort(), isGoogle() ? 60000 : 20000);
    try {
      const data = await cloudClient().list(catalog.config, controller.signal);
      if (cloudRequest !== controller) return;
      cloudAssets = data.assets;
      cloudFolderId = data.folderId;
      cloudFolderName = data.name;
      cloudStatus(`${data.name} · ${data.assets.length} 份素材`);
      if (notify) toast('素材已更新');
      await refreshMember();
    } catch (error) {
      if (cloudRequest !== controller) return;
      cloudStatus(`目录未能更新：${controller.signal.aborted ? '连接超时，请重试。' : error.message}`, true);
      if (notify) toast('刷新失败，请重试');
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
    $('#member-avatar').setAttribute('aria-label', member ? `${member.name} · ${cloudName()} 账号` : `我的 ${cloudName()} 账号`);
    image.alt = `${cloudName()} 头像`;
    $('#member-login-button').textContent = signedIn ? '我的账号' : isOpenList() ? '成员登录' : `登录 ${isGoogle() ? 'Google' : 'pCloud'}`;
    $('#openlist-login-form').hidden = !isOpenList() || signedIn;
    $('#member-status').textContent = message || (memberBusy ? '核实上传权限中…' : signedIn && !member?.canUpload ? isGoogle() ? '请授权素材文件夹并核实编辑权限' : '此账号尚未获得素材文件夹上传权限' : '');
    $('#member-info').textContent = member ? `${member.name} · ${member.canUpload ? '已获得上传权限' : '尚未获得上传权限'}` : signedIn ? '请核实素材文件夹授权和成员权限。' : `请使用受邀的 ${isGoogle() ? 'Google' : 'pCloud'} 账号登录。`;
    $('#member-authorize').hidden = signedIn || isOpenList();
    $('#member-authorize').disabled = !catalog.config.clientId;
    $('#member-authorize').textContent = `登录 ${isGoogle() ? 'Google' : 'pCloud'}`;
    $('#member-folder-authorize').hidden = !isGoogle() || !signedIn || member?.canUpload === true;
    $('#member-folder-authorize').disabled = memberBusy;
    $('#member-permission-help').textContent = isOpenList() ? '使用管理员为你创建的独立账号。上传仍在验收中。' : isGoogle() ? '首次登录后，在 Google 文件夹选择器中选择素材文件夹。只授权所选文件夹；上传权限由 Drive 共享设置校验。' : '应用可获所有文件夹权限；本站只操作素材文件夹。';
    $('#member-logout').hidden = !signedIn;
    $('#member-recheck').hidden = !signedIn;
    $('#member-recheck').disabled = memberBusy;
    $('#member-login-message').textContent = isOpenList() ? '' : catalog.config.clientId ? '' : `管理员正在配置 ${cloudName()} 登录。`;
    if (isOpenList()) {
      $('#member-info').textContent = member ? `${member.name} · 已登录` : signedIn ? '正在核实账号…' : '请使用你的素材库成员账号。';
      $('#member-status').textContent = message || (memberBusy ? '核实账号中…' : signedIn ? '云端上传尚未完成验收' : '');
    }
    $('#upload-button').textContent = '↑ 上传素材';
  }

  async function refreshMember() {
    memberRequest?.abort();
    const session = memberSession();
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
      const access = await client.memberAccess(input, session, controller.signal);
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
    window.StudioMotion.open($('#member-dialog'));
  }

  $('#member-login-button').addEventListener('click', openMember);
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
      await window.GoogleDriveAuth.selectFolder(catalog.config, cloudFolderName || '雷霆素材库');
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
      await window.OpenListAuth.begin(catalog.config, $('#openlist-username').value, $('#openlist-password').value, $('#openlist-otp').value);
      await refreshCloud();
    } catch (error) { $('#member-login-message').textContent = error.message; }
    finally { $('#openlist-password').value = ''; $('#openlist-otp').value = ''; button.disabled = false; }
  });
  $('#member-recheck').addEventListener('click', refreshMember);
  $('#member-logout').addEventListener('click', async () => {
    stopPreview(); activeAsset = null; $('#detail-preview').replaceChildren();
    uploadRequest?.abort();
    memberRequest?.abort(); memberRequest = null;
    let logoutError = '';
    try { await cloudAuth().logout(catalog.config); } catch (error) { logoutError = error.message; }
    if (isOpenList()) { cloudRequest?.abort(); cloudAssets = []; cloudFolderId = null; render(); cloudStatus('请登录素材库。'); }
    member = null; memberBusy = false;
    renderMember();
    window.StudioMotion.close($('#member-dialog'));
    toast(logoutError || '已退出登录');
  });

  function renderQueue() {
    $('#upload-queue').replaceChildren(...uploadQueue.map((item) => {
      const row = element('div', 'upload-row');
      row.append(element('strong', '', item.file.name), element('span', '', item.status));
      return row;
    }));
    $('#upload-start').disabled = uploading || !uploadQueue.some((item) => !item.done);
    $('#upload-member').disabled = uploading;
    $('#choose-files').hidden = uploading;
    $('#upload-cancel').hidden = !uploading;
  }

  function openUpload() {
    if (!memberSession() || !member?.canUpload || memberBusy) { openMember(); return; }
    $('#upload-message').textContent = '请选择文件。';
    $('#upload-member').value = member.name;
    $('#upload-target').textContent = `上传到：${cloudFolderName || '素材文件夹'}`;
    renderQueue();
    window.StudioMotion.open($('#upload-dialog'));
  }

  $('#upload-files').addEventListener('change', (event) => {
    if (uploading) return;
    const files = [...event.target.files];
    uploadQueue = files.map((file) => ({ file, done: false, status: `${file.size < 1048576 ? `${Math.ceil(file.size / 1024)} KB` : `${(file.size / 1048576).toFixed(1)} MB`} · 等待上传` }));
    event.target.value = '';
    $('#upload-message').textContent = `${files.length} 个文件待上传`;
    renderQueue();
  });
  $('#choose-files').addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); $('#upload-files').click(); }
  });
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
    let completed = 0;
    renderQueue();
    for (const item of uploadQueue) {
      if (item.done || uploadRequest.signal.aborted) continue;
      try {
        item.status = '正在上传…'; renderQueue();
        await client.upload(settings, item.file, (percent) => { item.status = `${percent}% · 正在上传`; renderQueue(); }, uploadRequest.signal, session);
        item.done = true; item.status = '上传成功'; completed++;
      } catch (error) { item.status = error.message; if ([1000, 2000, 401].includes(error.code)) auth.logout(); }
      renderQueue();
    }
    const canceled = uploadRequest.signal.aborted;
    uploading = false;
    uploadRequest = null;
    renderQueue();
    await refreshCloud();
    $('#upload-message').textContent = canceled ? '已停止上传。请刷新目录检查已完成的文件。' : !completed ? '本次没有文件上传成功，请查看上方错误。' : `本次 ${completed} 个文件上传成功。${cloudAssets.length <= previousCount ? '目录暂未出现新文件，请稍后刷新；不要重复上传。' : '目录已更新。'}`;
  });
  $('#upload-cancel').addEventListener('click', () => uploadRequest?.abort());
  $('#upload-dialog').addEventListener('cancel', (event) => { if (uploading) { event.preventDefault(); $('#upload-message').textContent = '请先点击“停止上传”，再关闭窗口。'; } });
  $('#refresh-button').addEventListener('click', () => { if (!isCloud()) openSettings('请连接素材文件夹。'); else { toast('正在刷新素材…'); refreshCloud(true); } });

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
      if (local._publishedConnection === JSON.stringify(published.config) || !local._publishedConnection && published.config.provider !== 'google') { catalog = validateCatalog(local); draft = true; }
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
    for (let index = 0; index < 45; index++) {
      const bar = element('span');
      bar.style.height = `${10 + Math.abs(Math.sin(index * .68) * Math.cos(index * .13)) * 65}px`;
      artwork.append(bar);
    }
    return artwork;
  }

  function fallback(type, label = '登记小预览后显示') {
    const node = element('div', 'preview-fallback');
    node.append(element('span', '', { image: '▧', video: '▷', audio: '♫', animation: '✧', other: '▣' }[type]), element('small', '', label));
    return node;
  }

  function tagsFor(asset) {
    const node = element('div', 'tag-list');
    asset.tags.forEach((tag) => node.append(element('span', 'tag', tag)));
    return node;
  }

  function favoriteLabel(button, asset) {
    const selected = favorites.has(asset.id);
    button.textContent = selected ? '♥' : '♡';
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-label', `${selected ? '取消收藏' : '收藏'} ${asset.name}`);
    button.setAttribute('aria-pressed', String(selected));
  }

  function toggleFavorite(asset) {
    const next = new Set(favorites);
    if (next.has(asset.id)) next.delete(asset.id); else next.add(asset.id);
    try { localStorage.setItem(FAVORITES_KEY, JSON.stringify([...next])); }
    catch { toast('浏览器无法保存收藏，请检查本地存储设置。'); return; }
    favorites = next;
    render();
    toast(favorites.has(asset.id) ? '已收藏' : '已取消收藏');
    if (activeAsset) updateDetailFavorite();
  }

  function cardFor(asset) {
    const card = element('article', 'asset-card');
    card.dataset.id = asset.id;
    const preview = element('button', 'preview-button');
    preview.setAttribute('aria-label', `预览 ${asset.name}`);
    // 列表只显示图标；滚动、筛选、收藏都不会请求素材或缩略图。
    if (asset.type === 'audio') preview.append(audioArt());
    else preview.append(fallback(asset.type, '点击预览'));
    const ext = asset.name.split('.').pop();
    preview.append(element('span', 'card-type', /^[a-z0-9]{1,6}$/i.test(ext) ? ext.toUpperCase() : TYPES[asset.type]));
    preview.addEventListener('click', () => openDetail(asset));
    const content = element('div', 'card-content');
    const titleRow = element('div', 'card-title-row');
    const title = element('button', 'card-title', asset.name);
    title.addEventListener('click', () => openDetail(asset));
    const favorite = element('button', 'favorite-button');
    favoriteLabel(favorite, asset);
    favorite.addEventListener('click', () => toggleFavorite(asset));
    titleRow.append(title, favorite);
    const bottom = element('div', 'card-bottom');
    bottom.append(element('span', '', `${asset.member || '未署名'} · ${asset.date.slice(5).replace('-', '/')}`), element('span', asset.demo ? 'demo-tag' : '', fileSize(asset)));
    const download = element('a', 'card-download', asset.provider === 'google' || asset.provider === 'openlist' || asset.demo ? '↓ 下载' : '↓ ZIP');
    download.href = asset.cloud ? cloudClient().downloadUrl(catalog.config, asset) : safeUrl(asset.sourceUrl);
    download.setAttribute('aria-label', `下载 ${asset.name}${asset.cloud && asset.provider === 'pcloud' ? '（ZIP）' : ''}`);
    if (asset.demo) download.download = asset.sourceUrl.split('/').pop();
    if (asset.provider === 'google') { download.target = '_blank'; download.rel = 'noopener noreferrer'; }
    if (asset.provider === 'openlist') download.addEventListener('click', event => downloadOpenList(event, asset));
    bottom.append(download);
    content.append(titleRow);
    const folder = element('button', 'folder-chip', asset.tags.length ? asset.tags.join(' / ') : '根目录');
    folder.title = `按文件夹筛选：${folder.textContent}`;
    folder.addEventListener('click', () => { $('#folder-filter').value = JSON.stringify(asset.tags); render(); });
    if (asset.cloud) content.append(folder);
    content.append(bottom);
    card.append(preview, content);
    return card;
  }

  function render() {
    const term = $('#search-input').value.trim().toLocaleLowerCase('zh-CN');
    const sort = $('#sort-select').value;
    const assets = allAssets();
    const folderSelect = $('#folder-filter');
    const previousFolder = folderSelect.value;
    const folders = new Map([['*', '全部文件夹'], ['[]', '根目录']]);
    for (const asset of assets) {
      for (let index = 1; index <= asset.tags.length; index++) {
        const path = asset.tags.slice(0, index);
        folders.set(JSON.stringify(path), path.join(' / '));
      }
    }
    const options = [...folders].sort((a, b) => a[0] === '*' ? -1 : b[0] === '*' ? 1 : a[0] === '[]' ? -1 : b[0] === '[]' ? 1 : a[1].localeCompare(b[1], 'zh-CN'));
    folderSelect.replaceChildren(...options.map(([value, label]) => { const option = element('option', '', label); option.value = value; return option; }));
    folderSelect.value = folders.has(previousFolder) ? previousFolder : '*';
    const path = folderSelect.value === '*' ? null : JSON.parse(folderSelect.value);
    const visible = assets.filter((asset) => {
      const matchesType = activeType === 'all' || (activeType === 'favorites' ? favorites.has(asset.id) : asset.type === activeType);
      const matchesFolder = path === null || path.length === 0 ? path === null || asset.tags.length === 0 : path.every((part, index) => asset.tags[index] === part);
      return matchesType && matchesFolder && [asset.name, asset.description, asset.member, ...asset.tags].join(' ').toLocaleLowerCase('zh-CN').includes(term);
    }).sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name, 'zh-CN');
      if (sort === 'largest' || sort === 'smallest') {
        if (a.sizeMB === null) return b.sizeMB === null ? 0 : 1;
        if (b.sizeMB === null) return -1;
        return sort === 'largest' ? b.sizeMB - a.sizeMB : a.sizeMB - b.sizeMB;
      }
      return sort === 'oldest' ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date);
    });
    $('#asset-grid').classList.toggle('list-view', activeView === 'list');
    window.StudioMotion.grid($('#asset-grid'), visible.map(cardFor));
    $('#empty-state').hidden = visible.length > 0 || cloudBusy;
    $('#library-title').textContent = TITLES[activeType];
    const demoCount = visible.filter((asset) => asset.demo).length;
    $('#results-text').textContent = `${visible.length} 份素材${demoCount ? ` · ${demoCount} 份演示` : ''}${term ? ` · 搜索“${term}”` : ''}`;
    $('#nav-count').textContent = assets.length;
    $('#refresh-button').disabled = cloudBusy;
    $('#draft-notice').hidden = !draft;
    $('#footer-status').textContent = isCloud() ? `${cloudName()} 自动目录` : draft ? '本机设置草稿 · 尚未发布' : '演示目录 · 尚未接入真实仓库';
    $('#hosting-provider').textContent = cloudName();
    $('#upload-duplicate-note').textContent = isGoogle() ? '同名文件保留为新文件。' : '同名文件自动改名。';
    document.querySelectorAll('[data-view]').forEach(button => {
      const selected = button.dataset.view === activeView;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    document.querySelectorAll('[data-type]').forEach((button) => {
      const selected = button.dataset.type === activeType;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
  }

  function setType(type) { activeType = type; render(); }

  function updateDetailFavorite() {
    $('#detail-favorite').textContent = favorites.has(activeAsset.id) ? '♥ 已收藏' : '♡ 收藏';
    $('#detail-favorite').setAttribute('aria-pressed', String(favorites.has(activeAsset.id)));
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

  async function openDetail(asset) {
    stopPreview();
    const controller = new AbortController(); previewRequest = controller;
    const input = { ...catalog.config }, session = memberSession();
    activeAsset = asset;
    $('#detail-type').textContent = `${TYPES[asset.type]}${asset.demo ? ' / 项目演示' : ` / ${cloudName()} 原文件`}`;
    $('#detail-name').textContent = asset.name;
    $('#detail-description').textContent = asset.cloud ? '' : asset.description || '';
    $('#detail-tags').replaceChildren(tagsFor(asset));
    $('#detail-meta').replaceChildren(element('span', '', `上传成员：${asset.member || '未署名'}`), element('span', '', `添加日期：${asset.date}`), element('span', '', fileSize(asset)));
    const preview = $('#detail-preview');
    preview.replaceChildren();
    preview.append(fallback(asset.type, '正在读取预览…'));
    const download = $('#detail-download');
    download.hidden = false;
    download.href = asset.cloud ? cloudClient().downloadUrl(catalog.config, asset) : safeUrl(asset.sourceUrl);
    download.textContent = asset.demo ? '↓ 下载演示文件' : ['google', 'openlist'].includes(asset.provider) ? '↓ 下载原文件' : asset.cloud ? '↓ 下载 ZIP' : '↗ 在 pCloud 获取原文件';
    if (asset.demo || asset.cloud && asset.provider !== 'google') download.removeAttribute('target'); else download.target = '_blank';
    const source = $('#detail-source');
    source.hidden = !asset.cloud || asset.provider === 'openlist';
    source.href = safeUrl(asset.sourceUrl);
    source.textContent = asset.provider === 'google' ? '↗ 在 Drive 预览' : '↗ pCloud 预览';
    download.onclick = asset.provider === 'openlist' ? event => downloadOpenList(event, asset) : asset.cloud ? () => toast(asset.provider === 'google' ? '已发起原文件下载' : '已发起 ZIP 下载') : null;
    if (asset.demo) download.setAttribute('download', asset.sourceUrl.split('/').pop());
    else download.removeAttribute('download');
    $('#detail-note').textContent = '';
    updateDetailFavorite();
    window.StudioMotion.open($('#detail-dialog'));
    $('#detail-dialog').scrollTop = 0;
    const current = () => !controller.signal.aborted && activeAsset === asset && catalog.config.folderUrl === input.folderUrl && catalog.config.provider === input.provider && (!isOpenList() || memberSession()?.token === session?.token);
    const scope = [input.provider || 'pcloud', input.folderUrl || '', input.folderPath || '/', session?.username || session?.uid || 'public'];
    async function loadPart(part, resolveUrl, kind, limit, onProgress) {
      if (asset.provider === 'openlist' && !session) throw new Error('请先登录素材库');
      const result = await window.StudioPreviewCache.load([...scope, asset.id, asset.modified || asset.date, asset.sizeMB, part, 'original-v1'], resolveUrl, { signal: controller.signal, kind, limit, onProgress });
      if (!current()) return null;
      const url = URL.createObjectURL(result.blob); previewObjectUrls.push(url);
      $('#detail-note').textContent = result.cached ? '本机缓存' : result.persistent ? '预览已缓存到本机' : '预览仅缓存于本次页面';
      return url;
    }
    const imageSource = () => asset.provider === 'openlist' && asset.type === 'image' ? window.OpenListClient.resolve(input, asset, controller.signal) : safeUrl(asset.detailPreviewUrl || asset.previewUrl);
    const originalSource = () => asset.provider === 'openlist' ? window.OpenListClient.resolve(input, asset, controller.signal) : !asset.cloud ? safeUrl(asset.previewUrl) : '';
    try {
      if (asset.type === 'video') {
        const stage = element('div', 'preview-stage');
        preview.replaceChildren(stage);
        try {
          const poster = await loadPart('poster', () => safeUrl(asset.previewUrl), 'image', 1048576);
          if (!current()) return;
          if (poster) { const image = element('img'); image.src = poster; image.alt = `${asset.name} 缩略图`; stage.append(image); }
        } catch (error) { if (controller.signal.aborted) return; }
        if (!current()) return;
        if (!stage.children.length) stage.append(fallback('video', '暂无缩略图'));
        const extension = asset.name.split('.').pop().toLowerCase();
        // MOV / ProRes 和 MKV 的浏览器兼容性不足，不为试播下载整份大原件。
        const nativeVideo = ['mp4', 'webm', 'm4v'].includes(extension) && (asset.provider === 'openlist' || !asset.cloud) && (!asset.sizeMB || asset.sizeMB <= 512);
        if (nativeVideo) {
          const play = element('button', 'button primary preview-play', '▷ 播放原画质');
          play.title = '首次播放先缓存原视频，完成后播放；关闭预览可停止加载。';
          stage.append(play);
          play.addEventListener('click', async () => {
            play.disabled = true; play.textContent = '正在缓存原视频…';
            try {
              const url = await loadPart('video', originalSource, 'video', 512 * 1048576, (bytes, total) => {
                if (current()) play.textContent = total ? `正在缓存原视频 ${Math.floor(bytes / total * 100)}%` : `正在缓存原视频 ${(bytes / 1048576).toFixed(1)} MB`;
              });
              if (!current() || !url) return;
              const video = element('video'); video.src = url; video.controls = true; video.preload = 'none'; video.setAttribute('playsinline', '');
              video.addEventListener('error', () => { if (current()) preview.replaceChildren(fallback('video', '浏览器不支持此编码 · 可下载原文件')); }, { once: true });
              stage.replaceChildren(video); video.play().catch(() => {});
            } catch (error) { if (current()) { play.disabled = false; play.textContent = '重试原画质预览'; toast(error.message); } }
          });
        } else stage.append(element('span', 'preview-caption', ['mov', 'mkv'].includes(extension) ? '此格式需下载后播放' : asset.sizeMB > 512 ? '超过本机预览上限 · 可下载原文件' : '仅显示缩略图 · 可下载原文件'));
      } else {
        const audio = asset.type === 'audio';
        const url = await loadPart(audio ? 'audio' : 'image', audio ? originalSource : imageSource, audio ? 'audio' : 'image', 20 * 1048576);
        if (!current()) return;
        const media = element(audio ? 'audio' : 'img'); media.src = url;
        if (audio) { media.controls = true; media.preload = 'none'; } else media.alt = asset.name;
        media.addEventListener('error', () => { if (current()) preview.replaceChildren(fallback(asset.type, '预览不可用')); }, { once: true });
        preview.replaceChildren(media);
      }
    } catch (error) { if (current()) { preview.replaceChildren(fallback(asset.type, '暂无预览')); $('#detail-note').textContent = error.message; } }
  }

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
    $('#connection-provider-help').textContent = openlist ? '管理员在云端创建五个独立成员账号；不要在这里填写密码或云盘令牌。此连接尚未完成上传验收。' : google ? '文件夹公开权限设为查看者；指定成员单独设为编辑者。API Key 必须限制为本网站和 Drive／Picker API。' : '在 pCloud 邀请成员并授予上传权限。旧的匿名上传入口需在 pCloud 停用。';
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
  $('#search-input').addEventListener('input', render);
  $('#sort-select').addEventListener('change', render);
  $('#folder-filter').addEventListener('change', render);
  document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => {
    activeView = button.dataset.view;
    try { localStorage.setItem(VIEW_KEY, activeView); } catch { /* view stays usable */ }
    render();
  }));
  $('#reset-filters').addEventListener('click', () => { $('#search-input').value = ''; $('#folder-filter').value = '*'; setType('all'); });
  $('#settings-button').addEventListener('click', () => openSettings());
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
      if (dialog.id === 'member-dialog') { $('#openlist-password').value = ''; $('#openlist-otp').value = ''; }
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
  render();
  refreshCloud();
  if (storageWarning) toast(storageWarning);
})();
