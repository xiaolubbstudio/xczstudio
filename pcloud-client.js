// 目录公开读取；上传必须使用当前成员的 OAuth 会话，由 pCloud 校验文件夹权限。
(function (root) {
  'use strict';
  const HOSTS = { us: 'https://api.pcloud.com', eu: 'https://eapi.pcloud.com' };
  const ERRORS = { 1000: '请先登录 pCloud 账号。', 2000: '登录已失效，请重新登录。', 2001: 'pCloud 未接受文件名，请检查文件名后重试。', 2003: '你的账号没有这个素材文件夹的访问或上传权限。请联系管理员邀请。', 2005: '未找到素材文件夹，请确认已接受邀请。', 2008: 'pCloud 空间不足。', 7001: '链接无效，请检查链接和数据地区。', 7002: '链接已被删除。', 7004: '链接已过期。', 7005: '分享链接流量已用完。', 7006: '分享链接下载次数已用完。', 7007: '上传链接空间额度已用完。', 7008: '上传链接文件数量额度已用完。' };

  function parseLink(value, kind) {
    let url;
    try { url = new URL(value); } catch { throw new Error('请粘贴完整的 pCloud HTTPS 链接。'); }
    if (url.protocol !== 'https:' || url.username || url.password || !/(^|\.)(pcloud\.com|pcloud\.link)$/.test(url.hostname) || /access_token|password|(?:[?&#])auth=/i.test(url.href)) throw new Error('只接受 pCloud 官方 HTTPS 分享或上传链接，不接受密码和 token。');
    const fragment = url.hash.slice(1);
    const question = fragment.indexOf('?');
    const hash = new URLSearchParams(question >= 0 ? fragment.slice(question + 1) : fragment);
    const page = hash.get('page') || (question >= 0 ? fragment.slice(0, question).replace(/^\//, '') : '');
    if (kind === 'upload' && page && page !== 'puplink') throw new Error('上传入口需要“请求文件”链接，不是普通分享链接。');
    if (kind === 'folder' && page === 'puplink') throw new Error('目录入口需要文件夹分享链接，不是上传链接。');
    const code = url.searchParams.get('code') || hash.get('code');
    if (!code || !/^[a-zA-Z0-9_-]{1,300}$/.test(code)) throw new Error('链接中没有 code。请复制完整链接，不使用短链接。');
    return { url: url.href, code };
  }

  function config(input = {}) {
    const region = input.region || 'us';
    if (!HOSTS[region]) throw new Error('请选择美国或欧洲数据地区。');
    const folder = input.folderUrl ? parseLink(input.folderUrl, 'folder') : null;
    const clientId = String(input.clientId || '').trim();
    if (clientId && !/^[a-zA-Z0-9_-]{1,200}$/.test(clientId)) throw new Error('pCloud Client ID 无效，请勿填写 Client Secret 或 token。');
    return { region, folder, clientId, base: HOSTS[region] };
  }

  function result(data) {
    if (!data || !Number.isInteger(data.result)) throw new Error('pCloud 返回了无法识别的响应。');
    if (data.result !== 0) {
      const error = new Error(ERRORS[data.result] || `pCloud 请求失败（${data.result}）。`);
      error.code = data.result;
      throw error;
    }
    return data;
  }

  async function request(settings, method, params, signal) {
    const url = new URL(`${settings.base}/${method}`);
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
    const response = await root.fetch(url.href, { signal, credentials: 'omit', cache: 'no-store' });
    if (!response.ok) throw new Error(`pCloud 连接失败（HTTP ${response.status}）。`);
    return result(await response.json());
  }

  function typeFor(file) {
    const ext = file.name.toLowerCase().split('.').pop();
    if (['gif', 'svg', 'apng', 'json', 'aep', 'lottie'].includes(ext)) return 'animation';
    if (['mp4', 'mov', 'webm', 'mkv', 'avi', 'm4v'].includes(ext) || file.category === 2) return 'video';
    if (['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac', 'aiff'].includes(ext) || file.category === 3) return 'audio';
    if (['png', 'jpg', 'jpeg', 'webp', 'bmp', 'tiff', 'heic', 'psd'].includes(ext) || file.category === 1) return 'image';
    return 'other';
  }

  function assetsFor(metadata, settings) {
    if (!metadata?.isfolder || !Array.isArray(metadata.contents)) throw new Error('请使用整个素材文件夹的分享链接，不是单个文件链接。');
    const assets = [];
    function visit(folder, path, depth) {
      if (depth > 30) throw new Error('文件夹层级太深。');
      for (const file of folder.contents || []) {
        if (file.isfolder) { visit(file, [...path, String(file.name || '')], depth + 1); continue; }
        if (!Number.isSafeInteger(file.fileid) || typeof file.name !== 'string') continue;
        const date = new Date(file.modified || file.created);
        // Omitting crop preserves the entire image, including portrait artwork.
        const thumb = (size) => file.thumb ? `${settings.base}/getpubthumb?${new URLSearchParams({ code: settings.folder.code, fileid: String(file.fileid), size })}` : '';
        assets.push({ id: `pcloud-${settings.region}-${file.fileid}`, fileid: file.fileid, name: file.name, type: typeFor(file), tags: path, description: path.length ? `所在文件夹：${path.join(' / ')}` : '已自动从 pCloud 读取，无需手动登记。', member: 'pCloud', date: Number.isNaN(date.getTime()) ? '1970-01-01' : date.toISOString().slice(0, 10), sizeMB: typeof file.size === 'number' ? file.size / 1048576 : null, previewUrl: thumb('640x360'), detailPreviewUrl: thumb('1024x1024'), sourceUrl: settings.folder.url, demo: false, cloud: true });
      }
    }
    visit(metadata, [], 0);
    return assets;
  }

  async function list(input, signal) {
    const settings = config(input);
    if (!settings.folder) throw new Error('请先设置文件夹分享链接。');
    const data = await request(settings, 'showpublink', { code: settings.folder.code }, signal);
    return { name: data.metadata?.name || '素材库', folderId: data.metadata?.folderid, assets: assetsFor(data.metadata, settings) };
  }

  function requireSession(input, session) {
    const auth = root.PCloudAuth || (typeof require === 'function' ? require('./pcloud-auth.js') : null);
    if (!auth?.validSession(session, input)) throw new Error('请先登录有效的 pCloud 账号，再上传素材。');
  }

  async function authenticated(input, session, method, params, signal) {
    const settings = config(input);
    requireSession(settings, session);
    const body = new URLSearchParams({ access_token: session.token, ...params });
    const response = await root.fetch(`${settings.base}/${method}`, { method: 'POST', body, signal, credentials: 'omit', cache: 'no-store' });
    if (!response.ok) throw new Error(`pCloud 连接失败（HTTP ${response.status}）。`);
    return result(await response.json());
  }

  async function memberAccess(input, session, signal) {
    if (!Number.isSafeInteger(input.folderId) || input.folderId <= 0) throw new Error('素材文件夹尚未读取成功，请刷新后重试。');
    const data = await authenticated(input, session, 'listfolder', { folderid: String(input.folderId), nofiles: '1' }, signal);
    const folder = data.metadata;
    if (!folder?.isfolder || folder.folderid !== input.folderId) throw new Error('pCloud 返回的素材文件夹不匹配。');
    return { canUpload: folder.ismine === true || folder.cancreate === true, owner: folder.ismine === true };
  }

  async function profile(input, session, signal) {
    const data = await authenticated(input, session, 'userinfo', {}, signal);
    if (data.userid !== session.uid) throw new Error('登录身份不匹配，请重新登录。');
    return { uid: data.userid, name: typeof data.email === 'string' ? data.email : `pCloud 成员 ${data.userid}`, avatarUrl: avatarUrl(data.avatar) };
  }

  // pCloud's web client uses hosts + path for avatars. Some account types do
  // not expose an avatar through userinfo; absence must not prevent login.
  function avatarUrl(avatar) {
    if (!avatar || avatar.isdefault || !Array.isArray(avatar.hosts) || typeof avatar.path !== 'string') return '';
    const host = avatar.hosts.find(value => typeof value === 'string' && /^(?:[a-z0-9-]+\.)*(?:pcloud\.com|pcloud\.link)$/i.test(value));
    if (!host || !avatar.path.startsWith('/') || avatar.path.startsWith('//')) return '';
    try {
      const url = new URL(`https://${host}${avatar.path}`);
      if (url.hostname !== host.toLowerCase() || /access_token|password|(?:[?&#])auth=/i.test(url.href)) return '';
      return url.href;
    } catch { return ''; }
  }

  async function upload(input, file, onProgress, signal, session) {
    const settings = config(input);
    requireSession(settings, session);
    if (!settings.folder) throw new Error('管理员尚未配置素材文件夹。');
    if (!file || file.size <= 0) throw new Error('不能上传空文件。');
    if (signal?.aborted) throw new Error('上传已取消。');
    const access = await memberAccess(input, session, signal);
    if (!access.canUpload) throw new Error('你只有浏览权限，不能上传。请联系管理员调整共享权限。');
    return new Promise((resolve, reject) => {
      const xhr = new root.XMLHttpRequest();
      xhr.open('POST', `${settings.base}/uploadfile`);
      xhr.responseType = 'json';
      xhr.timeout = 30 * 60 * 1000;
      xhr.withCredentials = false;
      const stop = () => xhr.abort();
      const finish = (callback, value) => { signal?.removeEventListener('abort', stop); callback(value); };
      xhr.upload.onprogress = (event) => { if (event.lengthComputable) onProgress?.(Math.min(99, Math.round(event.loaded / event.total * 100))); };
      xhr.onload = () => {
        try {
          if (xhr.status < 200 || xhr.status >= 300) throw new Error(`上传请求失败（HTTP ${xhr.status}）。先刷新目录确认是否已上传，再重试。`);
          finish(resolve, result(xhr.response));
        } catch (error) { finish(reject, error); }
      };
      xhr.onerror = () => finish(reject, new Error('网络连接中断。先刷新目录确认是否已上传，再重试，避免重复文件。'));
      xhr.ontimeout = () => finish(reject, new Error('上传超时。先刷新目录确认是否已上传，再重试。'));
      xhr.onabort = () => finish(reject, new Error('上传已取消。'));
      // 成员令牌放在 POST 正文，避免出现在 URL、历史或分享地址中。
      // renameifexists 避免覆盖已有素材；参数先于文件，符合 uploadfile 协议。
      const form = new root.FormData();
      form.append('access_token', session.token);
      form.append('folderid', String(input.folderId));
      form.append('nopartial', '1');
      form.append('renameifexists', '1');
      form.append('file', file, file.name);
      if (signal?.aborted) { finish(reject, new Error('上传已取消。')); return; }
      signal?.addEventListener('abort', stop, { once: true });
      xhr.send(form);
    });
  }

  const api = { parseLink, config, result, typeFor, assetsFor, list, memberAccess, profile, avatarUrl, upload };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PCloudClient = api;
})(typeof window === 'undefined' ? globalThis : window);
