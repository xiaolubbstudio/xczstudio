const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const input = { provider: 'openlist', folderUrl: 'https://library.example.test/', folderPath: '/' };
function browser(fetch) {
  const memory = new Map();
  const scope = { URL, Date, AbortSignal, Uint8Array, crypto: require("node:crypto").webcrypto, sessionStorage: { getItem: key => memory.get(key), setItem: (key, value) => memory.set(key, value), removeItem: key => memory.delete(key) }, fetch };
  scope.window = scope;
  vm.createContext(scope);
  for (const name of ['openlist-client.js', 'openlist-auth.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', name), 'utf8'), scope);
  return scope;
}
const response = (data, code = 200) => ({ ok: code === 200, status: code, json: async () => ({ code, data }) });

test('remembered username is scoped to the connection; persistent storage never receives the session', async () => {
  const b = browser(async url => response(url.endsWith('/login') ? { token: 'fixture-private-token' } : { username: 'member01', role: 0 }));
  const saved = new Map();
  b.localStorage = { getItem: key => saved.get(key), setItem: (key, value) => saved.set(key, value), removeItem: key => saved.delete(key) };
  b.OpenListAuth.remember(input, ' member01 ');
  await b.OpenListAuth.begin(input, 'member01', 'fixture-private-password');
  assert.equal(b.OpenListAuth.remembered(input), 'member01');
  assert.equal(b.OpenListAuth.remembered({ ...input, folderUrl: 'https://other.example.test/' }), '');
  assert.deepEqual([...saved.values()], ['member01']);
  b.OpenListAuth.remember(input, '');
  assert.equal(saved.size, 0);
  assert.ok(b.OpenListAuth.get(input));
});

test('five independent browser sessions stay signed in; logout revokes only that token', async () => {
  // API contract fixture, not a claim of a deployed backend concurrency test.
  const active = new Map(), requests = [];
  const api = async (url, options) => {
    const route = new URL(url).pathname;
    requests.push({ url, options });
    assert.equal(options.redirect, 'error');
    assert.equal(options.credentials, 'omit');
    if (route === '/api/auth/login') {
      const body = JSON.parse(options.body);
      if (body.password !== 'fixture-password') return response(null, 401);
      const token = 'fixture-' + body.username;
      active.set(token, body.username);
      return response({ token });
    }
    const username = active.get(options.headers.Authorization);
    if (!username) return response(null, 401);
    if (route === '/api/auth/logout') { active.delete(options.headers.Authorization); return response(null); }
    if (route === '/api/me') return response({ username, role: 0, permission: 8 });
    throw new Error('Unexpected fixture route');
  };
  const members = Array.from({ length: 5 }, () => browser(api));
  await Promise.all(members.map((b, i) => b.OpenListAuth.begin(input, 'member' + i, 'fixture-password')));
  assert.equal(active.size, 5);
  assert.equal(new Set(members.map(b => b.OpenListAuth.get(input).token)).size, 5);
  await members[0].OpenListAuth.logout(input);
  assert.equal(members[0].OpenListAuth.get(input), null);
  assert.equal(active.size, 4);
  await Promise.all(members.slice(1).map(b => b.OpenListClient.profile(input, b.OpenListAuth.get(input))));
  for (const { url } of requests) assert.equal(new URL(url).search, '');
});

test('wrong password, guest and mismatched identity cannot persist a member session', async () => {
  const failed = browser(async () => response(null, 401));
  await assert.rejects(failed.OpenListAuth.begin(input, 'member', 'wrong'));
  assert.equal(failed.OpenListAuth.get(input), null);
  for (const user of [{ username: 'member', role: 1 }, { username: 'another', role: 0 }, { username: 'member', role: 0, disabled: true }]) {
    const b = browser(async url => response(url.endsWith('/login') ? { token: 'fixture' } : user));
    await assert.rejects(b.OpenListAuth.begin(input, 'member', 'fixture'));
    assert.equal(b.OpenListAuth.get(input), null);
  }
});

test('sessions are bound to backend and directory and expire locally', () => {
  const b = browser();
  const now = Date.now(), s = { token: 'fixture', username: 'member', endpoint: 'https://library.example.test', folderPath: '/', created: now };
  assert.equal(b.OpenListAuth.validSession(s, input, now), true);
  assert.equal(b.OpenListAuth.validSession(s, { ...input, folderUrl: 'https://other.example.test/' }, now), false);
  assert.equal(b.OpenListAuth.validSession(s, { ...input, folderPath: '/other' }, now), false);
  assert.equal(b.OpenListAuth.validSession(s, input, now + 8 * 3600000), false);
  assert.equal(b.OpenListAuth.validSession({ ...s, token: 'fixture\nInjected' }, input, now), false);
});

test('signed original links support media and reject credential leaks and directory escapes', async () => {
  const b = browser(async url => response(url.endsWith('/login') ? { token: 'fixture' } : url.endsWith('/me') ? { username: 'member', role: 0 } : { raw_url: 'https://cdn.example.test/original.mov?sign=download-signature' }));
  await b.OpenListAuth.begin(input, 'member', 'fixture');
  const settings = { ...input, folderPath: '/assets' };
  assert.equal(await b.OpenListClient.resolve(settings, { path: '/assets/original.mov' }), 'https://cdn.example.test/original.mov?sign=download-signature');
  await assert.rejects(b.OpenListClient.resolve(settings, { path: '/assets-else/original.mov' }));
  await assert.rejects(b.OpenListClient.resolve(settings, { path: '/assets/../private/file' }));
  for (const value of ['http://cdn.example.test/file', 'javascript:alert(1)', 'https://cdn.example.test/file?token=secret', 'https://user:secret@cdn.example.test/file']) assert.throws(() => b.OpenListClient.mediaUrl(value, input));
  for (const folderUrl of ['http://library.example.test/', input.folderUrl + '?token=secret', input.folderUrl + '#secret', 'https://user:secret@library.example.test/', input.folderUrl + 'api']) assert.throws(() => b.OpenListClient.config({ ...input, folderUrl }));
});

test('one catalog request returns virtual folders, stable IDs and server management permission', async () => {
  let directoryRequests = 0;
  const b = browser(async (url, options) => {
    if (url.endsWith('/login')) return response({ token: 'fixture' });
    if (url.endsWith('/me')) return response({ username: 'member', role: 0, permission: 8 });
    directoryRequests++;
    const body = JSON.parse(options.body);
    if (url.includes('studio_catalog')) { assert.equal(body.path, '/'); return response({ canManage: true, folders: ['动画'], assets: [{ id: 'ol-/original.mov', folder: '动画', name: '素材.mov', size: 300 * 1048576, modified: '2026-10-01', thumb: '', revision: 2, deleted: 0 }] }); }
    return response({ write: true, total: 0, content: [] });
  });
  await b.OpenListAuth.begin(input, 'member', 'fixture');
  const data = await b.OpenListClient.list(input);
  assert.equal(data.assets.length, 1);
  assert.equal(data.assets[0].id, 'ol-/original.mov');
  assert.equal(data.assets[0].managed, true);
  assert.deepEqual(Array.from(data.assets[0].tags), ['动画']);
  assert.equal(data.assets[0].type, 'video');
  assert.equal(data.assets[0].sizeMB, 300);
  assert.equal(directoryRequests, 1); // 由后台一次汇总，不逐个子目录请求 Worker。
  assert.equal(data.access.canManage, true);
  assert.equal(data.access.hasWritePermission, true);
  assert.equal(data.access.canUpload, true);
  assert.equal(data.access.uploadPending, undefined);
  assert.equal((await b.OpenListClient.memberAccess(input, b.OpenListAuth.get(input))).canUpload, true);
  await assert.rejects(b.OpenListClient.upload(input));
});


test('chunked upload binds authorization and verifies completion before reporting 100 percent', async () => {
  const calls = [], progress = [], file = new Blob([new Uint8Array(8 * 1048576 + 9)]);
  file.name = 'sample.mov';
  const b = browser(async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/login')) return response({ token: 'fixture' });
    if (url.endsWith('/me')) return response({ username: 'member', role: 0, permission: 8 });
    if (url.startsWith('https://library.example.test/')) assert.equal(options.headers.Authorization, 'fixture');
    if (url.endsWith('/start')) {
      const body = JSON.parse(options.body);
      assert.equal(body.path, '/'); assert.equal(body.size, file.size);
      assert.match(body.sha256, /^[a-f0-9]{64}$/);
      return response({ ticket: 'opaque-ticket', chunkSize: 8 * 1048576, ready: false });
    }
    if (url.endsWith('/part_link')) {
      const body = JSON.parse(options.body); assert.equal(body.ticket, 'opaque-ticket');
      return response({ url: 'https://upload.cmecloud.cn/file?part=' + body.part });
    }
    if (url.startsWith('https://upload.cmecloud.cn/')) {
      assert.equal(options.method, 'PUT'); assert.equal(options.headers.Authorization, undefined);
      assert.equal(options.body.size, url.endsWith('part=1') ? 8 * 1048576 : 9);
      return response(null);
    }
    assert.equal(progress.includes(100), false);
    return response({ name: file.name, size: file.size });
  });
  await b.OpenListAuth.begin(input, 'member', 'fixture');
  await b.OpenListClient.upload(input, file, value => progress.push(value));
  assert.equal(calls.filter(c => c.url.startsWith('https://upload.cmecloud.cn/')).length, 2);
  assert.equal(progress.at(-1), 100);
  await assert.rejects(b.OpenListClient.upload({ ...input, folderUrl: 'https://other.example.test/' }, file));
});

test('failed cloud upload cannot report success or persist an upload ticket', async () => {
  const b = browser(async url => response(url.endsWith('/login') ? { token: 'fixture' } : url.endsWith('/me') ? { username: 'member', role: 0 } : url.endsWith('/start') ? { ticket: 'opaque-ticket', chunkSize: 8 * 1048576 } : url.endsWith('/part_link') ? { url: 'https://upload.cmecloud.cn/file' } : null, url.startsWith('https://upload.cmecloud.cn/') ? 403 : 200));
  await b.OpenListAuth.begin(input, 'member', 'fixture');
  const file = new Blob(['test']); file.name = 'test.txt'; const progress = [];
  await assert.rejects(b.OpenListClient.upload(input, file, value => progress.push(value)));
  assert.equal(progress.includes(100), false);
  assert.equal(b.sessionStorage.getItem('opaque-ticket'), undefined);
});

test('folder upload stores originals at root and preserves nested organization as server metadata', async () => {
  const directories = new Map([['/', [{ name: '已有', is_dir: true }]], ['/已有', []]]);
  const created = [], started = [], listed = [];
  let current;
  const b = browser(async (url, options) => {
    if (url.endsWith('/login')) return response({ token: 'fixture' });
    if (url.endsWith('/me')) return response({ username: 'member', role: 0 });
    assert.equal(options.headers.Authorization, 'fixture');
    const body = JSON.parse(options.body);
    if (url.endsWith('/list')) {
      listed.push(body.path);
      assert.ok(directories.has(body.path));
      return response({ total: directories.get(body.path).length, content: directories.get(body.path).map(item => ({ ...item })) });
    }
    if (url.endsWith('/mkdir')) {
      assert.equal(directories.has(body.path), false);
      const parent = body.path.slice(0, body.path.lastIndexOf('/')) || '/';
      assert.ok(directories.has(parent), 'parent exists before creating child');
      directories.get(parent).push({ name: body.path.split('/').at(-1), is_dir: true });
      directories.set(body.path, []); created.push(body.path); return response(null);
    }
    if (url.endsWith('/start')) { current = body; assert.equal(body.path, '/'); started.push(body.virtual_folder + '/' + body.name); return response({ ticket: 'fixture-ticket', chunkSize: 8 * 1048576, ready: true }); }
    assert.ok(url.endsWith('/finish'));
    return response({ name: current.name, size: current.size });
  });
  await b.OpenListAuth.begin(input, 'member', 'fixture');
  const cache = new Map();
  for (const relative of ['包/子目录/同名.txt', '包/另一个/同名.txt', '包/子目录/第二份.txt', '已有/素材.txt']) {
    const file = new Blob(['original']); file.name = relative.split('/').at(-1); file.webkitRelativePath = relative;
    await b.OpenListClient.upload(input, file, undefined, undefined, b.OpenListAuth.get(input), relative, cache);
  }
  assert.deepEqual(created, []);
  assert.deepEqual(started, ['包/子目录/同名.txt', '包/另一个/同名.txt', '包/子目录/第二份.txt', '已有/素材.txt']);
  assert.deepEqual(listed, []);
});

test('virtual folder upload rejects unsafe paths and failed server authorization', async () => {
  const file = new Blob(['original']); file.name = '素材.txt';
  const b = browser(async url => response(url.endsWith('/login') ? { token: 'fixture' } : { username: 'member', role: 0 }));
  await b.OpenListAuth.begin(input, 'member', 'fixture');
  for (const relative of ['/素材.txt', '../素材.txt', '包//素材.txt', '包/../素材.txt', '包\\素材.txt', '包/不同.txt', '包/\u0000/素材.txt']) {
    await assert.rejects(b.OpenListClient.upload(input, file, undefined, undefined, b.OpenListAuth.get(input), relative), /上传目录路径无效/);
  }
  for (const collision of [true, false]) {
    const requests = [];
    const scope = browser(async (url, options) => {
      if (url.endsWith('/login')) return response({ token: 'fixture' });
      if (url.endsWith('/me')) return response({ username: 'member', role: 0 });
      requests.push(url);
      assert.ok(url.endsWith('/start')); return response(null, 403);
    });
    await scope.OpenListAuth.begin(input, 'member', 'fixture');
    await assert.rejects(scope.OpenListClient.upload(input, file, undefined, undefined, scope.OpenListAuth.get(input), '包/素材.txt'));
    assert.equal(requests.some(url => url.endsWith('/finish')), false);
  }
});
