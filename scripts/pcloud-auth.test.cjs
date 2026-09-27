const test = require('node:test');
const assert = require('node:assert/strict');
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

test('回调先从地址栏移除令牌，会话只存 sessionStorage，退出后清除', () => {
  const old = { location: global.location, history: global.history, sessionStorage: global.sessionStorage };
  const saved = new Map([['studio-pcloud-login-v1', JSON.stringify({ ...pending, created: Date.now() })]]);
  const sequence = [];
  global.location = { hash: '#' + fragment, pathname: '/xczstudio/auth.html' };
  global.history = { replaceState(_state, _title, url) { sequence.push('clean'); assert.equal(url, '/xczstudio/auth.html'); } };
  global.sessionStorage = { getItem: key => saved.get(key), removeItem: key => saved.delete(key), setItem(key, value) { sequence.push('store'); saved.set(key, value); } };
  try {
    auth.finish();
    assert.equal(sequence[0], 'clean');
    assert.equal(saved.has('studio-pcloud-login-v1'), false);
    assert.equal(auth.get({ clientId: 'studio-app', region: 'us' }).uid, 123);
    auth.logout();
    assert.equal(saved.size, 0);
    assert.equal(auth.get({ clientId: 'studio-app', region: 'us' }), null);
  } finally { Object.assign(global, old); }
});
