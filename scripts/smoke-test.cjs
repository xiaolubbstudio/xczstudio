// 当前自动目录版的只读验收；不会向 pCloud 上传文件。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const cloud = require('../pcloud-client.js');
const previewUrl = process.env.PREVIEW_URL || 'http://127.0.0.1:4173';
(async () => {
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../data/catalog.js'), 'utf8'), sandbox);
  const config = sandbox.window.STUDIO_CATALOG.config;
  cloud.config(config);
  const script = await fetch(previewUrl + '/pcloud-client.js');
  assert.equal(script.status, 200);
  for (const filename of ['auth.html', 'pcloud-auth.js', 'auth-callback.js']) {
    assert.equal((await fetch(previewUrl + '/' + filename)).status, 200);
  }
  assert.equal(config.uploadUrl, undefined);
  assert.equal((await script.text()).includes('/uploadtolink'), false);
  const hidden = await fetch(previewUrl + '/skills/README.md');
  assert.equal(hidden.status, 404);
  const range = await fetch(previewUrl + '/assets/chime.wav', { headers: { Range: 'bytes=0-43' } });
  assert.equal(range.status, 206);
  assert.equal((await range.arrayBuffer()).byteLength, 44);
  const folder = await cloud.list(config, AbortSignal.timeout(20000));
  assert.ok(Array.isArray(folder.assets));
  assert.ok(Number.isSafeInteger(folder.folderId) && folder.folderId > 0);
  assert.equal(new Set(folder.assets.map(asset => asset.id)).size, folder.assets.length);
  console.log(JSON.stringify({ status: 'PASS', folder: folder.name, files: folder.assets.length, checks: ['连接配置有效', '云端目录可读取且文件 ID 唯一', '连接脚本可访问', '媒体分段请求正确', '开发技能目录未公开'] }, null, 2));
})().catch(error => { console.error(error.message); process.exitCode = 1; });
