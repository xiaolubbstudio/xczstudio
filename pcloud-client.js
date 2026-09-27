// 仅使用 pCloud 公开分享及上传接口；不接收账号密码或 token。
(function (root) {
  'use strict';
  const HOSTS = { us: 'https://api.pcloud.com', eu: 'https://eapi.pcloud.com' };
  const ERRORS = { 2001: 'pCloud 未接受文件名，请检查文件名后重试。', 2003: '没有访问权限。', 2008: 'pCloud 空间不足。', 7001: '链接无效，请检查链接和数据地区。', 7002: '链接已被删除。', 7004: '链接已过期。', 7005: '分享链接流量已用完。', 7006: '分享链接下载次数已用完。', 7007: '上传链接空间额度已用完。', 7008: '上传链接文件数量额度已用完。' };

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
    const upload = input.uploadUrl ? parseLink(input.uploadUrl, 'upload') : null;
    return { region, folder, upload, base: HOSTS[region] };
  }

  function result(data) {
    if (!data || !Number.isInteger(data.result)) throw new Error('pCloud 返回了无法识别的响应。');
    if (data.result !== 0) throw new Error(ERRORS[data.result] || `pCloud 请求失败（${data.result}）。`);
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
        const thumb = file.thumb ? `${settings.base}/getpubthumb?${new URLSearchParams({ code: settings.folder.code, fileid: String(file.fileid), size: '640x360', crop: '1' })}` : '';
        assets.push({ id: `pcloud-${settings.region}-${file.fileid}`, fileid: file.fileid, name: file.name, type: typeFor(file), tags: path, description: path.length ? `所在文件夹：${path.join(' / ')}` : '已自动从 pCloud 读取，无需手动登记。', member: 'pCloud', date: Number.isNaN(date.getTime()) ? '1970-01-01' : date.toISOString().slice(0, 10), sizeMB: typeof file.size === 'number' ? file.size / 1048576 : null, previewUrl: thumb, sourceUrl: settings.folder.url, demo: false, cloud: true });
      }
    }
    visit(metadata, [], 0);
    return assets;
  }

  async function list(input, signal) {
    const settings = config(input);
    if (!settings.folder) throw new Error('请先设置文件夹分享链接。');
    const data = await request(settings, 'showpublink', { code: settings.folder.code }, signal);
    return { name: data.metadata?.name || '素材库', assets: assetsFor(data.metadata, settings) };
  }

  function upload(input, file, onProgress, signal, sender = '雷霆工作室') {
    const settings = config(input);
    if (!settings.upload || !settings.folder) throw new Error('先设置同一文件夹的分享链接和上传链接。');
    if (!file || file.size <= 0) throw new Error('不能上传空文件。');
    if (!sender.trim() || sender.length > 30 || /[/\\\u0000-\u001f]/.test(sender)) throw new Error('成员名称不能留空、超过 30 字或包含斜线。');
    return new Promise((resolve, reject) => {
      const xhr = new root.XMLHttpRequest();
      const url = new URL(`${settings.base}/uploadtolink`);
      url.search = new URLSearchParams({ code: settings.upload.code, names: sender.trim(), filescount: '1', nopartial: '1' });
      xhr.open('POST', url.href);
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
      // 与官方上传页面一致：参数在 URL，multipart 只放文件。
      // 由浏览器设置 boundary，不设置额外请求头。
      const form = new root.FormData();
      form.append('file', file, file.name);
      if (signal?.aborted) { finish(reject, new Error('上传已取消。')); return; }
      signal?.addEventListener('abort', stop, { once: true });
      xhr.send(form);
    });
  }

  const api = { parseLink, config, result, typeFor, assetsFor, list, upload };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PCloudClient = api;
})(typeof window === 'undefined' ? globalThis : window);
