// 自动目录的只读验收；不会上传文件。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const previewUrl = process.env.PREVIEW_URL || 'http://127.0.0.1:4173';
(async () => {
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../data/catalog.js'), 'utf8'), sandbox);
  const config = sandbox.window.STUDIO_CATALOG.config;
  const cloud = config.provider === 'openlist' ? require('../openlist-client.js') : config.provider === 'google' ? require('../google-drive-client.js') : require('../pcloud-client.js');
  cloud.config(config);
  const script = await fetch(previewUrl + '/pcloud-client.js');
  assert.equal(script.status, 200);
  for (const filename of ['auth.html', 'pcloud-auth.js', 'auth-callback.js', 'google-drive-client.js', 'google-drive-auth.js', 'app.js', 'preview-cache.js', 'styles.css', 'motion.js', 'motion.css']) {
    assert.equal((await fetch(previewUrl + '/' + filename)).status, 200);
  }
  assert.equal(config.uploadUrl, undefined);
  assert.equal((await script.text()).includes('/uploadtolink'), false);
  const hidden = await fetch(previewUrl + '/skills/README.md');
  assert.equal(hidden.status, 404);
  const range = await fetch(previewUrl + '/assets/sunset.svg', { headers: { Range: 'bytes=0-43' } });
  assert.equal(range.status, 206);
  assert.equal((await range.arrayBuffer()).byteLength, 44);
  if (config.provider === 'openlist') {
    assert.equal(config.folderPath, '/');
    assert.equal((await fetch(previewUrl + '/openlist-client.js')).status, 200);
    assert.equal((await fetch(previewUrl + '/openlist-auth.js')).status, 200);
    console.log(JSON.stringify({ status: 'PASS', checks: ['云端连接配置有效', '页面与连接脚本可访问', '分段请求正确', '技能目录未公开'], note: '真实目录与上传另由登录后的云端验收验证' }));
    return;
  }
  const folder = await cloud.list(config, AbortSignal.timeout(20000));
  assert.ok(Array.isArray(folder.assets));
  if (config.provider === 'google') assert.match(folder.folderId, /^[a-zA-Z0-9_-]{10,200}$/);
  else assert.ok(Number.isSafeInteger(folder.folderId) && folder.folderId > 0);
  assert.equal(new Set(folder.assets.map(asset => asset.id)).size, folder.assets.length);
  console.log(JSON.stringify({ status: 'PASS', folder: folder.name, files: folder.assets.length, checks: ['连接配置有效', '云端目录可读取且文件 ID 唯一', '连接脚本可访问', '媒体分段请求正确', '开发技能目录未公开'] }, null, 2));
})().catch(error => { console.error(error.message); process.exitCode = 1; });
