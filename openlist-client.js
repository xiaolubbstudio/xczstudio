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
  const cooldowns = new Map();
  function throttleError(seconds) {
    const error = new Error('请求过于频繁，请 ' + seconds + ' 秒后再操作。');
    error.code = 429; error.retryAfter = seconds; return error;
  }
  async function request(input, route, body, session, signal) {
    const { endpoint } = config(input);
    const key = endpoint + ':' + (session?.username || 'login');
    const remaining = Math.ceil(((cooldowns.get(key) || 0) - Date.now()) / 1000);
    if (remaining > 0) throw throttleError(remaining);
    const headers = { Accept: 'application/json' };
    if (session) {
      if (session.endpoint !== endpoint || !session.token || /[\u0000-\u0020]/.test(session.token)) throw new Error('请重新登录当前素材库。');
      headers.Authorization = session.token;
    }
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await root.fetch(endpoint + '/api/' + route, {
      method: body === undefined ? 'GET' : 'POST', headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal, credentials: root.location?.origin === endpoint ? 'same-origin' : 'omit', cache: 'no-store', redirect: root.location?.origin === endpoint ? 'manual' : 'error'
    });
    if (response.status === 429) {
      const seconds = Math.min(86400, Math.max(1, Number(response.headers?.get('Retry-After')) || 60));
      cooldowns.set(key, Date.now() + seconds * 1000);
      throw throttleError(seconds);
    }
    if (response.type === 'opaqueredirect' || response.headers?.get('Content-Type')?.includes('text/html')) {
      const error = new Error('入口验证已过期，请刷新页面重新验证。');
      error.code = 'ACCESS_REQUIRED'; throw error;
    }
    const data = await response.json();
    if (!response.ok || data.code !== 200) {
      // 不把服务端消息中的内部地址、凭据或堆栈回显到网页。
      const code = response.ok ? data.code : response.status;
      const catalogMessage = route.startsWith('fs/studio_catalog/') && typeof data.message === 'string' && data.message.length < 140 && !/https?:|token|authorization|stack|secret/i.test(data.message) ? data.message : '';
      const error = new Error(code === 401 ? '请登录素材库，或重新登录过期的账号。' : code === 403 ? '此账号没有该目录的权限。' : code === 429 ? '请求过于频繁，请稍后重试。' : catalogMessage || '云端请求失败，请检查后台连接与权限。');
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
    const data = await manage(input, 'list', {}, signal);
    if (!Array.isArray(data?.assets) || !Array.isArray(data?.folders) || data.assets.length > 5000) throw new Error('素材管理目录无效。');
    const assets = data.assets.map(file => {
      if (typeof file.id !== 'string' || typeof file.name !== 'string' || !file.name || /[\\/\u0000-\u001f]/.test(file.name) || typeof file.folder !== 'string') throw new Error('云端返回了无效素材。');
      return { id: file.id, name: file.name, type: type(file.name), folder: file.folder || '根目录', tags: file.folder.split('/').filter(Boolean), description: '', member: '', date: String(file.modified || '').slice(0, 10), modified: String(file.modified || ''), sizeMB: Number(file.size) / 1048576, cloud: true, provider: 'openlist', managed: true, deleted: !!file.deleted, pending: !!file.pending, revision: file.revision, previewUrl: mediaUrl(file.thumb, input), sourceUrl: '' };
    });
    const access = { canUpload: data.canManage === true, canManage: data.canManage === true, hasWritePermission: data.canManage === true };
    return { assets, folders: data.folders, folderId: settings.folderPath, name: '素材库', access };
  }
  async function manage(input, action, body = {}, signal) {
    if (!['list', 'edit', 'trash', 'restore', 'folder', 'resolve'].includes(action)) throw new Error('素材操作无效。');
    return request(input, 'fs/studio_catalog/' + action, { ...body, path: config(input).folderPath }, sessionFor(input), signal);
  }
  async function profile(input, session, signal) {
    const user = await request(input, 'me', undefined, session, signal);
    if (!user || ![0, 2].includes(user.role) || user.disabled || user.username !== session.username) { const error = new Error('此账号无法作为素材库成员使用。'); error.code = 401; throw error; }
    session.role = user.role;
    await root.OpenListAuth?.renewIfNeeded(input, session, signal);
    return { name: user.username, avatarUrl: '', permission: user.permission, role: user.role };
  }
  async function memberAccess(input, session, signal) {
    const data = await directory(input, config(input).folderPath, session, signal);
    return { canUpload: data.write === true, canManage: data.write === true, hasWritePermission: data.write === true };
  }
  async function resolve(input, asset, signal) {
    if (asset.managed) {
      const data = await manage(input, 'resolve', { id: asset.id }, signal);
      const url = mediaUrl(data?.raw_url, input);
      if (!url) throw new Error('后台没有提供原文件下载地址。');
      return url;
    }
    const base = config(input).folderPath;
    if (!(asset.path.startsWith((base === '/' ? '' : base) + '/')) || asset.path.split('/').some(x => ['.', '..'].includes(x))) throw new Error('文件不在素材目录内。');
    const data = await request(input, 'fs/get', { path: asset.path, password: '' }, sessionFor(input), signal);
    const url = mediaUrl(data?.raw_url, input);
    if (!url) throw new Error('后台没有提供原文件下载地址。');
    return url;
  }
  function downloadUrl() { return '#'; }
  function uploadLocation(input, file, relativePath = file?.webkitRelativePath || file?.name) {
    const base = config(input).folderPath;
    if (typeof relativePath !== 'string' || relativePath.includes('\\')) throw new Error('上传目录路径无效。');
    const parts = relativePath.split('/');
    if (parts.some(name => !name || name.length > 255 || /[\u0000-\u001f]/.test(name) || ['.', '..'].includes(name)) || parts.at(-1) !== file?.name) throw new Error('上传目录路径无效。');
    return { folders: parts.slice(0, -1), path: parts.length === 1 ? base : join(base, parts.slice(0, -1).join('/')) };
  }
  async function ensureUploadFolders(input, folders, session, signal, cache) {
    let parent = config(input).folderPath;
    const { endpoint } = config(input);
    for (const name of folders) {
      signal?.throwIfAborted();
      const key = endpoint + parent;
      let contents = cache.get(key);
      if (!contents) {
        contents = (await directory(input, parent, session, signal, true)).content;
        cache.set(key, contents);
      }
      const existing = contents.find(item => item.name === name);
      if (existing && !existing.is_dir) throw new Error(`“${name}”已是文件，无法创建同名文件夹。`);
      const next = join(parent, name);
      if (!existing) {
        await request(input, 'fs/mkdir', { path: next }, session, signal);
        contents.push({ name, is_dir: true });
        cache.set(endpoint + next, []);
      }
      parent = next;
    }
  }
  async function upload(input, file, progress, signal, session = sessionFor(input), relativePath, folderCache = new Map()) {
    const { endpoint } = config(input);
    if (!session || session.endpoint !== endpoint || !session.token || /[\u0000-\u0020]/.test(session.token)) throw new Error('请先登录当前素材库。');
    if (!file || !Number.isSafeInteger(file.size) || file.size < 1 || file.size > 512 * 1048576 || typeof file.name !== 'string' || !file.name || file.name.length > 255 || /[\\/\u0000-\u001f]/.test(file.name) || ['.', '..'].includes(file.name)) throw new Error('请选择有效文件，单个文件上限 512 MB。');
    const destinationFolder = uploadLocation(input, file, relativePath);
    signal?.throwIfAborted();
    let bytes = await file.arrayBuffer();
    const digest = await root.crypto.subtle.digest('SHA-256', bytes);
    bytes = null;
    const sha256 = Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, '0')).join('');
    signal?.throwIfAborted();
    const virtualFolder = [...(folderCache.virtualBase || []), ...destinationFolder.folders].join('/');
    const start = await request(input, 'fs/studio_upload/start', { path: config(input).folderPath, name: file.name, size: file.size, sha256, virtual_folder: virtualFolder }, session, signal);
    if (!start?.ticket || start.chunkSize !== 8 * 1048576) throw new Error('后台未返回有效上传会话。');
    for (let offset = 0, part = 1; !start.ready && offset < file.size; offset += start.chunkSize, part++) {
      signal?.throwIfAborted();
      const body = file.slice(offset, Math.min(offset + start.chunkSize, file.size));
      const signed = await request(input, 'fs/studio_upload/part_link', { ticket: start.ticket, part }, session, signal);
      const destination = new URL(signed?.url || '');
      if (destination.protocol !== 'https:' || destination.username || destination.password || !['139.com', '10086.cn', 'cmecloud.cn'].some(domain => destination.hostname === domain || destination.hostname.endsWith('.' + domain))) throw new Error('后台返回了无效上传地址。');
      // The signed destination allows this part only. Never send the member token to the cloud.
      const response = await root.fetch(destination.href, {
        method: 'PUT', headers: { 'Content-Type': 'application/octet-stream' },
        body, signal, credentials: 'omit', cache: 'no-store', redirect: 'error'
      });
      if (!response.ok) throw new Error('分片上传失败，请重试未完成的文件。');
      await response.body?.cancel();
      progress?.(Math.min(99, Math.round(Math.min(offset + start.chunkSize, file.size) / file.size * 100)));
    }
    const result = await request(input, 'fs/studio_upload/finish', { ticket: start.ticket }, session, signal);
    if (result?.size !== file.size || !result.name) throw new Error('尚未确认文件已保存，请刷新目录检查。');
    progress?.(100);
    return result;
  }
  const api = { config, request, mediaUrl, list, manage, directory, profile, memberAccess, resolve, downloadUrl, uploadLocation, upload };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OpenListClient = api;
})(typeof window === 'undefined' ? globalThis : window);
