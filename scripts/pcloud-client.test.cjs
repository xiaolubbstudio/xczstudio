const test = require('node:test');
const assert = require('node:assert/strict');
const client = require('../pcloud-client.js');
const settings = { folderUrl: 'https://u.pcloud.link/publink/show?code=folderCode', clientId: 'studio-app', folderId: 456, region: 'us' };
const session = () => ({ token: 'test-token', uid: 123, clientId: settings.clientId, region: 'us', created: Date.now() });

test('头像只接收 pCloud 返回的官方地址，令牌不进入图片 URL；缺失头像不阻断身份验证', async () => {
  assert.equal(client.avatarUrl({ hosts: ['c1.pcloud.com'], path: '/avatar.png' }), 'https://c1.pcloud.com/avatar.png');
  for (const avatar of [null, { isdefault: true }, { hosts: ['pcloud.com.evil.example'], path: '/a' }, { hosts: ['api.pcloud.com'], path: '//evil.example/a' }, { hosts: ['api.pcloud.com'], path: '/a?access_token=secret' }, { hosts: ['api.pcloud.com'], path: '/a?auth=secret' }]) assert.equal(client.avatarUrl(avatar), '');
  const originalFetch = global.fetch;
  global.fetch = async (url, options) => {
    assert.equal(url, 'https://api.pcloud.com/userinfo');
    assert.equal(options.method, 'POST');
    assert.equal(options.body.get('access_token'), 'test-token');
    return { ok: true, json: async () => ({ result: 0, userid: 123, email: 'member@example.com' }) };
  };
  try { assert.deepEqual(await client.profile(settings, session()), { uid: 123, name: 'member@example.com', avatarUrl: '' }); }
  finally { global.fetch = originalFetch; }
});

test('仅接受官方完整链接，并区分目录和上传用途', () => {
  assert.equal(client.config(settings).clientId, 'studio-app');
  assert.equal(client.config({ ...settings, uploadUrl: 'https://my.pcloud.com/#page=puplink&code=oldCode' }).upload, undefined);
  assert.equal(client.parseLink('https://u.pcloud.com/#/puplink?code=uploadCode', 'upload').code, 'uploadCode');
  assert.equal(client.config({ ...settings, region: 'eu' }).base, 'https://eapi.pcloud.com');
  for (const url of ['https://pcloud.com.evil.example/?code=x', 'http://my.pcloud.com/?code=x', 'https://my.pcloud.com/?code=x&access_token=secret', 'https://user:password@my.pcloud.com/?code=x', 'https://u.pcloud.link/short']) {
    assert.throws(() => client.parseLink(url, 'folder'));
  }
  assert.throws(() => client.parseLink('https://my.pcloud.com/#page=puplink&code=x', 'folder'));
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
  try { assert.deepEqual(await client.list({ ...settings, region: 'eu' }), { name: '共享', folderId: undefined, assets: [] }); }
  finally { global.fetch = originalFetch; }
});

test('成员上传使用本人令牌与固定文件夹；进度、额度、取消和网络失败正确处理', async () => {
  const originalXHR = global.XMLHttpRequest;
  const originalForm = global.FormData;
  const originalFetch = global.fetch;
  let mode = 'success';
  let sent = 0;
  let notifySent;
  class FormMock { constructor() { this.entries = []; } append(...entry) { this.entries.push(entry); } }
  class XHRMock {
    constructor() { this.upload = {}; }
    open(method, url) {
      assert.equal(method, 'POST');
      const parsed = new URL(url);
      assert.equal(parsed.origin, 'https://api.pcloud.com');
      assert.equal(parsed.pathname, '/uploadfile');
      assert.equal(parsed.search, '');
    }
    abort() { this.onabort(); }
    send(body) {
      sent++;
      notifySent?.();
      assert.deepEqual(body.entries.slice(0, 4), [['access_token', 'test-token'], ['folderid', '456'], ['nopartial', '1'], ['renameifexists', '1']]);
      assert.equal(body.entries[4][0], 'file');
      assert.equal(body.entries[4][1].size, 300 * 1048576);
      assert.equal(body.entries[4][2], '中文素材.mov');
      if (mode === 'hold') return;
      queueMicrotask(() => {
        if (mode === 'network') { this.onerror(); return; }
        this.upload.onprogress({ lengthComputable: true, loaded: 100, total: 100 });
        this.status = 200;
        this.response = { result: mode === 'quota' ? 2008 : 0 };
        this.onload();
      });
    }
  }
  global.FormData = FormMock;
  global.XMLHttpRequest = XHRMock;
  global.fetch = async (url, options) => {
    assert.equal(url, 'https://api.pcloud.com/listfolder');
    assert.equal(options.method, 'POST');
    assert.equal(options.body.get('access_token'), 'test-token');
    return { ok: true, json: async () => ({ result: 0, metadata: { isfolder: true, folderid: 456, ismine: false, cancreate: true } }) };
  };
  const file = { name: '中文素材.mov', size: 300 * 1048576 };
  try {
    let progress;
    await client.upload(settings, file, p => { progress = p; }, null, session());
    assert.equal(progress, 99);
    mode = 'quota'; await assert.rejects(client.upload(settings, file, null, null, session()), /空间/);
    mode = 'network'; await assert.rejects(client.upload(settings, file, null, null, session()), /确认是否已上传/);
    mode = 'hold'; const abort = new AbortController();
    const started = new Promise(resolve => { notifySent = resolve; });
    const pending = client.upload(settings, file, null, abort.signal, session());
    await started;
    abort.abort();
    await assert.rejects(pending, /取消/);
    const before = sent;
    await assert.rejects(client.upload(settings, file, null, abort.signal, session()), /取消/);
    assert.equal(sent, before);
    await assert.rejects(client.upload(settings, { name: 'empty', size: 0 }, null, null, session()), /空文件/);
  } finally { global.XMLHttpRequest = originalXHR; global.FormData = originalForm; global.fetch = originalFetch; }
});

test('匿名、过期会话、只读成员与被撤销邀请的成员不能发送文件', async () => {
  const originalFetch = global.fetch;
  const originalXHR = global.XMLHttpRequest;
  let calls = 0;
  let response = { result: 0, metadata: { isfolder: true, folderid: 456, ismine: false, cancreate: false } };
  global.XMLHttpRequest = class { constructor() { throw new Error('不应发送上传请求'); } };
  global.fetch = async () => { calls++; return { ok: true, json: async () => response }; };
  const file = { name: 'test.wav', size: 48 };
  try {
    await assert.rejects(client.upload(settings, file), /登录/);
    await assert.rejects(client.upload(settings, file, null, null, { ...session(), created: Date.now() - 9 * 3600000 }), /登录/);
    assert.equal(calls, 0);
    await assert.rejects(client.upload(settings, file, null, null, session()), /浏览权限/);
    response = { result: 2003 };
    await assert.rejects(client.upload(settings, file, null, null, session()), /权限/);
    response = { result: 0, metadata: { isfolder: true, folderid: 999, ismine: true } };
    await assert.rejects(client.upload(settings, file, null, null, session()), /不匹配/);
  } finally { global.fetch = originalFetch; global.XMLHttpRequest = originalXHR; }
});
