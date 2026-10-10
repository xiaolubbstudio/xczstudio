const { test } = require('node:test');
const assert = require('node:assert/strict');
const { compareNames } = require('../folder-preview.js');
test('文件名顺序固定为数字、大写、小写；不受输入顺序或主页排序影响', () => {
  assert.deepEqual(['z.png', 'a.png', 'Z.png', '9.png', 'A.png', '0.png'].sort(compareNames), ['0.png', '9.png', 'A.png', 'Z.png', 'a.png', 'z.png']);
  assert.deepEqual(['aA', 'AZ', 'Aa', 'A9', 'A0', 'Z', 'a'].sort(compareNames), ['A0', 'A9', 'AZ', 'Aa', 'Z', 'a', 'aA']);
  assert.deepEqual(['Aa.png', 'A0.png', 'A.png', 'AZ.png'].sort(compareNames), ['A.png', 'A0.png', 'AZ.png', 'Aa.png']);
});
test('按名称逐字升序，前缀在上，相同名称保持稳定，中文不会随机跳动', () => {
  assert.deepEqual(['9', '2', '10', '1', '0'].sort(compareNames), ['0', '1', '10', '2', '9']);
  assert.deepEqual(['图片乙.png', '图片甲.png', 'B.png', 'b.png', '8.png'].sort(compareNames), ['8.png', 'B.png', 'b.png', '图片甲.png', '图片乙.png']);
  const same = [{ name: '同名.png', id: 2 }, { name: '同名.png', id: 1 }];
  assert.deepEqual(same.sort((a, b) => compareNames(a.name, b.name)).map(a => a.id), [2, 1]);
  assert.equal(compareNames('é.png', 'e\u0301.png'), 0);
});
