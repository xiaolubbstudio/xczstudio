// OpenList 云端连接。身份、目录权限和签名下载由后台校验。
(function (root) {
  'use strict';
  function config(input) {
    const url = new URL(input.folderUrl);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('请填写云端后台的 HTTPS 根网址，不含密码、参数或路径。');
    const folderPath = input.folderPath || '/';
    if (!folderPath.startsWith('/') || folderPath.includes('\\') || /[\u0000-\u001f]/.test(folderPath) || folderPath.split('/').some(x => ['.', '..'].includes(x))) throw new Error('素材目录路径无效。');
    return { endpoint: url.origin, folderPath: folderPath.replace(/\/+$/, '') || '/' };
  }
  async function request(input, route, body, session, signal) {
    const { endpoint } = config(input);
    const headers = { Accept: 'application/json' };
    if (session) {
      if (session.endpoint !== endpoint || !session.token || /[\u0000-\u0020]/.test(session.token)) throw new Error('请重新登录当前素材库。');
      headers.Authorization = session.token;
    }
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await root.fetch(endpoint + '/api/' + route, {
      method: body === undefined ? 'GET' : 'POST', headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal, credentials: 'omit', cache: 'no-store', redirect: 'error'
    });
    const data = await response.json();
    if (!response.ok || data.code !== 200) {
      // 不把服务端消息中的内部地址、凭据或堆栈回显到网页。
      const code = response.ok ? data.code : response.status;
      const error = new Error(code === 401 ? '请登录素材库，或重新登录过期的账号。' : code === 403 ? '此账号没有该目录的权限。' : code === 429 ? '请求过于频繁，请稍后重试。' : '云端请求失败，请检查后台连接与权限。');
      error.code = code; throw error;
    }
    return data.data;
  }
  function mediaUrl(value, input) {
    if (!value) return '';
    const url = new URL(value, config(input).endpoint);
    if (url.protocol !== 'https:' || url.username || url.password || /(?:^|[?&])(?:token|access_token|auth|authorization)=/i.test(url.search)) throw new Error('后台返回了不安全的文件地址。');
    return url.href;
  }
  const sessionFor = input => root.OpenListAuth.get(input);
  const join = (base, name) => (base === '/' ? '' : base) + '/' + name;
  async function directory(input, path, session, signal, refresh = false) {
    const content = []; let page = 1;
    for (;;) {
      const data = await request(input, 'fs/list', { path, password: '', page, per_page: 100, refresh }, session, signal);
      if (!data || !Array.isArray(data.content)) throw new Error('云端目录数据无效。');
      content.push(...data.content);
      if (content.length >= data.total || data.content.length < 100) return { ...data, content };
      if (content.length >= 5000 || ++page > 50) throw new Error('目录过大，请缩小素材目录范围。');
    }
  }
  function type(name) {
    const ext = name.split('.').pop().toLowerCase();
    if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'avif'].includes(ext)) return 'image';
    if (['mp4', 'webm', 'mov', 'mkv', 'm4v'].includes(ext)) return 'video';
    if (['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac'].includes(ext)) return 'audio';
    return 'other';
  }
  async function list(input, signal) {
    const settings = config(input), session = sessionFor(input);
    if (!session) { const error = new Error('请先登录素材库。'); error.code = 401; throw error; }
    const assets = [], queue = [{ path: settings.folderPath, label: '' }], seen = new Set();
    let access;
    while (queue.length) {
      const folder = queue.shift();
      if (seen.has(folder.path)) continue;
      if (seen.size >= 100) throw new Error('子目录过多，请缩小素材目录范围。');
      seen.add(folder.path);
      const data = await directory(input, folder.path, session, signal);
      if (folder.path === settings.folderPath) access = { canUpload: false, hasWritePermission: data.write === true, uploadPending: true };
      for (const file of data.content) {
        if (typeof file.name !== 'string' || !file.name || /[\\/\u0000-\u001f]/.test(file.name) || ['.', '..'].includes(file.name)) throw new Error('云端返回了无效文件名。');
        const path = join(folder.path, file.name);
        if (file.is_dir) { queue.push({ path, label: join(folder.label, file.name) }); continue; }
        if (assets.length >= 5000) throw new Error('素材超过 5000 份，请缩小目录范围。');
        const assetType = type(file.name);
        assets.push({ id: 'ol-' + path, path, name: file.name, type: assetType, folder: folder.label.replace(/^\//, '') || '根目录', tags: folder.label.split('/').filter(Boolean), description: '', member: '', date: String(file.modified || '').slice(0, 10), modified: String(file.modified || ''), sizeMB: Number(file.size) / 1048576, cloud: true, provider: 'openlist', previewUrl: mediaUrl(file.thumb, input), sourceUrl: '' });
      }
    }
    return { assets, folderId: settings.folderPath, name: '素材库', access };
  }
  async function profile(input, session, signal) {
    const user = await request(input, 'me', undefined, session, signal);
    if (!user || ![0, 2].includes(user.role) || user.disabled || user.username !== session.username) { const error = new Error('此账号无法作为素材库成员使用。'); error.code = 401; throw error; }
    return { name: user.username, avatarUrl: '', permission: user.permission, role: user.role };
  }
  async function memberAccess(input, session, signal) {
    const data = await directory(input, config(input).folderPath, session, signal);
    // Worker 的移动云盘上传尚未实现。连接验收完成前不开放上传，
    // 也不因 /put 返回 200 就把一个空实现当作成功。
    return { canUpload: false, hasWritePermission: data.write === true, uploadPending: true };
  }
  async function resolve(input, asset, signal) {
    const base = config(input).folderPath;
    if (!(asset.path.startsWith((base === '/' ? '' : base) + '/')) || asset.path.split('/').some(x => ['.', '..'].includes(x))) throw new Error('文件不在素材目录内。');
    const data = await request(input, 'fs/get', { path: asset.path, password: '' }, sessionFor(input), signal);
    const url = mediaUrl(data?.raw_url, input);
    if (!url) throw new Error('后台没有提供原文件下载地址。');
    return url;
  }
  function downloadUrl() { return '#'; }
  async function upload() { throw new Error('云端上传尚未完成验收，当前不接收文件。'); }
  const api = { config, request, mediaUrl, list, directory, profile, memberAccess, resolve, downloadUrl, upload };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OpenListClient = api;
})(typeof window === 'undefined' ? globalThis : window);
