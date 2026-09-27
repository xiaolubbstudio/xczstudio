(() => {
  'use strict';
  try {
    window.PCloudAuth.finish();
    window.location.replace('./');
  } catch (error) {
    document.querySelector('h1').textContent = '登录未完成';
    document.querySelector('#auth-result').textContent = error.message;
  }
})();
