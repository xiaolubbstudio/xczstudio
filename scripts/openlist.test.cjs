const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const input = { provider: 'openlist', folderUrl: 'https://library.example.test/', folderPath: '/' };
function browser(fetch) {
  const memory = new Map();
  const scope = { URL, Date, AbortSignal, sessionStorage: { getItem: key => memory.get(key), setItem: (key, value) => memory.set(key, value), removeItem: key => memory.delete(key) }, fetch };
  scope.window = scope;
  vm.createContext(scope);
  for (const name of ['openlist-client.js', 'openlist-auth.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', name), 'utf8'), scope);
  return scope;
}
const response = (data, code = 200) => ({ ok: code === 200, status: code, json: async () => ({ code, data }) });

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

test('directory traversal keeps nested originals and does not expose unverified upload', async () => {
  const b = browser(async (url, options) => {
    if (url.endsWith('/login')) return response({ token: 'fixture' });
    if (url.endsWith('/me')) return response({ username: 'member', role: 0, permission: 8 });
    const body = JSON.parse(options.body);
    return response({ write: true, total: 1, content: body.path === '/' ? [{ name: '动画', is_dir: true }] : [{ name: '素材.mov', size: 300 * 1048576, modified: '2026-10-01', thumb: '' }] });
  });
  await b.OpenListAuth.begin(input, 'member', 'fixture');
  const data = await b.OpenListClient.list(input);
  assert.equal(data.assets.length, 1);
  assert.equal(data.assets[0].path, '/动画/素材.mov');
  assert.equal(data.assets[0].type, 'video');
  assert.equal(data.assets[0].sizeMB, 300);
  assert.equal((await b.OpenListClient.memberAccess(input, b.OpenListAuth.get(input))).canUpload, false);
  await assert.rejects(b.OpenListClient.upload());
});
