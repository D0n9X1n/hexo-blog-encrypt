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
const REAL_BUNDLE = path.join(REPO_ROOT, 'lib', 'hbe.js');
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
  assert.deepEqual(jsBytes, fs.readFileSync(REAL_BUNDLE));
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

  fs.writeFileSync(bundlePath, 'bbb');
  const second = gen();
  const secondJs = second.find((r) => /\.js$/.test(r.path));
  const secondHash = secondJs.path.match(/lib\/hbe\.([0-9a-f]+)\.js/)[1];

  assert.notEqual(firstHash, secondHash, 'hash must change when bundle changes');
  const secondBytes = await readData(secondJs);
  assert.deepEqual(secondBytes, Buffer.from('bbb'));
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

test('throws when bundlePath option is missing', () => {
  assert.throws(() => createGenerator({ cssPath: REAL_CSS }), /bundlePath/);
});

test('throws when cssPath option is missing', () => {
  assert.throws(() => createGenerator({ bundlePath: REAL_BUNDLE }), /cssPath/);
});
