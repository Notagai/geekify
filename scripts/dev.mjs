import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../', import.meta.url)));
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.json': 'application/json', '.ico': 'image/x-icon' };
const port = Number(process.env.PORT || 5173);

const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
    const wanted = pathname === '/' ? '/index.html' : pathname;
    const file = resolve(join(root, wanted.slice(1)));
    if (file !== root && !file.startsWith(root + sep)) {
      res.writeHead(403); res.end('Forbidden'); return;
    }
    if (wanted.startsWith('/.') || wanted.startsWith('/scripts/') || wanted === '/package.json') {
      res.writeHead(404); res.end('Not found'); return;
    }
    const details = await stat(file).catch(() => null);
    if (!details?.isFile()) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': (types[extname(file)] || 'application/octet-stream') + '; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(await readFile(file));
  } catch (error) {
    res.writeHead(500); res.end('Server error');
    console.error(error);
  }
});
server.listen(port, '127.0.0.1', () => console.log('geekify → http://127.0.0.1:' + port + '/'));
