/*! 正经素材库 © 2026 小橙子工作室（XXCHENGZI）保留所有权利。未经书面许可，禁止复制、修改、传播或用于其他项目。详见 LICENSE。 */
// 五位成员各自登录。网站不维护密码表，也不在前端决定成员权限。
(function (root) {
  'use strict';
  const KEY = 'studio-openlist-session-v1';
  const AGE = 180 * 24 * 60 * 60 * 1000;
  const RENEW_WINDOW = 30 * 24 * 60 * 60 * 1000;
  const renewals = new Map();
  const config = input => root.OpenListClient.config(input);
  // Reading the signed token only saves a round trip; the backend still verifies every request.
  function tokenPayload(token) {
    try {
      const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      const payload = JSON.parse(root.atob(part));
      return payload && typeof payload === 'object' ? payload : null;
    } catch { return null; }
  }
  function tokenExpiry(token) {
    const exp = tokenPayload(token)?.exp;
    return Number.isFinite(exp) ? exp * 1000 : 0;
  }
  const expiry = session => session?.expires || tokenExpiry(session?.token || '') || session?.created + 7 * 24 * 3600000;
  function validSession(session, input, now = Date.now()) {
    try {
      return Boolean(session && session.endpoint === config(input).endpoint && session.folderPath === config(input).folderPath && typeof session.username === 'string' && session.username && typeof session.token === 'string' && session.token.length <= 8192 && session.token.length > 0 && !/[\u0000-\u0020]/.test(session.token) && Number.isFinite(session.created) && now >= session.created && now - session.created < AGE && Number.isFinite(expiry(session)) && now < expiry(session));
    } catch { return false; }
  }
  function get(input) {
    try {
      let persistent;
      try { persistent = root.localStorage?.getItem(KEY); } catch { /* Storage can be blocked by the browser. */ }
      const session = JSON.parse(persistent || root.sessionStorage.getItem(KEY) || 'null');
      if (validSession(session, input)) {
        if (![0, 2].includes(session.role)) session.role = tokenPayload(session.token)?.role;
        save(session); // Migrate an existing tab session without asking for its password.
        return session;
      }
      try { root.localStorage?.setItem(KEY, 'null'); } catch {}
      root.sessionStorage.removeItem(KEY);
    } catch { /* 无效会话不允许操作 */ }
    return null;
  }
  function save(session) {
    try { root.localStorage?.setItem(KEY, JSON.stringify(session)); } catch { /* Private browsers can fall back to this tab. */ }
    root.sessionStorage.setItem(KEY, JSON.stringify(session));
  }
  async function renewIfNeeded(input, session, signal) {
    if (session.role !== 0 || expiry(session) - Date.now() > RENEW_WINDOW) return;
    const current = get(input);
    if (!current || current.token !== session.token) return;
    let pending = renewals.get(session.token);
    if (!pending) {
      pending = root.OpenListClient.request(input, 'auth/refresh', {}, session, signal);
      renewals.set(session.token, pending);
      pending.finally(() => renewals.delete(session.token)).catch(() => {});
    }
    const data = await pending;
    const next = { ...session, token: data?.token, created: Date.now(), expires: data?.expires_at * 1000 };
    if (!Number.isFinite(next.expires) || !validSession(next, input)) throw new Error('后台没有返回有效续期会话。');
    // Do not restore a session after logout, or overwrite a newer account in another tab.
    if (get(input)?.token === session.token) { save(next); Object.assign(session, next); }
  }
  async function begin(input, username, password) {
    if (!username?.trim() || !password) throw new Error('请填写成员账号和密码。');
    const signal = root.AbortSignal.timeout(20000);
    const data = await root.OpenListClient.request(input, 'auth/login', { username: username.trim(), password }, null, signal);
    const session = { ...config(input), username: username.trim(), token: data?.token, created: Date.now(), ...(data?.expires_at ? { expires: data.expires_at * 1000 } : {}) };
    if (!validSession(session, input)) throw new Error('后台没有返回有效登录会话。');
    // 登录令牌已写明身份，直接进入；只有旧后台缺少这些信息时才多问一次。拒绝访客和身份错配。
    const payload = tokenPayload(session.token);
    if (payload?.username === session.username && [0, 2].includes(payload.role)) session.role = payload.role;
    else session.role = (await root.OpenListClient.profile(input, session, signal)).role;
    save(session);
  }
  async function logout(input) {
    const session = input ? get(input) : null;
    root.sessionStorage.removeItem(KEY);
    // Tombstone prevents a second tab's old sessionStorage from resurrecting this login.
    try { root.localStorage?.setItem(KEY, 'null'); } catch {}
    if (session) {
      try { await root.OpenListClient.request(input, 'auth/logout', undefined, session, root.AbortSignal.timeout(10000)); }
      catch { throw new Error('本机已退出；后台注销未确认，请关闭此标签页。'); }
    }
  }
  // Passwords are never stored; the user's browser retains its member session.
  const accountKey = input => 'studio-openlist-account:' + JSON.stringify(config(input));
  function remembered(input) {
    try { const value = root.localStorage.getItem(accountKey(input)); return typeof value === 'string' && value.length <= 100 ? value : ''; }
    catch { return ''; }
  }
  function remember(input, username) {
    try { if (username?.trim()) root.localStorage.setItem(accountKey(input), username.trim().slice(0,100)); else root.localStorage.removeItem(accountKey(input)); }
    catch { /* 保存用户名失败不影响登录。 */ }
  }
  const api = { validSession, get, begin, logout, remembered, remember, renewIfNeeded };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OpenListAuth = api;
})(typeof window === 'undefined' ? globalThis : window);
