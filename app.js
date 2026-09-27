(() => {
  'use strict';

  const $ = (selector) => document.querySelector(selector);
  const TYPES = { image: '图片', video: '视频', audio: '音频', animation: '动画', other: '其他' };
  const TITLES = { all: '全部素材', image: '图片与背景', video: '视频素材', audio: '音效与音乐', animation: '动画与元素', favorites: '我的收藏' };
  const STORAGE_KEY = 'orange-library-catalog-v1';
  const FAVORITES_KEY = 'orange-library-favorites-v1';
  const published = window.STUDIO_CATALOG;
  let catalog = published;
  let draft = false;
  let favorites = new Set();
  let activeType = 'all';
  let activeAsset = null;
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
  const memberSession = () => window.PCloudAuth.get(catalog.config);
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
    if (!isCloud()) { cloudAssets = []; cloudBusy = false; cloudStatus('尚未连接 pCloud'); render(); return; }
    const controller = new AbortController();
    cloudRequest = controller;
    cloudBusy = true;
    cloudStatus('正在读取 pCloud 素材目录…');
    render();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const data = await window.PCloudClient.list(catalog.config, controller.signal);
      if (cloudRequest !== controller) return;
      cloudAssets = data.assets;
      cloudFolderId = data.folderId;
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
    $('#member-avatar').setAttribute('aria-label', member ? `${member.name} · pCloud 账号` : '我的 pCloud 账号');
    $('#member-login-button').textContent = signedIn ? '我的 pCloud 账号' : '登录 pCloud';
    $('#member-status').textContent = message || (memberBusy ? '正在核实账号的上传权限…' : member?.canUpload ? `已登录 · ${member.name} · 可以上传` : signedIn ? '已登录，尚未获得上传权限。请联系管理员邀请并接受文件夹共享。' : catalog.config.clientId ? '受邀成员登录后可上传' : '登录配置中 · 暂停上传');
    $('#member-info').textContent = member ? `${member.name} · ${member.canUpload ? '已获得上传权限' : '只能浏览，未获得上传权限'}` : signedIn ? '正在核实权限，或你的账号尚未接受素材文件夹邀请。' : '请使用受邀的 pCloud 账号登录。未受邀账号无法上传。';
    $('#member-authorize').hidden = signedIn;
    $('#member-authorize').disabled = !catalog.config.clientId;
    $('#member-logout').hidden = !signedIn;
    $('#member-recheck').hidden = !signedIn;
    $('#member-recheck').disabled = memberBusy;
    $('#member-login-message').textContent = catalog.config.clientId ? '' : '管理员正在配置 pCloud 应用。配置完成后此处即可登录。';
    $('#upload-button').textContent = member?.canUpload ? '↑ 上传素材' : '登录后上传';
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
      const [profile, access] = await Promise.all([window.PCloudClient.profile(input, session, controller.signal), window.PCloudClient.memberAccess(input, session, controller.signal)]);
      if (memberRequest !== controller) return;
      member = { ...profile, ...access };
      memberBusy = false;
      renderMember();
    } catch (error) {
      if (memberRequest !== controller) return;
      if ([1000, 2000].includes(error.code)) window.PCloudAuth.logout();
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
  $('#member-authorize').addEventListener('click', () => {
    try { window.PCloudAuth.begin(catalog.config); }
    catch (error) { $('#member-login-message').textContent = error.message; }
  });
  $('#member-recheck').addEventListener('click', refreshMember);
  $('#member-logout').addEventListener('click', () => {
    uploadRequest?.abort();
    memberRequest?.abort(); memberRequest = null;
    window.PCloudAuth.logout();
    member = null; memberBusy = false;
    renderMember();
    window.StudioMotion.close($('#member-dialog'));
    toast('已退出 pCloud 登录');
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
    const previousCount = cloudAssets.length;
    let completed = 0;
    renderQueue();
    for (const item of uploadQueue) {
      if (item.done || uploadRequest.signal.aborted) continue;
      try {
        item.status = '正在上传…'; renderQueue();
        await window.PCloudClient.upload(settings, item.file, (percent) => { item.status = `${percent}% · 正在上传`; renderQueue(); }, uploadRequest.signal, session);
        item.done = true; item.status = '上传成功'; completed++;
      } catch (error) { item.status = error.message; if ([1000, 2000].includes(error.code)) window.PCloudAuth.logout(); }
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
    const clientId = String(input.config?.clientId || '').trim();
    const folderUrl = String(input.config?.folderUrl || '').trim();
    const region = input.config?.region || 'us';
    if (!['us', 'eu'].includes(region)) throw new Error('请选择美国或欧洲数据地区。');
    window.PCloudClient.config({ clientId, folderUrl, region });
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
    return { version: 1, config: { clientId, folderUrl, region }, assets };
  }

  function saveCatalog(nextCatalog) {
    const validated = validateCatalog(nextCatalog);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(validated)); }
    catch { throw new Error('浏览器无法保存草稿，可能禁用了本地存储或空间已满。请先导出备份。'); }
    catalog = validated;
    draft = true;
    render();
  }

  try {
    catalog = validateCatalog(published);
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) { catalog = validateCatalog(JSON.parse(saved)); draft = true; }
    const savedFavorites = JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]');
    if (Array.isArray(savedFavorites)) favorites = new Set(savedFavorites.filter((id) => typeof id === 'string'));
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
    if (asset.type === 'audio') preview.append(audioArt());
    else if (asset.previewUrl && (asset.cloud || /\.(svg|png|jpe?g|webp|gif)(?:[?#]|$)/i.test(asset.previewUrl))) {
      const image = element('img');
      image.src = asset.previewUrl;
      image.alt = asset.name;
      image.loading = 'lazy';
      image.addEventListener('error', () => { image.replaceWith(fallback(asset.type, '预览暂时不可用')); }, { once: true });
      preview.append(image);
    } else preview.append(fallback(asset.type, asset.cloud ? '在 pCloud 预览' : asset.previewUrl ? '点击播放预览' : '暂无预览'));
    preview.append(element('span', 'card-type', TYPES[asset.type]), element('span', 'preview-open', '↗'));
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
    content.append(titleRow);
    if (!asset.cloud && asset.description) content.append(element('p', 'card-description', asset.description));
    content.append(tagsFor(asset), bottom);
    card.append(preview, content);
    return card;
  }

  function render() {
    const term = $('#search-input').value.trim().toLocaleLowerCase('zh-CN');
    const sort = $('#sort-select').value;
    const assets = allAssets();
    const visible = assets.filter((asset) => {
      const matchesType = activeType === 'all' || (activeType === 'favorites' ? favorites.has(asset.id) : asset.type === activeType);
      return matchesType && [asset.name, asset.description, asset.member, ...asset.tags].join(' ').toLocaleLowerCase('zh-CN').includes(term);
    }).sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name, 'zh-CN') : sort === 'oldest' ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date));
    window.StudioMotion.grid($('#asset-grid'), visible.map(cardFor));
    $('#empty-state').hidden = visible.length > 0 || cloudBusy;
    $('#library-title').textContent = TITLES[activeType];
    const demoCount = visible.filter((asset) => asset.demo).length;
    $('#results-text').textContent = `${visible.length} 份素材${demoCount ? ` · ${demoCount} 份演示` : ''}${term ? ` · 搜索“${term}”` : ''}`;
    $('#asset-count').textContent = assets.length;
    $('#nav-count').textContent = assets.length;
    $('#connected-count').textContent = assets.filter((asset) => !asset.demo).length;
    $('#refresh-button').disabled = cloudBusy;
    $('#add-button').hidden = true;
    $('#draft-notice').hidden = !draft;
    $('#footer-status').textContent = isCloud() ? 'pCloud 自动目录' : draft ? '本机设置草稿 · 尚未发布' : '演示目录 · 尚未接入真实仓库';
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

  function openDetail(asset) {
    activeAsset = asset;
    $('#detail-type').textContent = `${TYPES[asset.type]}${asset.demo ? ' / 项目演示' : ' / pCloud 原文件'}`;
    $('#detail-name').textContent = asset.name;
    $('#detail-description').textContent = asset.cloud ? '' : asset.description || '';
    $('#detail-tags').replaceChildren(tagsFor(asset));
    $('#detail-meta').replaceChildren(element('span', '', `上传成员：${asset.member || '未署名'}`), element('span', '', `添加日期：${asset.date}`), element('span', '', fileSize(asset)));
    const preview = $('#detail-preview');
    preview.replaceChildren();
    const url = safeUrl(asset.detailPreviewUrl || asset.previewUrl);
    if (!url) preview.append(fallback(asset.type, '在 pCloud 预览'));
    else {
      const audio = !asset.cloud && asset.type === 'audio';
      const video = !asset.cloud && /\.(mp4|webm)(?:[?#]|$)/i.test(url);
      const media = element(audio ? 'audio' : video ? 'video' : 'img');
      if (audio || video) { media.controls = true; media.preload = 'metadata'; media.setAttribute('playsinline', ''); }
      else media.alt = asset.name;
      media.src = url;
      media.addEventListener('error', () => { preview.replaceChildren(fallback(asset.type, '预览不可用')); }, { once: true });
      preview.append(media);
    }
    const download = $('#detail-download');
    download.href = safeUrl(asset.sourceUrl);
    download.textContent = asset.demo ? '↓ 下载演示文件' : asset.cloud ? '↗ 预览 / 下载' : '↗ 在 pCloud 获取原文件';
    if (asset.demo) download.setAttribute('download', asset.sourceUrl.split('/').pop());
    else download.removeAttribute('download');
    $('#detail-note').textContent = asset.demo ? '这是项目附带的演示文件，不代表 pCloud 仓库已连接。' : asset.cloud ? '在 pCloud 文件夹选择同名文件。' : '';
    updateDetailFavorite();
    window.StudioMotion.open($('#detail-dialog'));
    $('#detail-dialog').scrollTop = 0;
  }

  function openSettings(message = '') {
    clearConfirmation();
    $('#pcloud-client-id').value = catalog.config.clientId;
    $('#folder-url').value = catalog.config.folderUrl;
    $('#cloud-region').value = catalog.config.region;
    $('#settings-error').textContent = '';
    $('#settings-message').textContent = message;
    window.StudioMotion.open($('#settings-dialog'));
  }

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
  $('#reset-filters').addEventListener('click', () => { $('#search-input').value = ''; setType('all'); });
  $('#settings-button').addEventListener('click', () => openSettings());
  $('#mobile-settings-button').addEventListener('click', () => openSettings());
  $('#upload-button').addEventListener('click', openUpload);
  $('#add-button').addEventListener('click', () => { $('#form-error').textContent = ''; window.StudioMotion.open($('#add-dialog')); });
  $('#detail-favorite').addEventListener('click', () => toggleFavorite(activeAsset));
  document.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', () => {
    const dialog = button.closest('dialog');
    if (dialog.id === 'upload-dialog' && uploading) { $('#upload-message').textContent = '请先点击“停止上传”，再关闭窗口。'; return; }
    window.StudioMotion.close(dialog);
  }));
  document.querySelectorAll('dialog').forEach((dialog) => {
    dialog.addEventListener('close', () => {
      dialog.querySelectorAll('audio,video').forEach((media) => { media.pause(); media.removeAttribute('src'); media.load(); });
      if (dialog.id === 'detail-dialog') activeAsset = null;
    });
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey && !['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName) && !document.querySelector('dialog[open]')) {
      event.preventDefault(); $('#search-input').focus();
    }
  });

  $('#asset-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const tags = [...new Set(String(values.get('tags')).split(/[,，]/).map((tag) => tag.trim()).filter(Boolean))];
    const today = new Date();
    const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const asset = { id: `asset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name: String(values.get('name')).trim(), type: String(values.get('type')), tags, description: String(values.get('description')).trim(), member: String(values.get('member')).trim(), date, sizeMB: values.get('sizeMB') === '' ? null : Number(values.get('sizeMB')), previewUrl: String(values.get('previewUrl')).trim(), sourceUrl: String(values.get('sourceUrl')).trim(), demo: false };
    try {
      saveCatalog({ ...catalog, assets: [asset, ...catalog.assets] });
      event.currentTarget.reset();
      window.StudioMotion.close($('#add-dialog'));
      $('#search-input').value = '';
      setType('all');
      toast('已保存本机草稿。导出目录并发布后，团队才能看到。');
    } catch (error) { $('#form-error').textContent = error.message; }
  });

  $('#settings-form').addEventListener('submit', (event) => {
    event.preventDefault();
    try {
      const next = { clientId: $('#pcloud-client-id').value.trim(), folderUrl: $('#folder-url').value.trim(), region: $('#cloud-region').value };
      window.PCloudClient.config(next);
      if (next.clientId && !next.folderUrl) throw new Error('请同时填写素材文件夹分享链接。');
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
        saveCatalog(data);
        $('#pcloud-client-id').value = catalog.config.clientId;
        $('#folder-url').value = catalog.config.folderUrl;
        $('#cloud-region').value = catalog.config.region;
        cloudAssets = []; refreshCloud();
        $('#settings-error').textContent = '';
        $('#settings-message').textContent = '目录已导入本机，发布前请检查并导出 catalog.js。';
      });
    } catch (error) { $('#settings-error').textContent = error instanceof SyntaxError ? '文件不是有效的 JSON 目录。' : error.message; }
    finally { event.target.value = ''; }
  });
  $('#restore-button').addEventListener('click', () => {
    confirmChange('恢复网站发布的目录将清除此浏览器的目录草稿。请先导出备份；收藏会保留。', () => {
    try { localStorage.removeItem(STORAGE_KEY); }
    catch { $('#settings-error').textContent = '浏览器无法清除草稿，请检查本地存储设置。'; return; }
    catalog = validateCatalog(published);
    draft = false;
    $('#pcloud-client-id').value = catalog.config.clientId;
    $('#folder-url').value = catalog.config.folderUrl;
    $('#cloud-region').value = catalog.config.region;
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
