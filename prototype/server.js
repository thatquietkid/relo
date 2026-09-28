const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const root = __dirname;
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || '0.0.0.0';
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json; charset=utf-8' };
const compressible = new Set(Object.values(mime));

http.createServer((req, res) => {
  const requestPath = req.url.split('?')[0];
  const oauthConsentPath = requestPath === '/oauth/consent' || requestPath === '//oauth/consent';
  const requested = req.url === '/' || oauthConsentPath ? '/index.html' : requestPath;
  if (requested === '/config.js') {
    const apiBaseUrl = process.env.RELO_API_URL || 'http://127.0.0.1:4100';
    res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(`window.RELO_CONFIG=${JSON.stringify({ apiBaseUrl })};`);
    return;
  }
  if (requested === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end('ok');
    return;
  }

  const file = path.resolve(root, `.${requested}`);
  const relative = path.relative(root, file);
  if (relative.startsWith('..') || path.isAbsolute(relative) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    return;
  }
  const contentType = mime[path.extname(file)] || 'application/octet-stream';
  const headers = { 'Content-Type': contentType, 'Vary': 'Accept-Encoding' };
  const shouldCompress = compressible.has(contentType) && /\bgzip\b/i.test(req.headers['accept-encoding'] || '');
  if (shouldCompress) headers['Content-Encoding'] = 'gzip';
  res.writeHead(200, headers);

  const stream = fs.createReadStream(file);
  stream.on('error', () => res.destroy());
  const output = shouldCompress ? stream.pipe(zlib.createGzip({ level: 6 })) : stream;
  output.pipe(res);
}).listen(port, host, () => console.log(`Relo prototype running at http://${host}:${port}`));
