// Local preview: serves public/ and runs api/game.js against an in-memory Redis stand-in (no Upstash needed).
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

import { installFakeRedis } from './fake-redis.js';
installFakeRedis('https://redis.local');
const api = await import('../api/game.js');
const root = new URL('../public/', import.meta.url).pathname;
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css' };
http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/api/game') {
    const chunks = []; for await (const c of req) chunks.push(c);
    const request = new Request(url, { method: req.method, headers: req.headers, body: req.method === 'POST' ? Buffer.concat(chunks) : undefined });
    const out = await (req.method === 'POST' ? api.POST(request) : api.GET(request));
    res.writeHead(out.status, Object.fromEntries(out.headers)); res.end(await out.text()); return;
  }
  const file = normalize(join(root, url.pathname === '/' ? 'index.html' : url.pathname));
  if (!file.startsWith(root)) { res.writeHead(403); res.end(); return; }
  try { const data = await readFile(file); res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream' }); res.end(data); }
  catch { res.writeHead(404); res.end('Not found'); }
}).listen(process.env.PORT || 4321, () => console.log('Hangtime preview on http://localhost:' + (process.env.PORT || 4321)));
