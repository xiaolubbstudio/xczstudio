// 仅用于本地预览，不接收素材上传，也不公开项目里的技能或文档。
// /api 转发到线上后台，成员可以用真实账号在本机先看改动；只监听本机地址。
// 后台域名在国内需要代理：启动前设置 NODE_USE_ENV_PROXY=1 和 HTTPS_PROXY=http://127.0.0.1:7897。
const http = require('node:http');
const net = require('node:net');
const tls = require('node:tls');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const port = Number(process.env.PORT || 4173);
const host = process.env.PREVIEW_HOST === 'localhost' ? 'localhost' : '127.0.0.1';
const API_ORIGIN = 'https://xczstudio-openlist-trial.eliya-activation-cloud.workers.dev';
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.mp4': 'video/mp4', '.webm': 'video/webm' };

async function proxyApi(request, response) {
  if (!['GET', 'POST'].includes(request.method)) { response.writeHead(405); response.end(); return; }
  const chunks = []; let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 1048576) { response.writeHead(413); response.end(); return; }
    chunks.push(chunk);
  }
  // 只转发接口需要的头；不带浏览器 Cookie 或来源，后台按普通请求处理。
  const headers = {};
  for (const name of ['authorization', 'content-type', 'accept']) if (request.headers[name]) headers[name] = request.headers[name];
  try {
    const upstream = await fetch(API_ORIGIN + request.url, { method: request.method, headers, body: request.method === 'POST' ? Buffer.concat(chunks) : undefined, redirect: 'manual', signal: AbortSignal.timeout(90000) });
    const out = { 'Content-Type': upstream.headers.get('content-type') || 'application/json', 'Cache-Control': 'no-store' };
    if (upstream.headers.get('retry-after')) out['Retry-After'] = upstream.headers.get('retry-after');
    response.writeHead(upstream.status, out);
    response.end(Buffer.from(await upstream.arrayBuffer()));
  } catch {
    response.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(JSON.stringify({ code: 502, message: '本机预览连不上线上后台，请检查代理。', data: null }));
  }
}

http.createServer((request, response) => {
  let relative;
  try { relative = decodeURIComponent(new URL(request.url, 'http://localhost').pathname).replace(/^\/+/, '') || 'index.html'; }
  catch { response.writeHead(400); response.end(); return; }
  if (relative.startsWith('api/')) { proxyApi(request, response).catch(() => response.destroy()); return; }
  if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405); response.end(); return; }
  // /?demo 用演示素材看页面，不连后台。
  if (relative === '__demo.js') { fs.readFile(path.join(__dirname, 'preview-demo.js'), (error, text) => { response.writeHead(error ? 404 : 200, { 'Content-Type': mime['.js'], 'Cache-Control': 'no-cache' }); response.end(error ? '' : text); }); return; }
  const allowed = ['index.html', 'auth.html', 'styles.css', 'workspace.css', 'brand.css', 'dark.css', 'rail.css', 'dock.css', 'motion.css', 'island.css', 'motion.js', 'presence.js', 'app.js', 'delight.js', 'preview-cache.js', 'pcloud-auth.js', 'auth-callback.js', 'pcloud-client.js', 'google-drive-client.js', 'google-drive-auth.js', 'openlist-client.js', 'openlist-auth.js', 'upload-drop.js', 'fluent.css', 'data/catalog.js', '.nojekyll'].includes(relative) || relative.startsWith('assets/');
  const target = path.resolve(root, relative);
  if (!allowed || !target.startsWith(root + path.sep) || relative.includes('..') || relative.includes('\\')) { response.writeHead(404); response.end('Not found'); return; }
  if (relative === 'index.html' && new URL(request.url, 'http://localhost').searchParams.has('demo')) {
    fs.readFile(path.join(root, 'index.html'), 'utf8', (error, text) => {
      if (error) { response.writeHead(404); response.end(); return; }
      response.writeHead(200, { 'Content-Type': mime['.html'], 'Cache-Control': 'no-cache' });
      response.end(text.replace('<script src="data/catalog.js', '<script src="__demo.js"></script><script src="data/catalog.js'));
    });
    return;
  }
  if (relative === 'data/catalog.js') {
    // 预览页把后台地址指向本机，接口经上面的转发到线上。
    const origin = /^(127\.0\.0\.1|localhost):\d+$/.test(request.headers.host || '') ? `http://${request.headers.host}/` : `http://${host}:${port}/`;
    fs.readFile(target, 'utf8', (error, text) => {
      if (error) { response.writeHead(404); response.end('Not found'); return; }
      response.writeHead(200, { 'Content-Type': mime['.js'], 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
      response.end(request.method === 'HEAD' ? undefined : text.replace(/folderUrl:\s*"[^"]*"/, `folderUrl: "${origin}"`));
    });
    return;
  }
  fs.stat(target, (error, stat) => {
    if (error || !stat.isFile()) { response.writeHead(404); response.end('Not found'); return; }
    const headers = { 'Content-Type': mime[path.extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff', 'Accept-Ranges': 'bytes' };
    let start = 0;
    let end = stat.size - 1;
    let status = 200;
    if (request.headers.range) {
      const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range);
      if (!range || (!range[1] && !range[2])) { response.writeHead(416, { 'Content-Range': `bytes */${stat.size}` }); response.end(); return; }
      if (!range[1]) start = Math.max(0, stat.size - Number(range[2]));
      else { start = Number(range[1]); if (range[2]) end = Math.min(Number(range[2]), end); }
      if (start > end || start >= stat.size) { response.writeHead(416, { 'Content-Range': `bytes */${stat.size}` }); response.end(); return; }
      status = 206;
      headers['Content-Range'] = `bytes ${start}-${end}/${stat.size}`;
    }
    headers['Content-Length'] = end - start + 1;
    response.writeHead(status, headers);
    if (request.method === 'HEAD') response.end();
    else fs.createReadStream(target, { start, end }).on('error', () => response.destroy()).pipe(response);
  });
}).on('upgrade', proxyPresence).listen(port, host, () => console.log(`小橙子资源库：http://${host}:${port}`));

// 成员在线的 WebSocket 也转到线上后台：有 HTTPS_PROXY 时先经代理 CONNECT，再走 TLS。
// 只转发握手需要的头（子协议里带着成员令牌），不带浏览器来源。
function proxyPresence(request, socket) {
  if (new URL(request.url, 'http://localhost').pathname !== '/api/studio_presence') { socket.destroy(); return; }
  const target = new URL(API_ORIGIN);
  const proxy = process.env.HTTPS_PROXY ? new URL(process.env.HTTPS_PROXY) : null;
  socket.on('error', () => {});
  const start = upstream => {
    upstream.on('error', () => socket.destroy());
    socket.on('close', () => upstream.destroy());
    const headers = { Host: target.hostname, Upgrade: 'websocket', Connection: 'Upgrade' };
    for (const name of ['sec-websocket-key', 'sec-websocket-version', 'sec-websocket-protocol']) if (request.headers[name]) headers[name] = request.headers[name];
    upstream.write(`GET /api/studio_presence HTTP/1.1\r\n${Object.entries(headers).map(([key, value]) => `${key}: ${value}`).join('\r\n')}\r\n\r\n`);
    upstream.pipe(socket); socket.pipe(upstream);
  };
  if (!proxy) { start(tls.connect({ host: target.hostname, port: 443, servername: target.hostname })); return; }
  const tunnel = net.connect(Number(proxy.port || 80), proxy.hostname, () => tunnel.write(`CONNECT ${target.hostname}:443 HTTP/1.1\r\nHost: ${target.hostname}:443\r\n\r\n`));
  let reply = '';
  const onData = chunk => {
    reply += chunk.toString('latin1');
    if (!reply.includes('\r\n\r\n')) return;
    tunnel.off('data', onData);
    if (!/^HTTP\/1\.[01] 200/.test(reply)) { tunnel.destroy(); socket.destroy(); return; }
    start(tls.connect({ socket: tunnel, servername: target.hostname }));
  };
  tunnel.on('data', onData);
  tunnel.on('error', () => socket.destroy());
}
