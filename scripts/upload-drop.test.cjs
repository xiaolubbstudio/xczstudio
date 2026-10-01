const test = require('node:test');
const assert = require('node:assert/strict');
const { collect, hasFiles } = require('../upload-drop.js');
const file = name => ({ name, size: 12, lastModified: 1 });
const leaf = name => ({ name, isFile: true, file: resolve => resolve(file(name)) });
const folder = (name, batches) => ({ name, isDirectory: true, createReader: () => { let i = 0; return { readEntries: resolve => resolve(batches[i++] || []) }; } });
const item = entry => ({ kind: 'file', webkitGetAsEntry: () => entry, getAsFile: () => entry.isFile ? file(entry.name) : null });

test('only file drags are intercepted; normal links and selected text remain usable', () => {
  assert.equal(hasFiles({ types: ['text/plain'], items: [{ kind: 'string' }] }), false);
  assert.equal(hasFiles({ types: ['Files'] }), true);
  assert.equal(hasFiles({ items: [{ kind: 'file' }] }), true);
  assert.equal(hasFiles({ files: [file('one.png')] }), true);
  assert.equal(hasFiles(null), false);
});

test('dragging mixed files and folders reads every directory batch and keeps duplicate names in distinct folders', async () => {
  const entry = folder('素材包', [[leaf('封面.png'), folder('子目录', [[leaf('同名.png')]])], [folder('另一目录', [[leaf('同名.png')]])]]);
  const files = await collect({ items: [item(leaf('单个.gif')), item(entry)] });
  assert.deepEqual(files.map(x => x.relativePath), ['单个.gif', '素材包/封面.png', '素材包/子目录/同名.png', '素材包/另一目录/同名.png']);
  assert.ok(files.every(x => x.file.name === x.relativePath.split('/').at(-1)));
});

test('fallback handles normal files and folder-picker paths without requiring entry APIs', async () => {
  const selected = file('file.txt'); selected.webkitRelativePath = '包/file.txt';
  assert.equal((await collect({ items: [{ kind: 'file', getAsFile: () => selected }] }))[0].relativePath, '包/file.txt');
  assert.equal((await collect({ files: [file('plain.txt')] }))[0].relativePath, 'plain.txt');
  assert.deepEqual(await collect({ items: [item(folder('空目录', [[]]))] }), []);
});

test('unsafe names, inaccessible files, cancellation and oversized selections fail without a partial queue', async () => {
  for (const name of ['..', '.', 'a/b', 'a\\b', '\u0000']) await assert.rejects(collect({ items: [item(folder(name, [[]]))] }));
  await assert.rejects(collect({ items: [{ kind: 'file', getAsFile: () => null }] }), /无法读取/);
  await assert.rejects(collect({ items: [item({ name: 'locked', isDirectory: true, createReader: () => ({ readEntries: (resolve, reject) => reject(new Error('No access')) }) })] }), /No access/);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(collect({ files: [file('one')] }, controller.signal), { name: 'AbortError' });
  await assert.rejects(collect({ files: Array.from({ length: 5001 }, (_, i) => file(String(i))) }), /5000/);
  await assert.rejects(collect({ items: Array.from({ length: 101 }, (_, i) => item(folder(String(i), [[]]))) }), /100/);
});
