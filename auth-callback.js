/*! 正经素材库 © 2026 小橙子工作室（XXCHENGZI）保留所有权利。未经书面许可，禁止复制、修改、传播或用于其他项目。详见 LICENSE。 */
(async () => {
  'use strict';
  try {
    await window.PCloudAuth.finish();
    window.location.replace('./');
  } catch (error) {
    document.querySelector('h1').textContent = '登录未完成';
    document.querySelector('#auth-result').textContent = error.message;
  }
})();
