'use strict';

const fs = require('node:fs');
const crypto = require('node:crypto');

const HASH_BYTES = 5;

function hex10(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex').slice(0, HASH_BYTES * 2);
}

/**
 * Build the v4 Hexo generator function. Returns a function that, when
 * invoked by Hexo's generator pipeline, yields:
 *   - `css/hbe.style.css`  — the plugin stylesheet (lazy fs.createReadStream)
 *   - `lib/hbe.<hex10>.js` — the browser bundle, named with a content hash
 *                            (first 10 lowercase hex chars of SHA-256(bundle bytes))
 *   - `lib/hbe.<hex10>.js.map` — sourcemap, ONLY if `sourcemapPath` is provided
 *                                AND that file exists on disk
 *
 * Bundle bytes (and therefore the hash) are read **lazily on each generation
 * call** rather than at module load. This avoids ENOENT crashes on a fresh
 * clone before `npm run build` has run, and lets the hash track edits to the
 * bundle file across hot-reload cycles in `hexo server`.
 *
 * @param {object}  opts
 * @param {string}  opts.bundlePath      Absolute path to the browser bundle JS.
 * @param {string}  opts.cssPath         Absolute path to the plugin stylesheet.
 * @param {string} [opts.sourcemapPath]  Absolute path to the bundle sourcemap.
 *                                       Optional; if absent or file missing,
 *                                       no `.map` route is emitted.
 * @returns {() => Array<{path: string, data: Function}>}
 */
function createGenerator(opts) {
  if (!opts || typeof opts.bundlePath !== 'string' || !opts.bundlePath) {
    throw new Error('createGenerator: bundlePath is required');
  }
  if (typeof opts.cssPath !== 'string' || !opts.cssPath) {
    throw new Error('createGenerator: cssPath is required');
  }

  const bundlePath = opts.bundlePath;
  const cssPath = opts.cssPath;
  const sourcemapPath = typeof opts.sourcemapPath === 'string' && opts.sourcemapPath
    ? opts.sourcemapPath
    : null;

  // Memoization cell — populated on first call and refreshed when the
  // bundle file's mtime/size changes. See the in-function comment below
  // for why this is correct.
  let cache = null;

  return function generate() {
    // Memoize bundle bytes by mtime: in `hexo generate` (single build) the
    // file never changes, so all calls return the cached buffer + hash. In
    // `hexo server` watch mode, an `npm run build` mid-session updates the
    // mtime, invalidating the cache exactly once. This closes the
    // hash-mismatch window between the filter (which inlines the script
    // src) and the generator (which emits the bytes) — both now agree on
    // the same content hash within one mtime tick.
    const stat = fs.statSync(bundlePath);
    if (cache === null || cache.mtimeMs !== stat.mtimeMs || cache.size !== stat.size) {
      const bundleBytes = fs.readFileSync(bundlePath);
      cache = {
        mtimeMs: stat.mtimeMs,
        size: stat.size,
        bytes: bundleBytes,
        hash: hex10(bundleBytes),
      };
    }
    const { bytes: bundleBytes, hash } = cache;
    const jsRoutePath = `lib/hbe.${hash}.js`;

    const routes = [
      {
        path: 'css/hbe.style.css',
        data: () => fs.createReadStream(cssPath),
      },
      {
        path: jsRoutePath,
        data: () => bundleBytes,
      },
    ];

    if (sourcemapPath && fs.existsSync(sourcemapPath)) {
      const mapBytes = fs.readFileSync(sourcemapPath);
      routes.push({
        path: `lib/hbe.${hash}.js.map`,
        data: () => mapBytes,
      });
    }

    return routes;
  };
}

module.exports = { createGenerator };
