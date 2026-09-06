import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', process.argv.includes('--dist') ? 'dist' : '.');
const port = Number(process.env.PORT || 4173);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json; charset=utf-8', '.md': 'text/plain; charset=utf-8' };
http.createServer(async (req, res) => {
  try {
    let pathname; try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); } catch { res.writeHead(400).end('Bad request'); return; }
    if (pathname.endsWith('/')) pathname += 'index.html';
    const target = path.resolve(root, '.' + pathname);
    if (!target.startsWith(root + path.sep)) { res.writeHead(403).end('Forbidden'); return; }
    const bytes = await fs.readFile(target);
    res.writeHead(200, { 'Content-Type': types[path.extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(bytes);
  } catch (e) { res.writeHead(e.code === 'ENOENT' || e.code === 'EISDIR' ? 404 : 500).end('File unavailable'); }
}).on('error', e => { console.error(`Server failed: ${e.message}. Set PORT to use another port.`); process.exitCode = 1; }).listen(port, '0.0.0.0', () => console.log(`喵弹夜市: http://localhost:${port}\nRoot: ${root}\nUse your computer's LAN address on your phone. Stop with Ctrl+C.`));
