// Google Identity Services + per-file permission through the official Picker.
(function (root) {
  'use strict';
  const SESSION = 'studio-google-drive-session-v1';
  const SCOPE = 'https://www.googleapis.com/auth/drive.file';
  let preparing = null;
  let ready = false;
  let signingIn = false;

  function validSession(session, input, now = Date.now()) {
    return Boolean(session && input?.clientId && typeof session.token === 'string' && session.token.length > 0 && session.token.length <= 4096 && !/[\u0000-\u0020]/.test(session.token) && session.clientId === input.clientId && session.folderUrl === input.folderUrl && Number.isFinite(session.created) && Number.isFinite(session.expires) && now >= session.created && now < session.expires - 30000);
  }
  function get(input) {
    try {
      const session = JSON.parse(root.sessionStorage.getItem(SESSION) || 'null');
      if (validSession(session, input)) return session;
      root.sessionStorage.removeItem(SESSION);
    } catch { /* session unavailable */ }
    return null;
  }
  function logout() {
    try { root.sessionStorage.removeItem(SESSION); } catch { /* already signed out */ }
  }
  function loadScript(url, available) {
    if (available()) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const script = root.document.createElement('script');
      script.src = url;
      script.async = true;
      const timeout = root.setTimeout(() => finish(new Error('Google 登录组件连接超时，请检查网络后重试。')), 20000);
      function finish(error) {
        root.clearTimeout(timeout);
        script.onload = script.onerror = null;
        if (error) { script.remove(); reject(error); }
        else resolve();
      }
      script.onload = () => finish(available() ? null : new Error('Google 登录组件加载失败。'));
      script.onerror = () => finish(new Error('无法连接 Google 登录服务，请检查网络后重试。'));
      root.document.head.append(script);
    });
  }
  function prepare(input) {
    if (!input?.clientId) return Promise.resolve();
    if (ready) return Promise.resolve();
    if (preparing) return preparing;
    preparing = (async () => {
      await Promise.all([
        loadScript('https://accounts.google.com/gsi/client', () => Boolean(root.google?.accounts?.oauth2)),
        loadScript('https://apis.google.com/js/api.js', () => Boolean(root.gapi?.load))
      ]);
      await new Promise((resolve, reject) => {
        root.gapi.load('picker', { callback: resolve, onerror: () => reject(new Error('Google 文件夹授权组件加载失败。')), timeout: 20000, ontimeout: () => reject(new Error('Google 文件夹授权组件连接超时。')) });
      });
      ready = true;
    })().catch(error => { preparing = null; throw error; });
    return preparing;
  }
  function begin(input) {
    const settings = root.GoogleDriveClient.config(input);
    if (!settings.folder || !settings.clientId || !settings.apiKey || !settings.projectNumber) throw new Error('管理员还需配置 Google 文件夹、API Key、OAuth Client ID 和项目编号。');
    if (!ready) {
      prepare(input).catch(() => {});
      throw new Error('Google 登录组件正在加载，请稍后再次点击登录。');
    }
    if (signingIn) throw new Error('登录窗口已打开，请完成账号选择。');
    signingIn = true;
    return new Promise((resolve, reject) => {
      const fail = error => { signingIn = false; reject(error); };
      try {
        const client = root.google.accounts.oauth2.initTokenClient({
          client_id: settings.clientId, scope: SCOPE, include_granted_scopes: false,
          callback: response => {
            signingIn = false;
            if (response.error || !root.google.accounts.oauth2.hasGrantedAllScopes(response, SCOPE)) { fail(new Error('尚未授权 Google Drive 文件权限，请重新登录。')); return; }
            const now = Date.now();
            const session = { token: response.access_token, created: now, expires: now + Math.min(Number(response.expires_in), 3600) * 1000, clientId: input.clientId, folderUrl: input.folderUrl };
            if (!validSession(session, input, now)) { fail(new Error('Google 没有返回有效的登录会话。')); return; }
            try { root.sessionStorage.setItem(SESSION, JSON.stringify(session)); resolve(session); }
            catch { fail(new Error('浏览器无法保留当前标签页登录，请允许会话存储。')); }
          },
          error_callback: () => fail(new Error('登录窗口已关闭或无法打开，请重试并允许弹出窗口。'))
        });
        client.requestAccessToken({ prompt: 'select_account' });
      } catch { fail(new Error('无法打开 Google 登录窗口，请重试。')); }
    });
  }
  function selectFolder(input, folderName = '素材文件夹') {
    const settings = root.GoogleDriveClient.config(input);
    const session = get(input);
    if (!session) throw new Error('请先登录 Google 账号。');
    if (!ready) throw new Error('Google 文件夹授权组件仍在加载，请稍后重试。');
    return new Promise((resolve, reject) => {
      let picker;
      const view = new root.google.picker.DocsView(root.google.picker.ViewId.FOLDERS)
        .setIncludeFolders(true).setSelectFolderEnabled(true).setMimeTypes('application/vnd.google-apps.folder');
      picker = new root.google.picker.PickerBuilder().addView(view)
        .setOAuthToken(session.token).setDeveloperKey(settings.apiKey).setAppId(settings.projectNumber)
        .setOrigin(root.location.origin).setTitle(`请选择「${folderName}」素材文件夹`)
        .setCallback(data => {
          if (data.action === root.google.picker.Action.CANCEL) { picker.setVisible(false); reject(new Error('已取消文件夹授权。')); }
          if (data.action === root.google.picker.Action.PICKED) {
            picker.setVisible(false);
            if (data.docs?.[0]?.id !== settings.folder.id) { reject(new Error('请选择网站连接的素材文件夹，其他文件夹不能作为上传目标。')); return; }
            resolve();
          }
        }).build();
      picker.setVisible(true);
    });
  }
  const api = { validSession, get, logout, prepare, begin, selectFolder };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GoogleDriveAuth = api;
})(typeof window === 'undefined' ? globalThis : window);
