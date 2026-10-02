/*! 正经素材库 © 2026 小橙子工作室（XXCHENGZI）保留所有权利。未经书面许可，禁止复制、修改、传播或用于其他项目。详见 LICENSE。 */
// 成员在线：一条 WebSocket 连到后台的“在线室”，只在有人进出、换文件夹、开始或结束操作时收发消息。
// 保持连接的 ping 由后台自动应答、不唤醒在线室；断线按 1/2/5/10/30/60 秒重连，登录失效就停下。
(() => {
  'use strict';
  const PROTOCOL = 'studio-presence';
  const DELAYS = [1, 2, 5, 10, 30, 60];
  const listeners = new Set();
  const state = { t: 'state', visible: document.visibilityState !== 'hidden', folder: '', action: '', detail: '' };
  let socket = null, target = null, attempt = 0, retryTimer = 0, pingTimer = 0, sendTimer = 0, members = [];

  const emit = () => listeners.forEach(listener => { try { listener(members); } catch { /* 显示出错不影响连接 */ } });
  function schedule(slow) {
    // 连续失败 8 次就先停下，等回到页面或网络恢复再试，不在后台一直敲门。
    if (!target || retryTimer || attempt >= 8) return;
    const delay = slow ? 60 : DELAYS[Math.min(attempt, DELAYS.length - 1)];
    attempt++;
    retryTimer = setTimeout(open, delay * 1000);
  }
  function open() {
    clearTimeout(retryTimer); retryTimer = 0;
    if (!target || socket) return;
    let ws;
    // 令牌放在子协议里，不出现在网址中。
    try { ws = new WebSocket(target.url, [PROTOCOL, target.token]); } catch { schedule(); return; }
    socket = ws;
    ws.addEventListener('open', () => {
      attempt = 0; send(true);
      clearInterval(pingTimer);
      pingTimer = setInterval(() => { if (ws.readyState === 1) ws.send('ping'); }, 50000);
    });
    ws.addEventListener('message', event => {
      if (event.data === 'pong') return;
      let data;
      try { data = JSON.parse(event.data); } catch { return; }
      if (data?.t !== 'presence' || !Array.isArray(data.members)) return;
      // 操作时间换算成本机时间，过期的“操控中”由页面自己隐去，不用再问后台。
      const offset = Date.now() - Number(data.now || Date.now());
      members = data.members.filter(member => typeof member?.name === 'string').slice(0, 20).map(member => ({
        name: member.name, visible: member.visible !== false, folder: String(member.folder || ''),
        action: String(member.action || ''), detail: String(member.detail || ''), localAt: Number(member.at || 0) + offset,
      }));
      emit();
    });
    ws.addEventListener('close', event => {
      if (socket !== ws) return;
      socket = null; clearInterval(pingTimer);
      if (members.length) { members = []; emit(); }
      if (event.code === 4401) { target = null; return; } // 登录已失效：重新登录后再连。
      schedule(event.code === 4429 || event.code === 1008);
    });
  }
  function send(now) {
    clearTimeout(sendTimer);
    const go = () => { if (socket?.readyState === 1) socket.send(JSON.stringify(state)); };
    if (now) go(); else sendTimer = setTimeout(go, 400);
  }
  function connect(url, token) {
    if (target && target.url === url && target.token === token) return;
    disconnect();
    target = { url, token }; attempt = 0; open();
  }
  function disconnect() {
    target = null; clearTimeout(retryTimer); retryTimer = 0; clearInterval(pingTimer);
    const ws = socket; socket = null;
    try { ws?.close(1000, 'bye'); } catch { /* 已经断开 */ }
    if (members.length) { members = []; emit(); }
  }
  // 只有变化时才发，连续几次变化合并成一条。
  function update(patch) {
    let changed = false;
    for (const [key, value] of Object.entries(patch)) if (state[key] !== value) { state[key] = value; changed = true; }
    if (changed) send(false);
  }
  document.addEventListener('visibilitychange', () => {
    update({ visible: document.visibilityState !== 'hidden' });
    if (document.visibilityState === 'visible' && target && !socket) { attempt = 0; open(); }
  });
  addEventListener('online', () => { if (target && !socket) { attempt = 0; open(); } });

  window.StudioPresence = { connect, disconnect, update, onChange: listener => listeners.add(listener), get members() { return members; } };
})();
