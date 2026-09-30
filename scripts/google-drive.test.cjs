const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const auth = require('../google-drive-auth.js');
const input = { provider: 'google', folderUrl: 'https://drive.google.com/drive/folders/folder_123456789', apiKey: 'AIza' + 'a'.repeat(35), clientId: '123456789-test.apps.googleusercontent.com', projectNumber: '123456789' };
const session = () => ({ token: 'test-member-token', clientId: input.clientId, folderUrl: input.folderUrl, created: Date.now() - 1000, expires: Date.now() + 3600000 });
const response = data => ({ ok: true, status: 200, json: async () => data });

function client(fetch, XMLHttpRequest) {
  const sandbox = { module: { exports: {} }, URL, URLSearchParams, globalThis: { fetch, XMLHttpRequest, GoogleDriveAuth: auth } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../google-drive-client.js'), 'utf8'), sandbox);
  return sandbox.module.exports;
}

test('folder parsing rejects single files, impostor hosts, credentials and token-bearing URLs', () => {
  const api = client();
  assert.equal(api.parseFolder(input.folderUrl + '?usp=sharing&resourcekey=0-resource_123').resourceKey, '0-resource_123');
  assert.equal(api.parseFolder(input.folderUrl.replace('/drive/folders/', '/drive/u/0/folders/')).id, 'folder_123456789');
  for (const url of [input.folderUrl.replace('drive.google.com', 'drive.google.com.evil.test'), input.folderUrl.replace('https:', 'http:'), input.folderUrl.replace('https://', 'https://user:secret@'), 'https://drive.google.com/file/d/file_123456789/view', input.folderUrl + '?access_token=secret', 'https://drive.google.com/not-a-folder/folders/folder_123456789']) assert.throws(() => api.parseFolder(url));
  assert.throws(() => api.config({ ...input, apiKey: 'secret' }));
  assert.throws(() => api.config({ ...input, clientId: 'secret' }));
});

test('Google sessions expire, are bound to the client and folder, and reject malformed tokens', () => {
  const now = Date.now();
  const current = session();
  assert.equal(auth.validSession(current, input, now), true);
  assert.equal(auth.validSession({ ...current, expires: now + 1000 }, input, now), false);
  assert.equal(auth.validSession(current, { ...input, clientId: 'other' }, now), false);
  assert.equal(auth.validSession(current, { ...input, folderUrl: input.folderUrl + 'other' }, now), false);
  assert.equal(auth.validSession({ ...current, token: 'malformed\nheader' }, input, now), false);
  assert.equal(auth.validSession({ ...current, created: now + 1 }, input, now), false);
});

test('public listing paginates, traverses subfolders and keeps source downloads in original format', async () => {
  const requests = [];
  const file = { id: 'original_123456789', name: '纵向.png', mimeType: 'image/png', size: '2048', createdTime: '2026-09-30T10:00:00Z', webContentLink: 'https://drive.google.com/uc?id=original_123456789&export=download', thumbnailLink: 'https://lh3.googleusercontent.com/thumbnail', owners: [{ displayName: '成员' }] };
  const api = client(async (url, options) => {
    requests.push({ url, options });
    const parsed = new URL(url);
    if (parsed.pathname.endsWith('/files/folder_123456789')) return response({ id: 'folder_123456789', name: '素材', mimeType: 'application/vnd.google-apps.folder' });
    if (parsed.searchParams.get('q').includes('nested_123456789')) return response({ files: [{ ...file, id: 'video_123456789', name: '视频.mp4', mimeType: 'video/mp4' }] });
    if (parsed.searchParams.get('pageToken')) return response({ files: [file] });
    return response({ files: [{ id: 'nested_123456789', name: '子目录', mimeType: 'application/vnd.google-apps.folder' }], nextPageToken: 'next-page' });
  });
  const result = await api.list(input);
  assert.equal(result.assets.length, 2);
  assert.equal(result.folderId, 'folder_123456789');
  assert.equal(result.assets[0].type, 'video');
  assert.equal(result.assets[0].tags.join('/'), '子目录');
  assert.equal(result.assets[1].sizeMB, 2048 / 1048576);
  assert.equal(api.downloadUrl(input, result.assets[1]), file.webContentLink);
  assert.equal(result.assets[1].embedUrl, 'https://drive.google.com/file/d/original_123456789/preview');
  assert.equal(requests.length, 4);
  assert.ok(requests.every(item => new URL(item.url).searchParams.get('key') === input.apiKey && !item.options.headers.Authorization));
});

test('catalogue URLs reject third-party origins and native Google documents', () => {
  const api = client();
  const asset = api.assetFor({ id: 'file_123456789', name: '素材.gif', mimeType: 'image/gif', thumbnailLink: 'https://evil.test/thumbnail', webContentLink: 'https://drive.google.com.evil.test/raw', resourceKey: '0-shared' });
  assert.equal(asset.previewUrl, '');
  assert.equal(asset.type, 'animation');
  assert.equal(new URL(asset.downloadUrl).hostname, 'drive.google.com');
  assert.equal(new URL(asset.downloadUrl).searchParams.get('resourcekey'), '0-shared');
  assert.equal(api.assetFor({ id: 'doc_123456789', name: '文档', mimeType: 'application/vnd.google-apps.document' }), null);
  assert.throws(() => api.downloadUrl(input, { ...asset, downloadUrl: 'https://evil.test/file' }));
  assert.throws(() => api.uploadLocation('https://evil.test/upload'));
});

test('viewer permission is denied before starting an upload, including direct API calls', async () => {
  let calls = 0;
  const api = client(async (url, options) => {
    calls++;
    assert.equal(options.headers.Authorization, 'Bearer test-member-token');
    assert.equal(url.includes('test-member-token'), false);
    return response({ id: 'folder_123456789', mimeType: 'application/vnd.google-apps.folder', capabilities: { canAddChildren: false } });
  });
  const access = await api.memberAccess(input, session());
  assert.equal(access.canUpload, false);
  await assert.rejects(api.upload(input, new File(['abc'], 'test.png'), null, null, session()), /查看权限/);
  assert.equal(calls, 2); // only permission checks; no upload initiation
});

function uploader(finalFile, location = 'https://www.googleapis.com/upload/drive/v3/files?upload_id=test') {
  const chunks = [];
  const requests = [];
  let number = 0;
  class XHR {
    constructor() { this.upload = {}; this.headers = {}; }
    open(method, url) { this.method = method; this.url = url; }
    setRequestHeader(key, value) { this.headers[key] = value; }
    getResponseHeader() { return `bytes=0-${8 * 1024 * 1024 - 1}`; }
    send(body) {
      chunks.push({ headers: this.headers, method: this.method, url: this.url, size: body.size });
      number++;
      this.status = finalFile.size > 8 * 1024 * 1024 && number === 1 ? 308 : 200;
      this.responseText = JSON.stringify(finalFile);
      queueMicrotask(() => { this.upload.onprogress?.({ lengthComputable: true, loaded: body.size }); this.onload(); });
    }
  }
  const api = client(async (url, options) => {
    requests.push({ url, options });
    if (options.method === 'POST') return { ok: true, headers: { get: () => location } };
    return response({ id: 'folder_123456789', mimeType: 'application/vnd.google-apps.folder', capabilities: { canAddChildren: true } });
  }, XHR);
  return { api, chunks, requests };
}

test('large files use confirmed resumable chunks with tokens only in headers', async () => {
  const file = new File([new Uint8Array(8 * 1024 * 1024 + 1)], '大素材.mp4', { type: 'video/mp4' });
  const harness = uploader({ id: 'uploaded_123456789', name: file.name, size: String(file.size), parents: ['folder_123456789'] });
  const progress = [];
  const result = await harness.api.upload(input, file, value => progress.push(value), null, session());
  assert.equal(result.id, 'uploaded_123456789');
  assert.equal(harness.chunks.length, 2);
  assert.equal(harness.chunks[0].headers['Content-Range'], `bytes 0-${8 * 1024 * 1024 - 1}/${file.size}`);
  assert.equal(harness.chunks[1].size, 1);
  assert.equal(progress.at(-1), 100);
  assert.ok(progress.slice(0, -1).every(value => value < 100));
  assert.ok(harness.chunks.every(item => item.headers.Authorization === 'Bearer test-member-token' && !item.url.includes('test-member-token')));
  const initiation = harness.requests.find(item => item.options.method === 'POST');
  assert.equal(JSON.parse(initiation.options.body).parents[0], 'folder_123456789');
  assert.equal(initiation.options.body.includes('test-member-token'), false);
});

test('uploads require complete size and correct parent, and never send credentials to an untrusted upload URL', async () => {
  const file = new File(['abc'], 'test.png');
  for (const result of [
    { id: 'uploaded_123456789', size: '2', parents: ['folder_123456789'] },
    { id: 'uploaded_123456789', size: '3', parents: ['other_123456789'] }
  ]) await assert.rejects(uploader(result).api.upload(input, file, null, null, session()), /完整文件/);
  const bad = uploader({ size: '3' }, 'https://evil.test/upload');
  await assert.rejects(bad.api.upload(input, file, null, null, session()), /不受信任/);
  assert.equal(bad.chunks.length, 0);
  await assert.rejects(bad.api.upload(input, file, null, AbortSignal.abort(), session()), /停止/);
  await assert.rejects(bad.api.upload(input, file, null, null, { ...session(), token: '' }), /登录/);
});
