#!/usr/bin/env node
/** server.cjs — 静态文件服务，npm start 用 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const PORT = process.env.PORT || 5173;
const ROOT = path.resolve(process.cwd());
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.wasm': 'application/wasm',
  '.bin':  'application/octet-stream',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.ico':  'image/x-icon',
};

const srv = http.createServer((req, res) => {
  let url = new URL(req.url, `http://${req.headers.host}`);
  let fp = path.join(ROOT, url.pathname === '/' ? '/index.html' : url.pathname);
  if (!fp.startsWith(ROOT)) { res.writeHead(403).end(); return; }
  fs.readFile(fp, (err, data) => {
    if (err) { res.writeHead(404).end('not found: ' + url.pathname); return; }
    const ext = path.extname(fp).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

srv.listen(PORT, () => {
  console.log(`[minimal-engine] http://localhost:${PORT}`);
});
