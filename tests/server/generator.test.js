'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { Readable } = require('node:stream');

const { createGenerator } = require('../../src/server/generator');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const REAL_BUNDLE = path.join(REPO_ROOT, 'lib', 'hbe.bundle.js');
const REAL_CSS = path.join(REPO_ROOT, 'lib', 'hbe.style.css');

function mkTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'hbe-gen-test-'));
}

function readData(entry) {
  const data = entry.data;
  const value = typeof data === 'function' ? data() : data;
  if (value && typeof value.pipe === 'function') {
    return new Promise((resolve, reject) => {
      const chunks = [];
      value.on('data', (c) => chunks.push(c));
      value.on('end', () => resolve(Buffer.concat(chunks)));
      value.on('error', reject);
    });
  }
  if (Buffer.isBuffer(value)) return Promise.resolve(value);
  return Promise.resolve(Buffer.from(String(value)));
}

function hex10(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex').slice(0, 10);
}

test('createGenerator() returns a function (Hexo generator factory shape)', () => {
  const gen = createGenerator({ bundlePath: REAL_BUNDLE, cssPath: REAL_CSS });
  assert.equal(typeof gen, 'function');
});

test('createGenerator() emits CSS at css/hbe.style.css with correct bytes', async () => {
  const gen = createGenerator({ bundlePath: REAL_BUNDLE, cssPath: REAL_CSS });
  const routes = gen();
  const cssRoute = routes.find((r) => r.path === 'css/hbe.style.css');
  assert.ok(cssRoute, 'css route present');
  const cssBytes = await readData(cssRoute);
  assert.deepEqual(cssBytes, fs.readFileSync(REAL_CSS));
});

test('createGenerator() emits bundle JS at lib/hbe.<hex10>.js with content-hash filename', async () => {
  const gen = createGenerator({ bundlePath: REAL_BUNDLE, cssPath: REAL_CSS });
  const routes = gen();
  const expectedHash = hex10(fs.readFileSync(REAL_BUNDLE));
  const expectedPath = `lib/hbe.${expectedHash}.js`;
  const jsRoute = routes.find((r) => r.path === expectedPath);
  assert.ok(jsRoute, `js route at ${expectedPath} expected (got: ${routes.map((r) => r.path).join(', ')})`);
  const jsBytes = await readData(jsRoute);
  // No sourcemap route → the dangling sourceMappingURL comment is stripped (#262).
  const expected = fs.readFileSync(REAL_BUNDLE, 'utf8').replace(/\n?\/\/# sourceMappingURL=\S+\s*$/, '\n');
  assert.equal(jsBytes.toString('utf8'), expected);
});

test('content hash is exactly 10 lowercase hex chars', () => {
  const gen = createGenerator({ bundlePath: REAL_BUNDLE, cssPath: REAL_CSS });
  const routes = gen();
  const jsRoute = routes.find((r) => /^lib\/hbe\.[0-9a-f]+\.js$/.test(r.path));
  assert.ok(jsRoute, 'js route matches naming pattern');
  const m = jsRoute.path.match(/^lib\/hbe\.([0-9a-f]+)\.js$/);
  assert.equal(m[1].length, 10, 'hash slug is 10 chars');
  assert.match(m[1], /^[0-9a-f]{10}$/, 'hash slug is lowercase hex');
});

test('does NOT emit a sourcemap entry when sourcemapPath is not provided', () => {
  const gen = createGenerator({ bundlePath: REAL_BUNDLE, cssPath: REAL_CSS });
  const routes = gen();
  const mapRoute = routes.find((r) => /\.map$/.test(r.path));
  assert.equal(mapRoute, undefined);
  assert.equal(routes.length, 2);
});

test('does NOT emit a sourcemap entry when sourcemapPath is provided but file missing', () => {
  const tmp = mkTmp();
  const ghost = path.join(tmp, 'ghost.js.map');
  const gen = createGenerator({ bundlePath: REAL_BUNDLE, cssPath: REAL_CSS, sourcemapPath: ghost });
  const routes = gen();
  const mapRoute = routes.find((r) => /\.map$/.test(r.path));
  assert.equal(mapRoute, undefined);
  assert.equal(routes.length, 2);
});

test('emits sourcemap at lib/hbe.<hex10>.js.map (same hash as JS) when present', async () => {
  const tmp = mkTmp();
  const bundlePath = path.join(tmp, 'hbe.bundle.js');
  const sourcemapPath = path.join(tmp, 'hbe.bundle.js.map');
  fs.writeFileSync(bundlePath, '(()=>{console.log("v4")})();');
  fs.writeFileSync(sourcemapPath, JSON.stringify({ version: 3, sources: [] }));

  const gen = createGenerator({ bundlePath, cssPath: REAL_CSS, sourcemapPath });
  const routes = gen();
  const expectedHash = hex10(fs.readFileSync(bundlePath));
  const mapRoute = routes.find((r) => r.path === `lib/hbe.${expectedHash}.js.map`);
  assert.ok(mapRoute, 'sourcemap route present with hashed filename');
  const mapBytes = await readData(mapRoute);
  assert.deepEqual(mapBytes, fs.readFileSync(sourcemapPath));
  assert.equal(routes.length, 3);
});

test('lazy: bundle bytes + hash are recomputed on each generation call (file change picked up)', async () => {
  const tmp = mkTmp();
  const bundlePath = path.join(tmp, 'hbe.bundle.js');
  fs.writeFileSync(bundlePath, 'aaa');

  const gen = createGenerator({ bundlePath, cssPath: REAL_CSS });
  const first = gen();
  const firstJs = first.find((r) => /\.js$/.test(r.path));
  const firstHash = firstJs.path.match(/lib\/hbe\.([0-9a-f]+)\.js/)[1];

  // Use different SIZE so cache invalidation triggers regardless of mtime
  // resolution (some FS — older NFS, certain tmpfs configs — round mtime
  // to the second; same-second + same-size writes would falsely hit the
  // cache. Different size guarantees invalidation on any FS.)
  fs.writeFileSync(bundlePath, 'bbbbbbbbbbb');
  const second = gen();
  const secondJs = second.find((r) => /\.js$/.test(r.path));
  const secondHash = secondJs.path.match(/lib\/hbe\.([0-9a-f]+)\.js/)[1];

  assert.notEqual(firstHash, secondHash, 'hash must change when bundle changes');
  const secondBytes = await readData(secondJs);
  assert.deepEqual(secondBytes, Buffer.from('bbbbbbbbbbb'));
});

test('lazy: createGenerator() does NOT throw at construction when bundlePath is missing (deferred to first call)', () => {
  const tmp = mkTmp();
  const ghost = path.join(tmp, 'does-not-exist.js');
  const gen = createGenerator({ bundlePath: ghost, cssPath: REAL_CSS });
  assert.equal(typeof gen, 'function');
  assert.throws(() => gen(), /ENOENT|hbe.+bundle/i);
});

test('CSS data is a Readable stream (matches Hexo v3 generator contract)', () => {
  const gen = createGenerator({ bundlePath: REAL_BUNDLE, cssPath: REAL_CSS });
  const routes = gen();
  const cssRoute = routes.find((r) => r.path === 'css/hbe.style.css');
  const value = typeof cssRoute.data === 'function' ? cssRoute.data() : cssRoute.data;
  assert.ok(value instanceof Readable, 'css data is a Readable');
});

// ---------------------------------------------------------------------------
// #262 — the served bundle's sourceMappingURL must resolve to an emitted route.
// ---------------------------------------------------------------------------
function sourceMappingUrl(js) {
  const m = String(js).match(/\/\/# sourceMappingURL=(\S+)\s*$/);
  return m ? m[1] : null;
}

function resolveRoute(jsRoutePath, url) {
  return path.posix.join(path.posix.dirname(jsRoutePath), url);
}

test('#262: real build — sourceMappingURL in served JS resolves to an emitted .map route', async () => {
  const realMap = path.join(REPO_ROOT, 'lib', 'hbe.bundle.js.map');
  assert.ok(fs.existsSync(realMap), 'npm run build must emit the sourcemap');
  const gen = createGenerator({ bundlePath: REAL_BUNDLE, cssPath: REAL_CSS, sourcemapPath: realMap });
  const routes = gen();
  const jsRoute = routes.find((r) => /^lib\/hbe\.[0-9a-f]{10}\.js$/.test(r.path));
  const url = sourceMappingUrl(await readData(jsRoute));
  assert.ok(url, 'served JS keeps a sourceMappingURL when the map is emitted');
  const target = resolveRoute(jsRoute.path, url);
  assert.ok(routes.some((r) => r.path === target), `${target} must be an emitted route`);
  assert.equal(target, jsRoute.path + '.map');
});

test('#262: sourceMappingURL is rewritten to the hashed map name', async () => {
  const tmp = mkTmp();
  const bundlePath = path.join(tmp, 'hbe.bundle.js');
  const sourcemapPath = path.join(tmp, 'hbe.bundle.js.map');
  fs.writeFileSync(bundlePath, '(()=>{})();\n//# sourceMappingURL=hbe.bundle.js.map\n');
  fs.writeFileSync(sourcemapPath, '{"version":3,"sources":[]}');
  const routes = createGenerator({ bundlePath, cssPath: REAL_CSS, sourcemapPath })();
  const hash = hex10(fs.readFileSync(bundlePath));
  const js = String(await readData(routes.find((r) => r.path === `lib/hbe.${hash}.js`)));
  assert.equal(sourceMappingUrl(js), `hbe.${hash}.js.map`);
  assert.ok(js.startsWith('(()=>{})();\n'), 'code before the comment is untouched');
  assert.ok(!js.includes('hbe.bundle.js.map'));
});

test('#262: without an emitted map the sourceMappingURL comment is stripped', async () => {
  const tmp = mkTmp();
  const bundlePath = path.join(tmp, 'hbe.bundle.js');
  fs.writeFileSync(bundlePath, '(()=>{})();\n//# sourceMappingURL=hbe.bundle.js.map\n');
  for (const sourcemapPath of [undefined, path.join(tmp, 'missing.map')]) {
    const routes = createGenerator({ bundlePath, cssPath: REAL_CSS, sourcemapPath })();
    const js = String(await readData(routes.find((r) => /\.js$/.test(r.path))));
    assert.equal(sourceMappingUrl(js), null, 'no dangling sourceMappingURL');
    assert.ok(js.startsWith('(()=>{})();'));
    assert.equal(routes.length, 2);
  }
});

test('#262: bundle without a sourceMappingURL comment is served unchanged', async () => {
  const tmp = mkTmp();
  const bundlePath = path.join(tmp, 'hbe.bundle.js');
  const sourcemapPath = path.join(tmp, 'hbe.bundle.js.map');
  fs.writeFileSync(bundlePath, '(()=>{})();');
  fs.writeFileSync(sourcemapPath, '{}');
  const routes = createGenerator({ bundlePath, cssPath: REAL_CSS, sourcemapPath })();
  const js = await readData(routes.find((r) => /\.js$/.test(r.path)));
  assert.deepEqual(js, Buffer.from('(()=>{})();'));
});

test('throws when bundlePath option is missing', () => {
  assert.throws(() => createGenerator({ cssPath: REAL_CSS }), /bundlePath/);
});

test('throws when cssPath option is missing', () => {
  assert.throws(() => createGenerator({ bundlePath: REAL_BUNDLE }), /cssPath/);
});
