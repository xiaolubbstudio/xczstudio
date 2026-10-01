// 仅缓存预览字节，不保存登录令牌、云盘凭据或临时下载地址。
(function (root) {
  'use strict';
  const NAME = 'studio-previews-v1';
  const TOTAL = 512 * 1024 * 1024;
  const MEMORY = 32 * 1024 * 1024;
  const memory = new Map();
  let writes = Promise.resolve();
  async function key(parts) {
    const hash = await root.crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(parts)));
    return new URL('./__preview_cache__/' + Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join(''), root.location.href).href;
  }
  const check = signal => signal?.throwIfAborted();
  function imageType(bytes) {
    const starts = values => values.every((value, index) => bytes[index] === value);
    if (starts([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])) return 'image/png';
    if (starts([0xff,0xd8,0xff])) return 'image/jpeg';
    if (starts([0x47,0x49,0x46,0x38]) && [0x37,0x39].includes(bytes[4]) && bytes[5] === 0x61) return 'image/gif';
    if (starts([0x52,0x49,0x46,0x46]) && [0x57,0x45,0x42,0x50].every((value, index) => bytes[index + 8] === value)) return 'image/webp';
    return '';
  }
  async function store() {
    try { return await root.caches?.open(NAME); } catch { return null; }
  }
  async function remember(cache, id, blob) {
    memory.delete(id); if (blob.size <= MEMORY) memory.set(id, blob);
    let bytes = [...memory.values()].reduce((sum, value) => sum + value.size, 0);
    for (const [old, value] of memory) { if (bytes <= MEMORY) break; memory.delete(old); bytes -= value.size; }
    if (!cache) return false;
    const save = async () => {
      try {
        const entries = await Promise.all((await cache.keys()).map(async request => ({ request, response: await cache.match(request) })));
        entries.sort((a, b) => Number(a.response?.headers.get('X-Preview-Used')) - Number(b.response?.headers.get('X-Preview-Used')));
        let total = entries.reduce((sum, e) => e.request.url === id ? sum : sum + Number(e.response?.headers.get('X-Preview-Bytes') || 0), blob.size);
        for (const e of entries) { if (total <= TOTAL) break; if (e.request.url === id) continue; await cache.delete(e.request); total -= Number(e.response?.headers.get('X-Preview-Bytes') || 0); }
        await cache.put(id, new Response(blob, { headers: { 'Content-Type': blob.type, 'X-Preview-Bytes': String(blob.size), 'X-Preview-Used': String(Date.now()) } }));
        return true;
      } catch { return false; } // 无痕模式、容量不足：只复用本次页面的内存缓存。
    };
    const result = writes.then(save); writes = result.catch(() => {}); return result;
  }
  async function load(parts, resolveUrl, { signal, limit, kind, onProgress }) {
    check(signal);
    const id = await key(parts), cache = await store();
    await writes; check(signal); // 等待已完成下载的缓存写入，避免快速重开时重复下载。
    let hit = memory.get(id);
    if (!hit && cache) { try { const response = await cache.match(id); if (response) hit = await response.blob(); } catch { /* memory fallback */ } }
    check(signal);
    if (hit && hit.size <= limit && hit.type.startsWith(kind + '/')) {
      // 命中后不重复写入整份大视频。
      let persistent = false;
      try { persistent = Boolean(cache && await cache.match(id)); } catch { /* memory only */ }
      check(signal); return { blob: hit, cached: true, persistent };
    }
    // 命中缓存时不调用 resolveUrl，因此不会重新请求后台或临时直链。
    const url = await resolveUrl(); check(signal);
    if (!url) throw new Error('尚无预览');
    const response = await root.fetch(url, { signal, credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'default' });
    let type = (response.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase();
    // Some cloud thumbnails are real images labeled as generic binary data.
    // Only accept them after checking their file signature, never by filename.
    const inspectImage = kind === 'image' && ['', 'application/octet-stream', 'binary/octet-stream'].includes(type);
    if (response.status !== 200 || (!type.startsWith(kind + '/') && !inspectImage) || Number(response.headers.get('Content-Length') || 0) > limit) {
      await response.body?.cancel(); throw new Error('预览不可用或超过预览大小限制');
    }
    const reader = response.body.getReader(), chunks = []; let size = 0;
    const total = Number(response.headers.get('Content-Length') || 0);
    try {
      for (;;) {
        check(signal); const next = await reader.read(); if (next.done) break;
        size += next.value.byteLength;
        if (size > limit) throw new Error('预览超过大小限制，已停止加载');
        chunks.push(next.value);
        onProgress?.(size, total);
      }
    } finally { await reader.cancel().catch(() => {}); }
    check(signal);
    if (total && total !== size) throw new Error('预览下载未完成，请重试');
    if (inspectImage) {
      const header = new Uint8Array(await new Blob(chunks).slice(0, 12).arrayBuffer());
      type = imageType(header);
      if (!type) throw new Error('预览返回的内容不是可识别的图片');
    }
    const blob = new Blob(chunks, { type });
    if (!blob.size) throw new Error('预览文件为空');
    const persistent = await remember(cache, id, blob);
    check(signal); return { blob, cached: false, persistent };
  }
  const api = { key, load };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.StudioPreviewCache = api;
})(typeof window === 'undefined' ? globalThis : window);
