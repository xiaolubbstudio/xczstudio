const test = require('node:test');
const assert = require('node:assert/strict');
const client = require('../pcloud-client.js');
const settings = { folderUrl: 'https://u.pcloud.link/publink/show?code=folderCode', uploadUrl: 'https://my.pcloud.com/#page=puplink&code=uploadCode', region: 'us' };

test('仅接受官方完整链接，并区分目录和上传用途', () => {
  assert.equal(client.config(settings).upload.code, 'uploadCode');
  assert.equal(client.parseLink('https://u.pcloud.com/#/puplink?code=uploadCode', 'upload').code, 'uploadCode');
  assert.equal(client.config({ ...settings, region: 'eu' }).base, 'https://eapi.pcloud.com');
  for (const url of ['https://pcloud.com.evil.example/?code=x', 'http://my.pcloud.com/?code=x', 'https://my.pcloud.com/?code=x&access_token=secret', 'https://user:password@my.pcloud.com/?code=x', 'https://u.pcloud.link/short']) {
    assert.throws(() => client.parseLink(url, 'folder'));
  }
  assert.throws(() => client.parseLink(settings.uploadUrl, 'folder'));
  assert.throws(() => client.parseLink('https://my.pcloud.com/#page=publink&code=x', 'upload'));
});

test('递归读取子文件夹，保留文件信息和分类；拒绝单文件分享', () => {
  const folder = { isfolder: true, contents: [{ isfolder: true, name: '表情', contents: [
    { fileid: 1, name: '<img src=x>.gif', modified: '2026-09-27', size: 1048576, thumb: true },
    { fileid: 2, name: '转场.mov', size: 300 * 1048576 },
    { fileid: 3, name: '说明.txt', size: 10 },
    { fileid: 4, name: '提示.wav', size: 100 }
  ] }] };
  const assets = client.assetsFor(folder, client.config(settings));
  assert.deepEqual(assets.map(a => a.type), ['animation', 'video', 'other', 'audio']);
  assert.equal(assets[0].name, '<img src=x>.gif');
  assert.deepEqual(assets[0].tags, ['表情']);
  assert.equal(assets[1].sizeMB, 300);
  assert.equal(new URL(assets[0].previewUrl).pathname, '/getpubthumb');
  assert.equal(assets[0].sourceUrl, settings.folderUrl);
  assert.throws(() => client.assetsFor({ isfolder: false }, client.config(settings)));
});

test('空间与流量错误明确返回，不伪造上传成功', () => {
  assert.throws(() => client.result({ result: 7007 }), /空间/);
  assert.throws(() => client.result({ result: 7005 }), /流量/);
  assert.throws(() => client.result({ result: 2008 }), /空间/);
  assert.throws(() => client.result({ message: 'OK' }), /识别/);
});

test('目录请求使用正确地区，不携带账号凭据；解析 API 返回', async () => {
  const originalFetch = global.fetch;
  global.fetch = async (url, options) => {
    assert.equal(new URL(url).origin, 'https://eapi.pcloud.com');
    assert.equal(new URL(url).searchParams.get('code'), 'folderCode');
    assert.equal(options.credentials, 'omit');
    return { ok: true, json: async () => ({ result: 0, metadata: { isfolder: true, name: '共享', contents: [] } }) };
  };
  try { assert.deepEqual(await client.list({ ...settings, region: 'eu' }), { name: '共享', assets: [] }); }
  finally { global.fetch = originalFetch; }
});

test('参数在 URL，multipart 保留中文文件名；进度不会提前成功，取消和网络失败正确处理', async () => {
  const originalXHR = global.XMLHttpRequest;
  const originalForm = global.FormData;
  let mode = 'success';
  let sent = 0;
  class FormMock { constructor() { this.entries = []; } append(...entry) { this.entries.push(entry); } }
  class XHRMock {
    constructor() { this.upload = {}; }
    open(method, url) {
      assert.equal(method, 'POST');
      const parsed = new URL(url);
      assert.equal(parsed.origin, 'https://api.pcloud.com');
      assert.equal(parsed.pathname, '/uploadtolink');
      assert.equal(parsed.searchParams.get('code'), 'uploadCode');
      assert.equal(parsed.searchParams.get('names'), '雷霆工作室');
      assert.equal(parsed.searchParams.get('filescount'), '1');
      assert.equal(parsed.searchParams.get('nopartial'), '1');
    }
    abort() { this.onabort(); }
    setRequestHeader(name, value) { assert.equal(name, 'Content-Type'); assert.equal(value, 'text/plain'); }
    send(body) {
      sent++;
      assert.equal(body.entries[0][0], 'file');
      assert.equal(body.entries[0][1].size, 300 * 1048576);
      assert.equal(body.entries[0][2], '中文素材.mov');
      if (mode === 'hold') return;
      queueMicrotask(() => {
        if (mode === 'network') { this.onerror(); return; }
        this.upload.onprogress({ lengthComputable: true, loaded: 100, total: 100 });
        this.status = 200;
        this.response = { result: mode === 'quota' ? 7007 : 0 };
        this.onload();
      });
    }
  }
  global.FormData = FormMock;
  global.XMLHttpRequest = XHRMock;
  const file = { name: '中文素材.mov', size: 300 * 1048576 };
  try {
    let progress;
    await client.upload(settings, file, p => { progress = p; });
    assert.equal(progress, 99);
    mode = 'quota'; await assert.rejects(client.upload(settings, file), /空间/);
    mode = 'network'; await assert.rejects(client.upload(settings, file), /确认是否已上传/);
    mode = 'hold'; const abort = new AbortController();
    const pending = client.upload(settings, file, null, abort.signal); abort.abort();
    await assert.rejects(pending, /取消/);
    const before = sent;
    await assert.rejects(client.upload(settings, file, null, abort.signal), /取消/);
    assert.equal(sent, before);
    assert.throws(() => client.upload(settings, { name: 'empty', size: 0 }), /空文件/);
  } finally { global.XMLHttpRequest = originalXHR; global.FormData = originalForm; }
});
