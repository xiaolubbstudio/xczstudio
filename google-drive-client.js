// Public catalogue + member uploads. OAuth credentials only travel in headers.
(function (root) {
  'use strict';
  const API = 'https://www.googleapis.com/drive/v3';
  const FOLDER = 'application/vnd.google-apps.folder';
  const ID = /^[a-zA-Z0-9_-]{10,200}$/;
  const FIELDS = 'id,name,mimeType,size,createdTime,modifiedTime,thumbnailLink,webContentLink,resourceKey,owners(displayName)';
  const CHUNK = 8 * 1024 * 1024;

  function parseFolder(value) {
    let url;
    try { url = new URL(value); } catch { throw new Error('请粘贴完整的 Google Drive 文件夹分享链接。'); }
    if (url.protocol !== 'https:' || url.hostname !== 'drive.google.com' || url.username || url.password || /access_token|client_secret|password/i.test(url.href)) throw new Error('只接受 drive.google.com 的 HTTPS 文件夹链接。');
    const match = /^\/(?:drive\/(?:u\/\d+\/)?folders|folders)\/([a-zA-Z0-9_-]+)\/?$/.exec(url.pathname);
    const id = match?.[1];
    if (!id || !ID.test(id)) throw new Error('请分享整个 Google Drive 文件夹，不能使用单个文件链接。');
    const resourceKey = url.searchParams.get('resourcekey') || '';
    if (resourceKey && !/^[a-zA-Z0-9_-]{1,200}$/.test(resourceKey)) throw new Error('文件夹资源密钥无效。');
    return { id, resourceKey, url: `https://drive.google.com/drive/folders/${id}${resourceKey ? `?resourcekey=${resourceKey}` : ''}` };
  }

  function config(input = {}) {
    const folder = input.folderUrl ? parseFolder(input.folderUrl) : null;
    const apiKey = String(input.apiKey || '').trim();
    const clientId = String(input.clientId || '').trim();
    const projectNumber = String(input.projectNumber || '').trim();
    if (apiKey && !/^AIza[a-zA-Z0-9_-]{30,100}$/.test(apiKey)) throw new Error('Google API Key 格式无效，只填已限制网站来源的 API Key。');
    if (clientId && !/^\d+-[a-zA-Z0-9_-]+\.apps\.googleusercontent\.com$/.test(clientId)) throw new Error('Google OAuth Client ID 格式无效，不要填写 Client Secret。');
    if (projectNumber && !/^\d{6,20}$/.test(projectNumber)) throw new Error('项目编号应为 Google Cloud 的纯数字 Project number。');
    return { folder, apiKey, clientId, projectNumber };
  }

  function cloudUrl(value, hosts) {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && !url.username && !url.password && hosts.some(host => url.hostname === host || url.hostname.endsWith(`.${host}`)) && !/access_token|client_secret/i.test(url.href) ? url.href : '';
    } catch { return ''; }
  }

  function fileUrl(file, preview = false) {
    if (!ID.test(file.id)) throw new Error('Google 文件 ID 无效。');
    const url = new URL(preview ? `https://drive.google.com/file/d/${file.id}/preview` : 'https://drive.google.com/uc');
    if (!preview) { url.searchParams.set('id', file.id); url.searchParams.set('export', 'download'); }
    if (file.resourceKey) url.searchParams.set('resourcekey', file.resourceKey);
    return url.href;
  }

  function typeFor(file) {
    const ext = file.name?.toLowerCase().split('.').pop();
    if (['gif', 'svg', 'apng', 'json', 'aep', 'lottie'].includes(ext)) return 'animation';
    if (file.mimeType?.startsWith('video/') || ['mp4', 'mov', 'webm', 'mkv', 'avi', 'm4v'].includes(ext)) return 'video';
    if (file.mimeType?.startsWith('audio/') || ['wav', 'mp3', 'flac', 'aiff', 'm4a'].includes(ext)) return 'audio';
    if (file.mimeType?.startsWith('image/') || ['psd', 'heic'].includes(ext)) return 'image';
    return 'other';
  }

  function assetFor(file, tags = []) {
    if (!file || !ID.test(file.id) || typeof file.name !== 'string' || file.mimeType?.startsWith('application/vnd.google-apps.')) return null;
    const date = new Date(file.createdTime || file.modifiedTime);
    const source = new URL(`https://drive.google.com/file/d/${file.id}/view`);
    if (file.resourceKey) source.searchParams.set('resourcekey', file.resourceKey);
    return {
      id: `gdrive-${file.id}`, fileid: file.id, name: file.name, type: typeFor(file), tags: [...tags],
      description: '', member: file.owners?.[0]?.displayName || 'Google Drive',
      date: Number.isNaN(date.getTime()) ? '1970-01-01' : date.toISOString().slice(0, 10),
      sizeMB: file.size != null && Number.isFinite(Number(file.size)) ? Number(file.size) / 1048576 : null,
      previewUrl: cloudUrl(file.thumbnailLink, ['googleusercontent.com']), embedUrl: fileUrl(file, true),
      sourceUrl: source.href, downloadUrl: cloudUrl(file.webContentLink, ['drive.google.com', 'drive.usercontent.google.com', 'googleusercontent.com']) || fileUrl(file),
      resourceKey: file.resourceKey || '', provider: 'google', cloud: true, demo: false
    };
  }

  async function responseError(response) {
    let reason = '';
    try { const data = await response.json(); reason = data.error?.errors?.[0]?.reason || data.error?.status || ''; } catch { /* generic status */ }
    const messages = {
      storageQuotaExceeded: '这个 Google 账号空间不足，请清理空间。',
      downloadQuotaExceeded: 'Google 暂时限制了这个文件的下载，请稍后重试。',
      dailyLimitExceeded: 'Google API 今日额度已用完，请稍后重试。',
      userRateLimitExceeded: 'Google 请求过于频繁，请稍后重试。',
      accessNotConfigured: '请在 Google Cloud 项目启用 Google Drive API。'
    };
    const message = messages[reason] || (response.status === 401 ? 'Google 登录已过期，请重新登录。' : response.status === 404 ? '未找到文件夹，或当前账号／应用尚未获得访问授权。' : response.status === 403 ? 'Google 拒绝访问，请检查文件夹共享权限、API Key 来源限制和 API 是否已启用。' : `Google Drive 请求失败（HTTP ${response.status}）。`);
    const error = new Error(message);
    error.code = response.status;
    return error;
  }

  function requireSession(input, session) {
    const auth = root.GoogleDriveAuth || (typeof require === 'function' ? require('./google-drive-auth.js') : null);
    if (!auth?.validSession(session, input)) { const error = new Error('请重新登录 Google 账号。'); error.code = 401; throw error; }
  }

  async function request(settings, path, params, signal, session, resourceKeys = []) {
    const url = new URL(`${API}/${path}`);
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
    const headers = {};
    if (session) headers.Authorization = `Bearer ${session.token}`;
    else {
      if (!settings.apiKey) throw new Error('请先配置 Google API Key，才能公开读取素材目录。');
      url.searchParams.set('key', settings.apiKey);
    }
    const keys = resourceKeys.filter(file => file.resourceKey).map(file => `${file.id}/${file.resourceKey}`);
    if (keys.length) headers['X-Goog-Drive-Resource-Keys'] = keys.join(',');
    const response = await root.fetch(url.href, { headers, signal, credentials: 'omit', cache: 'no-store', redirect: 'error' });
    if (!response.ok) throw await responseError(response);
    return response.json();
  }

  async function list(input, signal) {
    const settings = config(input);
    if (!settings.folder) throw new Error('请先连接 Google Drive 素材文件夹。');
    const folder = await request(settings, `files/${settings.folder.id}`, { fields: 'id,name,mimeType', supportsAllDrives: 'true' }, signal, null, [settings.folder]);
    if (folder.id !== settings.folder.id || folder.mimeType !== FOLDER) throw new Error('Google 返回的素材文件夹不匹配。');
    const assets = [];
    const visited = new Set();
    async function visit(parent, tags, depth) {
      if (depth > 30 || visited.size >= 500) throw new Error('素材文件夹层级或数量过多。');
      if (visited.has(parent.id)) return;
      visited.add(parent.id);
      let pageToken = '';
      const pages = new Set();
      do {
        const data = await request(settings, 'files', {
          q: `'${parent.id}' in parents and trashed = false`, fields: `nextPageToken,incompleteSearch,files(${FIELDS})`,
          pageSize: '100', supportsAllDrives: 'true', includeItemsFromAllDrives: 'true', ...(pageToken ? { pageToken } : {})
        }, signal, null, [settings.folder, parent]);
        if (!Array.isArray(data.files) || data.incompleteSearch) throw new Error('Google 未返回完整目录，请稍后刷新。');
        for (const file of data.files) {
          if (file.mimeType === FOLDER && ID.test(file.id)) await visit(file, [...tags, file.name], depth + 1);
          else { const asset = assetFor(file, tags); if (asset) assets.push(asset); }
          if (assets.length > 5000) throw new Error('目录超过 5000 个文件，请缩小素材文件夹范围。');
        }
        pageToken = data.nextPageToken || '';
        if (pageToken && pages.has(pageToken)) throw new Error('Google 目录分页异常，请重试。');
        pages.add(pageToken);
      } while (pageToken);
    }
    await visit(settings.folder, [], 0);
    return { name: folder.name, folderId: folder.id, assets };
  }

  async function profile(input, session, signal) {
    requireSession(input, session);
    const data = await request(config(input), 'about', { fields: 'user(displayName,emailAddress,photoLink,permissionId)' }, signal, session);
    if (!data.user?.permissionId) throw new Error('Google 未返回有效的成员身份，请重新登录。');
    return { uid: data.user.permissionId, name: data.user.displayName || data.user.emailAddress || 'Google 成员', avatarUrl: cloudUrl(data.user.photoLink, ['googleusercontent.com']) };
  }

  async function memberAccess(input, session, signal) {
    requireSession(input, session);
    const settings = config(input);
    const folder = await request(settings, `files/${settings.folder.id}`, { fields: 'id,mimeType,capabilities(canAddChildren)', supportsAllDrives: 'true' }, signal, session, [settings.folder]);
    if (folder.id !== settings.folder.id || folder.mimeType !== FOLDER) throw new Error('上传目标与素材文件夹不一致。');
    return { canUpload: folder.capabilities?.canAddChildren === true };
  }

  function uploadLocation(value) {
    let url;
    try { url = new URL(value); } catch { throw new Error('Google 未返回可用的上传地址。'); }
    if (url.protocol !== 'https:' || url.hostname !== 'www.googleapis.com' || url.username || url.password || url.pathname !== '/upload/drive/v3/files') throw new Error('Google 返回的上传地址不受信任。');
    return url.href;
  }

  function sendChunk(url, file, start, end, session, onProgress, signal) {
    return new Promise((resolve, reject) => {
      const xhr = new root.XMLHttpRequest();
      xhr.open('PUT', url);
      xhr.setRequestHeader('Authorization', `Bearer ${session.token}`);
      xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
      xhr.setRequestHeader('Content-Range', `bytes ${start}-${end - 1}/${file.size}`);
      xhr.timeout = 5 * 60 * 1000;
      const stop = () => xhr.abort();
      const finish = (callback, value) => { signal?.removeEventListener('abort', stop); callback(value); };
      xhr.upload.onprogress = event => { if (event.lengthComputable) onProgress?.(Math.min(99, Math.round((start + event.loaded) / file.size * 100))); };
      xhr.onload = () => {
        if (xhr.status === 308) {
          const range = /^bytes=0-(\d+)$/.exec(xhr.getResponseHeader('Range') || '');
          const next = range ? Number(range[1]) + 1 : 0;
          if (next <= start || next > end || next >= file.size) { finish(reject, new Error('Google 未确认这一段上传，请刷新目录后重试。')); return; }
          finish(resolve, { next });
        } else if (xhr.status >= 200 && xhr.status < 300) {
          try { finish(resolve, { file: JSON.parse(xhr.responseText) }); }
          catch { finish(reject, new Error('Google 上传响应无法识别，请刷新目录确认结果。')); }
        } else {
          const error = new Error(xhr.status === 401 ? '登录已过期，请重新登录。' : xhr.status === 403 ? 'Google 拒绝上传，请检查成员权限和账号剩余空间。' : `上传失败（HTTP ${xhr.status}），请先刷新目录确认结果。`);
          error.code = xhr.status;
          finish(reject, error);
        }
      };
      xhr.onerror = () => finish(reject, new Error('上传连接中断，请先刷新目录确认结果，避免重复上传。'));
      xhr.ontimeout = () => finish(reject, new Error('上传超时，请先刷新目录确认结果。'));
      xhr.onabort = () => finish(reject, new Error('上传已停止。'));
      if (signal?.aborted) { finish(reject, new Error('上传已停止。')); return; }
      signal?.addEventListener('abort', stop, { once: true });
      xhr.send(file.slice(start, end));
    });
  }

  async function upload(input, file, onProgress, signal, session) {
    const settings = config(input);
    requireSession(input, session);
    if (signal?.aborted) throw new Error('上传已停止。');
    if (!file?.name || !Number.isSafeInteger(file.size) || file.size <= 0) throw new Error('请选择非空文件。');
    const access = await memberAccess(input, session, signal);
    if (!access.canUpload) throw new Error('你的 Google 账号只有查看权限，不能上传。');
    const response = await root.fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true&fields=id,name,size,parents', {
      method: 'POST', headers: { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': file.type || 'application/octet-stream', 'X-Upload-Content-Length': String(file.size) },
      body: JSON.stringify({ name: file.name, parents: [settings.folder.id] }), signal, credentials: 'omit', redirect: 'error'
    });
    if (!response.ok) throw await responseError(response);
    const location = uploadLocation(response.headers.get('Location'));
    let start = 0;
    while (start < file.size) {
      requireSession(input, session);
      const end = Math.min(start + CHUNK, file.size);
      const data = await sendChunk(location, file, start, end, session, onProgress, signal);
      if (data.file) {
        if (end !== file.size || !ID.test(data.file.id) || !data.file.parents?.includes(settings.folder.id) || Number(data.file.size) !== file.size) throw new Error('Google 未确认完整文件已保存在素材文件夹，请先刷新目录。');
        onProgress?.(100);
        return data.file;
      }
      start = data.next;
    }
    throw new Error('Google 尚未确认上传完成，请刷新目录核实。');
  }

  function downloadUrl(input, asset) {
    const address = asset?.provider === 'google' && ID.test(asset.fileid) && cloudUrl(asset.downloadUrl, ['drive.google.com', 'drive.usercontent.google.com', 'googleusercontent.com']);
    if (!address) throw new Error('原文件下载地址无效，请刷新目录。');
    return address;
  }
  const api = { parseFolder, config, typeFor, assetFor, list, profile, memberAccess, upload, uploadLocation, downloadUrl };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GoogleDriveClient = api;
})(typeof window === 'undefined' ? globalThis : window);
