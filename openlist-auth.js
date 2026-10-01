// 五位成员各自登录。网站不维护密码表，也不在前端决定成员权限。
(function (root) {
  'use strict';
  const KEY = 'studio-openlist-session-v1';
  const AGE = 8 * 60 * 60 * 1000;
  const config = input => root.OpenListClient.config(input);
  function validSession(session, input, now = Date.now()) {
    try {
      return Boolean(session && session.endpoint === config(input).endpoint && session.folderPath === config(input).folderPath && typeof session.username === 'string' && session.username && typeof session.token === 'string' && session.token.length <= 8192 && session.token.length > 0 && !/[\u0000-\u0020]/.test(session.token) && Number.isFinite(session.created) && now >= session.created && now - session.created < AGE);
    } catch { return false; }
  }
  function get(input) {
    try {
      const session = JSON.parse(root.sessionStorage.getItem(KEY) || 'null');
      if (validSession(session, input)) return session;
      root.sessionStorage.removeItem(KEY);
    } catch { /* 无效会话不允许操作 */ }
    return null;
  }
  async function begin(input, username, password, otpCode = '') {
    if (!username?.trim() || !password) throw new Error('请填写成员账号和密码。');
    const signal = root.AbortSignal.timeout(20000);
    const data = await root.OpenListClient.request(input, 'auth/login', { username: username.trim(), password, otp_code: otpCode }, null, signal);
    const session = { ...config(input), username: username.trim(), token: data?.token, created: Date.now() };
    if (!validSession(session, input)) throw new Error('后台没有返回有效登录会话。');
    // 身份核实完成后才保存会话；拒绝访客、禁用账号和身份错配。
    await root.OpenListClient.profile(input, session, signal);
    root.sessionStorage.setItem(KEY, JSON.stringify(session));
  }
  async function logout(input) {
    const session = input ? get(input) : null;
    root.sessionStorage.removeItem(KEY);
    if (session) {
      try { await root.OpenListClient.request(input, 'auth/logout', undefined, session, root.AbortSignal.timeout(10000)); }
      catch { throw new Error('本机已退出；后台注销未确认，请关闭此标签页。'); }
    }
  }
  const api = { validSession, get, begin, logout };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OpenListAuth = api;
})(typeof window === 'undefined' ? globalThis : window);
