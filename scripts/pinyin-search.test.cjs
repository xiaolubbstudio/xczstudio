const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
// 浏览器里由 pinyin-data.js 挂到 window；这里挂到 globalThis 后再载入搜索模块。
globalThis.window = globalThis;
require(path.join(__dirname, '..', 'pinyin-data.js'));
const { score, pinyinScore } = require(path.join(__dirname, '..', 'pinyin-search.js'));

test('full pinyin, initials, mixed and unfinished syllables find Chinese names', () => {
  const name = '葫芦娃牙洞.mp4';
  assert.ok(score('huluwa', name) > 0, 'full pinyin prefix');
  assert.equal(pinyinScore('hlwyd', '葫芦娃牙洞'), 150, 'exact initials rank highest');
  assert.equal(pinyinScore('huluwayadong', '葫芦娃牙洞'), 145, 'exact full pinyin');
  assert.equal(pinyinScore('hlw', '葫芦娃牙洞'), 125, 'initials prefix');
  assert.equal(pinyinScore('huluw', '葫芦娃牙洞'), 130, 'unfinished last syllable');
  assert.equal(pinyinScore('hulwa', '葫芦娃牙洞'), 100, 'mixed full and initials');
  assert.equal(pinyinScore('yadong', '葫芦娃牙洞'), 90, 'pinyin from the middle of the name');
  assert.ok(score('xczst', '小橙子疏通下水道.png') > 0, 'initials of a longer name');
  assert.ok(score('xiaocz', '小橙子疏通下水道.png') > 0, 'mixed typing');
  assert.ok(score('XiaoChengZi', '小橙子疏通下水道.png') > 0, 'uppercase is fine');
});

test('retroflex shortcuts, polyphones and digits behave like the plugin', () => {
  assert.ok(pinyinScore('zhc', '转场') > 0, 'zh + c');
  assert.ok(pinyinScore('zc', '转场') > 0, 'z + c initials');
  assert.ok(pinyinScore('chongqing', '重庆') > 0 && pinyinScore('zhongqing', '重庆') > 0, 'every reading of 重 is searchable');
  assert.ok(pinyinScore('bq01', '表情 01') > 0, 'digits stay literal in initials');
  assert.ok(pinyinScore('biaoqing01', '表情 01') > 0, 'spaces are ignored');
});

test('plain text still works and unrelated queries do not match', () => {
  assert.ok(score('葫芦', '葫芦娃牙洞.mp4') >= 150, 'Chinese text prefix');
  assert.ok(score('mp4', '葫芦娃牙洞.mp4') > 0, 'extension text');
  assert.ok(score('trans', 'transition.mp4') > 0, 'English names');
  assert.equal(score('xyz', '葫芦娃牙洞.mp4'), 0);
  assert.equal(pinyinScore('hlw', 'hello world'), 0, 'names without Chinese are not abbreviated');
  assert.equal(score('', '葫芦娃牙洞.mp4'), 0);
});

test('folders add a little weight, names still win', () => {
  const inFolder = score('biaoqing', '开心.png', ['表情包']);
  const byName = score('biaoqing', '表情01.png', []);
  assert.ok(inFolder > 0, 'folder pinyin matches');
  assert.ok(byName > inFolder, 'name matches rank above folder matches');
});
