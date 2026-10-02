/*! 正经素材库 © 2026 小橙子工作室（XXCHENGZI）保留所有权利。未经书面许可，禁止复制、修改、传播或用于其他项目。详见 LICENSE。 */
// pCloud 官方 OAuth 登录。令牌仅保留在当前标签页会话，不写入本地目录或仓库。
(function (root) {
  'use strict';
  const SESSION = 'studio-pcloud-session-v1';
  const PENDING = 'studio-pcloud-login-v1';
  const HOSTS = { us: 'api.pcloud.com', eu: 'eapi.pcloud.com' };
  const SESSION_AGE = 8 * 60 * 60 * 1000;

  function clientId(value) {
    if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,200}$/.test(value)) throw new Error('管理员尚未配置有效的 pCloud Client ID。');
    return value;
  }

  function authorization(input, redirectUri, state) {
    const callback = new URL(redirectUri);
    if (callback.username || callback.password || callback.search || callback.hash || !callback.pathname.endsWith('/auth.html') || (callback.protocol !== 'https:' && !(callback.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(callback.hostname)))) throw new Error('登录回调地址无效。');
    if (!/^[a-f0-9]{64}$/.test(state)) throw new Error('登录验证信息无效。');
    const url = new URL('https://my.pcloud.com/oauth2/authorize');
    url.search = new URLSearchParams({ client_id: clientId(input.clientId), response_type: 'token', redirect_uri: callback.href, state });
    return url.href;
  }

  function callback(fragment, pending, now = Date.now()) {
    const params = new URLSearchParams(fragment.replace(/^#/, ''));
    if (!pending || !Number.isFinite(pending.created) || now < pending.created || now - pending.created > 15 * 60 * 1000 || params.get('state') !== pending.state) throw new Error('登录验证失败或已过期，请回到网站重新登录。');
    if (params.has('error')) throw new Error('你没有授权登录，可以回到网站重新尝试。');
    const region = params.get('locationid') === '1' ? 'us' : params.get('locationid') === '2' ? 'eu' : null;
    if (!region || params.get('hostname') !== HOSTS[region]) throw new Error('pCloud 返回的数据地区无效。');
    if (region !== pending.region) throw new Error(`你的账号使用${region === 'eu' ? '欧洲' : '美国'}区，素材库使用${pending.region === 'eu' ? '欧洲' : '美国'}区，无法共享这个文件夹。`);
    for (const key of ['state', 'locationid', 'hostname', 'access_token', 'token_type', 'uid']) {
      if (params.getAll(key).length > 1) throw new Error('pCloud 返回了重复的登录字段，请重新登录。');
    }
    const token = params.get('access_token');
    if (!token || token.length > 4096 || /[\u0000-\u0020]/.test(token)) throw new Error('pCloud 没有返回有效的登录令牌，请从素材库重新发起登录。');
    // The official JS SDK consumes access_token and locationid. Identity is
    // verified through userinfo instead of requiring optional callback fields.
    if (params.has('token_type') && params.get('token_type').toLowerCase() !== 'bearer') throw new Error('pCloud 返回的令牌类型不受支持，请重新登录。');
    const uid = params.has('uid') ? Number(params.get('uid')) : null;
    if (params.has('uid') && (!/^[1-9]\d*$/.test(params.get('uid')) || !Number.isSafeInteger(uid))) throw new Error('pCloud 返回的账号信息无效，请重新登录。');
    return { token, uid, region, clientId: clientId(pending.clientId), created: now };
  }

  function validSession(session, input, now = Date.now()) {
    return Boolean(input?.clientId && HOSTS[input.region] && session && typeof session.token === 'string' && session.token.length > 0 && session.token.length <= 4096 && !/[\u0000-\u0020]/.test(session.token) && Number.isSafeInteger(session.uid) && session.uid > 0 && session.region === input.region && session.clientId === input.clientId && Number.isFinite(session.created) && now >= session.created && now - session.created < SESSION_AGE);
  }

  function get(input) {
    try {
      const session = JSON.parse(root.sessionStorage.getItem(SESSION) || 'null');
      if (validSession(session, input)) return session;
      root.sessionStorage.removeItem(SESSION);
    } catch { /* 不可用的会话不允许上传 */ }
    return null;
  }

  function begin(input) {
    const redirectUri = new URL('auth.html', root.location.href).href;
    const bytes = new Uint8Array(32);
    root.crypto.getRandomValues(bytes);
    const state = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
    const url = authorization(input, redirectUri, state);
    root.sessionStorage.setItem(PENDING, JSON.stringify({ state, created: Date.now(), clientId: input.clientId, region: input.region }));
    root.location.assign(url);
  }

  async function finish() {
    const fragment = root.location.hash;
    // 清除地址中的令牌，再做任何后续操作。
    root.history.replaceState(null, '', root.location.pathname);
    root.sessionStorage.removeItem(SESSION);
    const pending = JSON.parse(root.sessionStorage.getItem(PENDING) || 'null');
    root.sessionStorage.removeItem(PENDING);
    const session = callback(fragment, pending);
    const controller = new root.AbortController();
    const timeout = root.setTimeout(() => controller.abort(), 15000);
    try {
      // Never put the token in a URL. Store a session only after pCloud has
      // confirmed the identity; a callback without uid cannot skip this check.
      const response = await root.fetch(`https://${HOSTS[session.region]}/userinfo`, {
        method: 'POST', body: new URLSearchParams({ access_token: session.token }),
        signal: controller.signal, credentials: 'omit', cache: 'no-store', redirect: 'error'
      });
      if (!response.ok) throw new Error('pCloud 暂时无法核实登录，请回到素材库重试。');
      const data = await response.json();
      if (data.result !== 0 || !Number.isSafeInteger(data.userid) || data.userid <= 0) throw new Error('pCloud 未确认有效的登录账号，请重新登录。');
      if (session.uid !== null && session.uid !== data.userid) throw new Error('登录身份不匹配，请重新登录。');
      root.sessionStorage.setItem(SESSION, JSON.stringify({ ...session, uid: data.userid }));
    } catch (error) {
      if (error.name === 'AbortError' || error instanceof TypeError || error instanceof SyntaxError) throw new Error('无法连接 pCloud 核实登录，请回到素材库重试。');
      throw error;
    } finally {
      root.clearTimeout(timeout);
    }
  }

  function logout() {
    root.sessionStorage.removeItem(SESSION);
    root.sessionStorage.removeItem(PENDING);
  }

  const api = { clientId, authorization, callback, validSession, get, begin, finish, logout };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PCloudAuth = api;
})(typeof window === 'undefined' ? globalThis : window);
