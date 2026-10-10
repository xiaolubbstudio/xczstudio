const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function fixture(reduced = false) {
  const calls = [];
  const sandbox = {
    window: {}, innerHeight: 720,
    matchMedia: () => ({ matches: reduced }), CSS: { supports: () => false },
    document: { addEventListener() {}, documentElement: { style: { setProperty() {} } } },
    getComputedStyle: () => ({ opacity: '.7', transform: 'matrix(1,0,0,1,0,-100)' }),
    setTimeout, clearTimeout,
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../motion.js'), 'utf8'), sandbox);
  const card = (id, top = 200) => ({
    dataset: { id }, top, left: 0, visible: true,
    getBoundingClientRect() { return { top: this.top, bottom: this.top + 100, left: this.left }; },
    getClientRects() { return this.visible ? [this.getBoundingClientRect()] : []; },
    querySelectorAll() { return []; },
    animate(frames, options) {
      calls.push({ id, frames, options });
      return { playState: 'running', finished: Promise.resolve(), cancel() {} };
    },
  });
  const grid = { children: [], replaceChildren(...children) { this.children = children; } };
  return { motion: sandbox.window.StudioMotion, card, grid, calls };
}
const stationary = calls => {
  assert.ok(calls.length > 0, 'content still has an appearance transition');
  for (const call of calls) for (const frame of call.frames) {
    assert.equal('transform' in frame, false, `${call.id} must appear at its final location`);
  }
};

test('initial render and directory round trip fade at final positions, even with shared asset IDs', () => {
  const { motion, card, grid, calls } = fixture();
  motion.grid(grid, [card('image', 600)], 'root');
  motion.grid(grid, [card('image', 100)], 'folder');
  motion.grid(grid, [card('image', 600)], 'root');
  stationary(calls);
});

test('same-directory refresh and offscreen cards fade without importing old positions', () => {
  const { motion, card, grid, calls } = fixture();
  motion.grid(grid, [card('visible', 100), card('offscreen', -500)], 'root');
  calls.length = 0;
  motion.grid(grid, [card('visible', 300), card('offscreen', 500)], 'root');
  stationary(calls);
});

test('folder expansion and collapse use opacity only, including interrupted transitions', async () => {
  const { motion, card, grid, calls } = fixture();
  const image = card('image'), folder = card('folder');
  folder.visible = false; grid.children = [folder, image];
  motion.reflow(grid, () => { image.top = 400; }); // previous drag motion still running
  assert.equal(calls[0].frames[0].transform, 'translate(0px,-200px)', 'dragging retains its movement animation');
  calls.length = 0;
  motion.reflow(grid, () => { folder.visible = true; image.top = 500; }, [], { stationary: true });
  stationary(calls);
  calls.length = 0;
  motion.reflow(grid, () => { folder.visible = false; image.top = 200; }, [folder], { stationary: true });
  await new Promise(resolve => setImmediate(resolve));
  stationary(calls);
  assert.equal(image.top, 200);
});

test('reduced motion applies folder layout and directory contents without animation', () => {
  const { motion, card, grid, calls } = fixture(true);
  const image = card('image');
  motion.grid(grid, [image], 'root');
  motion.reflow(grid, () => { image.top = 400; }, [], { stationary: true });
  assert.equal(image.top, 400);
  assert.equal(calls.length, 0);
});
