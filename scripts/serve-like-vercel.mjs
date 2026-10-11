/**
 * Serve the production build (dist/) the way Vercel will, using vercel.json:
 * real files first, then the `rewrites` (SPA fallback to /index.html).
 * Used to verify that shared links survive a browser refresh / direct open
 * without deploying:
 *   npm run build && node scripts/serve-like-vercel.mjs [port]
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const dist = path.join(root, 'dist');
const cfg = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
// vercel.json sources are path-to-regexp patterns; ours is a single regex group.
export const rules = cfg.rewrites.map((r) => ({ re: new RegExp(`^${r.source}$`), dest: r.destination }));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.glb': 'model/gltf-binary', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.mjs': 'text/javascript' };

export function resolve(urlPath) {
  const file = path.join(dist, decodeURIComponent(urlPath));
  if (file.startsWith(dist) && fs.existsSync(file) && fs.statSync(file).isFile()) return file;
  for (const r of rules) if (r.re.test(urlPath)) return path.join(dist, r.dest);
  return null;
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  const port = Number(process.argv[2] ?? 4180);
  http.createServer((req, res) => {
    const p = new URL(req.url, 'http://x').pathname;
    const file = resolve(p === '/' ? '/index.html' : p);
    if (!file) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  }).listen(port, () => console.log(`serving dist like Vercel on http://localhost:${port}`));
}
