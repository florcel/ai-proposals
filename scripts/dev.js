// Servidor local: node scripts/dev.js  →  http://localhost:3000/p/demo-margarita-7Kq2
import http from 'node:http';
import handler from '../api/p.js';
import evento from '../api/evento.js';

http.createServer((req, res) => {
  const u = new URL(req.url, 'http://localhost');
  if (u.pathname === '/api/evento') return evento(req, res);
  const m = u.pathname.match(/^\/p\/([^/]+)/);
  if (!m) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end('<p>Probá <a href="/p/demo-margarita-7Kq2">/p/demo-margarita-7Kq2</a> o <a href="/p/demo-bariloche-p9Xa">/p/demo-bariloche-p9Xa</a></p>'); }
  req.query = { id: decodeURIComponent(m[1]) };
  handler(req, res);
}).listen(3000, () => console.log('http://localhost:3000/p/demo-margarita-7Kq2'));
