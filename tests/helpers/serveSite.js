'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript',
  '.mjs':  'application/javascript',
  '.css':  'text/css',
  '.png':  'image/png',
  '.svg':  'image/svg+xml',
  '.json': 'application/json',
  '.txt':  'text/plain; charset=utf-8',
  '.ico':  'image/x-icon',
};

/**
 * @typedef {object} ServeSiteOptions
 * @property {string} root - absolute path to the directory whose contents
 *   should be served as static files.
 */

/**
 * @typedef {object} ServeSiteHandle
 * @property {string} url - base URL of the running server, e.g.
 *   `http://127.0.0.1:54321`. Always bound to loopback.
 * @property {() => Promise<void>} close - shuts the server down. Resolves
 *   once all sockets have been released.
 */

/**
 * Start a minimal static HTTP server bound to `127.0.0.1` on an ephemeral
 * port. Intended for tests only — it has no caching, range-request, or
 * compression support.
 *
 * Security: any path containing a `..` segment (after URL decoding and
 * normalization) is rejected with 400. The resolved file path is also
 * verified to live under `root` before being served. Missing files
 * return 404.
 *
 * The returned handle is **not** serializable: callers must keep the
 * object in their own closure (e.g. Playwright's `globalSetup` should
 * stash it on `globalThis` or in a module-scoped variable to call
 * `close()` from teardown).
 *
 * @param {ServeSiteOptions} opts
 * @returns {Promise<ServeSiteHandle>}
 */
async function serveSite(opts) {
  if (!opts || !opts.root) {
    throw new Error('serveSite: { root } is required');
  }
  const root = path.resolve(opts.root);

  const server = http.createServer((req, res) => {
    handleRequest(req, res, root).catch((err) => {
      res.statusCode = 500;
      res.setHeader('content-type', 'text/plain; charset=utf-8');
      res.end(`Internal Server Error: ${err && err.message ? err.message : err}`);
    });
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', reject);
      resolve();
    });
  });

  const addr = server.address();
  const port = addr && typeof addr === 'object' ? addr.port : 0;

  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    }),
  };
}

/**
 * Resolve and serve a single request. Performs path-traversal hardening
 * before reading from disk.
 *
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 * @param {string} root - absolute path of the document root
 * @returns {Promise<void>}
 */
async function handleRequest(req, res, root) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch (_e) {
    res.statusCode = 400;
    res.end('Bad Request');
    return;
  }

  const normalized = path.posix.normalize(pathname);
  if (normalized.split('/').some((seg) => seg === '..')) {
    res.statusCode = 400;
    res.end('Bad Request');
    return;
  }

  let rel = normalized.replace(/^\/+/, '');
  if (rel === '' || normalized.endsWith('/')) {
    rel = path.posix.join(rel, 'index.html');
  }

  const filePath = path.resolve(root, rel);
  if (filePath !== root && !filePath.startsWith(root + path.sep)) {
    res.statusCode = 400;
    res.end('Bad Request');
    return;
  }

  let stat;
  try {
    stat = await fs.promises.stat(filePath);
  } catch (_e) {
    res.statusCode = 404;
    res.setHeader('content-type', 'text/plain; charset=utf-8');
    res.end('Not Found');
    return;
  }

  if (stat.isDirectory()) {
    const idx = path.join(filePath, 'index.html');
    try {
      await fs.promises.stat(idx);
    } catch (_e) {
      res.statusCode = 404;
      res.end('Not Found');
      return;
    }
    return sendFile(res, idx);
  }

  return sendFile(res, filePath);
}

/**
 * Stream a file to the response with a best-effort content-type from
 * the extension map.
 *
 * @param {http.ServerResponse} res
 * @param {string} filePath - absolute path of the file to send
 * @returns {Promise<void>}
 */
function sendFile(res, filePath) {
  return new Promise((resolve, reject) => {
    const ext = path.extname(filePath).toLowerCase();
    const type = MIME[ext] || 'application/octet-stream';
    res.statusCode = 200;
    res.setHeader('content-type', type);
    const stream = fs.createReadStream(filePath);
    stream.on('error', reject);
    stream.on('end', resolve);
    stream.pipe(res);
  });
}

module.exports = { serveSite };
