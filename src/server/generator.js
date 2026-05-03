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

  return function generate() {
    const bundleBytes = fs.readFileSync(bundlePath);
    const hash = hex10(bundleBytes);
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
