const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const auth = require('../pcloud-auth.js');
const now = 1800000000000;
const pending = { state: 'a'.repeat(64), created: now - 1000, region: 'us', clientId: 'studio-app' };
const fragment = new URLSearchParams({ state: pending.state, locationid: '1', hostname: 'api.pcloud.com', uid: '123', token_type: 'bearer', access_token: 'test-token' }).toString();

test('登录只指向 pCloud 官方授权页面，校验回调地址和随机 state', () => {
  const url = new URL(auth.authorization({ clientId: 'studio-app' }, 'https://xiaolubbstudio.github.io/xczstudio/auth.html', pending.state));
  assert.equal(url.origin, 'https://my.pcloud.com');
  assert.equal(url.searchParams.get('response_type'), 'token');
  assert.equal(url.searchParams.has('client_secret'), false);
  assert.throws(() => auth.authorization({ clientId: '' }, 'https://example.com/auth.html', pending.state));
  assert.throws(() => auth.authorization({ clientId: 'studio-app' }, 'http://example.com/auth.html', pending.state));
  assert.throws(() => auth.authorization({ clientId: 'studio-app' }, 'https://example.com/auth.html?token=x', pending.state));
  assert.throws(() => auth.authorization({ clientId: 'studio-app' }, 'https://example.com/auth.html', 'predictable'));
});

test('OAuth 回调拒绝错误 state、重放、过期、伪造主机与不同数据区', () => {
  const session = auth.callback(fragment, pending, now);
  assert.equal(session.uid, 123);
  assert.equal(session.token, 'test-token');
  assert.equal(auth.validSession(session, { clientId: 'studio-app', region: 'us' }, now), true);
  assert.throws(() => auth.callback(fragment, null, now), /验证/);
  assert.throws(() => auth.callback(fragment, { ...pending, state: 'b'.repeat(64) }, now), /验证/);
  assert.throws(() => auth.callback(fragment, pending, now + 16 * 60000), /过期/);
  assert.throws(() => auth.callback(fragment.replace('api.pcloud.com', 'evil.example'), pending, now), /地区/);
  assert.throws(() => auth.callback(fragment.replace('locationid=1', 'locationid=2').replace('hostname=api', 'hostname=eapi'), pending, now), /无法共享/);
  assert.equal(auth.validSession(session, { clientId: 'other-app', region: 'us' }, now), false);
  assert.equal(auth.validSession(session, { clientId: 'studio-app', region: 'eu' }, now), false);
  assert.equal(auth.validSession(session, { clientId: 'studio-app', region: 'us' }, now + 9 * 3600000), false);
});

test('简化回调可以缺少 uid 与 token_type，但还不能作为已验证会话使用', () => {
  const params = new URLSearchParams(fragment);
  params.delete('uid'); params.delete('token_type');
  const candidate = auth.callback(params.toString(), pending, now);
  assert.equal(candidate.uid, null);
  assert.equal(auth.validSession(candidate, { clientId: 'studio-app', region: 'us' }, now), false);
  params.set('token_type', 'Bearer');
  assert.equal(auth.callback(params.toString(), pending, now).token, 'test-token');
  params.set('token_type', 'basic');
  assert.throws(() => auth.callback(params.toString(), pending, now), /令牌类型/);
});

test('无效令牌、畸形账号 ID 和重复字段不能通过回调', () => {
  const params = new URLSearchParams(fragment);
  params.delete('access_token');
  assert.throws(() => auth.callback(params.toString(), pending, now), /登录令牌/);
  params.set('access_token', 'test token');
  assert.throws(() => auth.callback(params.toString(), pending, now), /登录令牌/);
  params.set('access_token', 'test-token'); params.set('uid', '0');
  assert.throws(() => auth.callback(params.toString(), pending, now), /账号信息/);
  params.set('uid', '123'); params.append('access_token', 'another-token');
  assert.throws(() => auth.callback(params.toString(), pending, now), /重复/);
});

test('回调先清除地址中的令牌，再核实身份，最后保存会话；退出后清除', async () => {
  const old = { location: global.location, history: global.history, sessionStorage: global.sessionStorage, fetch: global.fetch };
  const saved = new Map([['studio-pcloud-login-v1', JSON.stringify({ ...pending, created: Date.now() })]]);
  const sequence = [];
  global.location = { hash: '#' + fragment, pathname: '/xczstudio/auth.html' };
  global.history = { replaceState(_state, _title, url) { sequence.push('clean'); assert.equal(url, '/xczstudio/auth.html'); } };
  global.sessionStorage = { getItem: key => saved.get(key), removeItem: key => saved.delete(key), setItem(key, value) { sequence.push('store'); saved.set(key, value); } };
  global.fetch = async (url, options) => {
    sequence.push('verify');
    assert.equal(url, 'https://api.pcloud.com/userinfo');
    assert.equal(options.method, 'POST');
    assert.equal(options.body.get('access_token'), 'test-token');
    assert.equal(options.credentials, 'omit');
    assert.equal(options.redirect, 'error');
    assert.equal(saved.has('studio-pcloud-session-v1'), false);
    return { ok: true, json: async () => ({ result: 0, userid: 123 }) };
  };
  try {
    await auth.finish();
    assert.deepEqual(sequence, ['clean', 'verify', 'store']);
    assert.equal(saved.has('studio-pcloud-login-v1'), false);
    assert.equal(auth.get({ clientId: 'studio-app', region: 'us' }).uid, 123);
    auth.logout();
    assert.equal(saved.size, 0);
    assert.equal(auth.get({ clientId: 'studio-app', region: 'us' }), null);
  } finally { Object.assign(global, old); }
});

test('简化回调从官方接口取得账号 ID，地区决定固定接口主机', async () => {
  const old = { location: global.location, history: global.history, sessionStorage: global.sessionStorage, fetch: global.fetch };
  const params = new URLSearchParams(fragment);
  params.delete('uid'); params.delete('token_type');
  params.set('locationid', '2'); params.set('hostname', 'eapi.pcloud.com');
  const saved = new Map([['studio-pcloud-login-v1', JSON.stringify({ ...pending, region: 'eu', created: Date.now() })]]);
  global.location = { hash: '#' + params, pathname: '/xczstudio/auth.html' };
  global.history = { replaceState() {} };
  global.sessionStorage = { getItem: key => saved.get(key), removeItem: key => saved.delete(key), setItem: (key, value) => saved.set(key, value) };
  global.fetch = async (url) => {
    assert.equal(url, 'https://eapi.pcloud.com/userinfo');
    return { ok: true, json: async () => ({ result: 0, userid: 789 }) };
  };
  try {
    await auth.finish();
    assert.equal(auth.get({ clientId: 'studio-app', region: 'eu' }).uid, 789);
    assert.equal(saved.has('studio-pcloud-login-v1'), false);
  } finally { Object.assign(global, old); }
});

test('接口拒绝令牌、身份不符、无效账号、网络失败均不得留下已登录会话', async () => {
  const old = { location: global.location, history: global.history, sessionStorage: global.sessionStorage, fetch: global.fetch };
  const saved = new Map();
  global.location = { hash: '#' + fragment, pathname: '/xczstudio/auth.html' };
  global.history = { replaceState() {} };
  global.sessionStorage = { getItem: key => saved.get(key), removeItem: key => saved.delete(key), setItem: (key, value) => saved.set(key, value) };
  const cases = [
    [{ result: 2000, userid: 123 }, /有效的登录账号/],
    [{ result: 0, userid: 456 }, /身份不匹配/],
    [{ result: 0, userid: 0 }, /有效的登录账号/],
    [{ result: 0, userid: '123' }, /有效的登录账号/],
    [null, /核实登录/]
  ];
  try {
    for (const [data, message] of cases) {
      saved.set('studio-pcloud-login-v1', JSON.stringify({ ...pending, created: Date.now() }));
      saved.set('studio-pcloud-session-v1', 'old session');
      global.fetch = async () => {
        if (data === null) throw new TypeError('Network failed');
        return { ok: true, json: async () => data };
      };
      await assert.rejects(auth.finish(), message);
      assert.equal(saved.size, 0);
    }
  } finally { Object.assign(global, old); }
});

test('回调页面等待身份验证完成才返回素材库，失败时保留可读错误', async () => {
  const source = fs.readFileSync(require.resolve('../auth-callback.js'), 'utf8');
  let complete;
  const verification = new Promise(resolve => { complete = resolve; });
  const redirects = [];
  const heading = {}; const result = {};
  const context = { window: { PCloudAuth: { finish: () => verification }, location: { replace: url => redirects.push(url) } }, document: { querySelector: selector => selector === 'h1' ? heading : result } };
  const callback = vm.runInNewContext(source, context);
  assert.deepEqual(redirects, []);
  complete(); await callback;
  assert.deepEqual(redirects, ['./']);
  context.window.PCloudAuth.finish = async () => { throw new Error('账号未确认'); };
  redirects.length = 0;
  await vm.runInNewContext(source, context);
  assert.deepEqual(redirects, []);
  assert.equal(heading.textContent, '登录未完成');
  assert.equal(result.textContent, '账号未确认');
});
