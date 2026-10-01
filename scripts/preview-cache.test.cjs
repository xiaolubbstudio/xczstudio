const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const { webcrypto } = require('node:crypto');
const code = fs.readFileSync(require('node:path').join(__dirname, '../preview-cache.js'), 'utf8');
function browser(entries = new Map(), fetcher) {
  const cache = {
    async match(key) { return entries.get(typeof key === 'string' ? key : key.url)?.clone(); },
    async put(key, response) { entries.set(typeof key === 'string' ? key : key.url, response.clone()); },
    async keys() { return [...entries.keys()].map(url => new Request(url)); },
    async delete(key) { return entries.delete(typeof key === 'string' ? key : key.url); }
  };
  const w = { crypto: webcrypto, location: { href: 'https://studio.test/library/' }, caches: { open: async () => cache }, fetch: fetcher };
  vm.runInNewContext(code, { window: w, TextEncoder, URL, Blob, Response });
  return { api: w.StudioPreviewCache, entries };
}
const options = { limit: 1048576, kind: 'video' };
test('persistent preview survives a new page without a resolver or network request; version and account isolate entries', async () => {
  const entries = new Map(); let calls = 0, resolutions = 0;
  const first = browser(entries, async () => { calls++; return new Response('low-quality-bytes', { headers: { 'Content-Type': 'video/mp4' } }); });
  const parts = ['backend', 'member01', 'movie', 'modified-1'];
  const result = await first.api.load(parts, async () => { resolutions++; return 'https://cdn.test/private-link?sign=temporary'; }, options);
  assert.equal(result.persistent, true);
  const nextPage = browser(entries, async () => { throw Error('must not fetch'); });
  const cached = await nextPage.api.load(parts, () => { throw Error('must not resolve'); }, options);
  assert.equal(cached.cached, true);
  assert.equal(await cached.blob.text(), 'low-quality-bytes');
  assert.equal(calls, 1); assert.equal(resolutions, 1);
  assert.notEqual(await first.api.key(parts), await first.api.key(['backend', 'member02', 'movie', 'modified-1']));
  assert.notEqual(await first.api.key(parts), await first.api.key(['backend', 'member01', 'movie', 'modified-2']));
  assert.equal([...entries.keys()].some(key => key.includes('sign=') || key.includes('member01')), false);
});
test('oversize original, HTML, partial response and incomplete downloads never enter the preview cache', async () => {
  for (const headers of [{ 'Content-Type': 'video/quicktime', 'Content-Length': '404869412' }, { 'Content-Type': 'text/html' }]) {
    const b = browser(new Map(), async () => new Response('bytes', { headers }));
    await assert.rejects(b.api.load(['reject'], () => 'https://cdn.test/source', options));
    assert.equal(b.entries.size, 0);
  }
  const b = browser(new Map(), async () => new Response(new Uint8Array(1025), { headers: { 'Content-Type': 'video/mp4' } }));
  await assert.rejects(b.api.load(['unbounded'], () => 'https://cdn.test/source', { ...options, limit: 1024 }));
  assert.equal(b.entries.size, 0);
  const partial = browser(new Map(), async () => new Response('fragment', { status: 206, headers: { 'Content-Type': 'video/mp4' } }));
  await assert.rejects(partial.api.load(['partial'], () => 'https://cdn.test/video', options));
  assert.equal(partial.entries.size, 0);
  const incomplete = browser(new Map(), async () => new Response('short', { headers: { 'Content-Type': 'video/mp4', 'Content-Length': '100' } }));
  await assert.rejects(incomplete.api.load(['incomplete'], () => 'https://cdn.test/video', options));
  assert.equal(incomplete.entries.size, 0);
});
test('closed preview aborts before resolution; unavailable browser storage still reuses this page memory', async () => {
  const aborted = new AbortController(); aborted.abort();
  const b = browser(new Map(), async () => { throw Error('unexpected fetch'); });
  await assert.rejects(b.api.load(['closed'], () => { throw Error('unexpected resolver'); }, { ...options, signal: aborted.signal }));
  const w = { crypto: webcrypto, location: { href: 'https://studio.test/' }, fetch: async () => new Response('image', { headers: { 'Content-Type': 'image/jpeg' } }) };
  vm.runInNewContext(code, { window: w, TextEncoder, URL, Blob, Response });
  const result = await w.StudioPreviewCache.load(['no-disk'], () => 'https://cdn.test/thumb', { limit: 1024, kind: 'image' });
  assert.equal(result.persistent, false);
  const next = await w.StudioPreviewCache.load(['no-disk'], () => { throw Error('must not resolve'); }, { limit: 1024, kind: 'image' });
  assert.equal(next.cached, true);
});
