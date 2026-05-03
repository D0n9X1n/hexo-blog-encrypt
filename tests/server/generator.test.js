'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { buildSite } = require('../helpers/buildSite.js');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const PLUGIN_NAME = 'hexo-blog-encrypt';
// A literal substring that appears verbatim in the registered filter's source
// (see index.js:103). Used to identify our plugin's filter among any others
// registered on `after_post_render`. This is more robust than relying on the
// `knownPrefix` variable name, since the value `'{{hbeEncryptedData}}'` is
// stable plugin API contract — any future minification/refactor of `index.js`
// would still keep the placeholder text.
const FILTER_MARKER = '{{hbeEncryptedData}}';

let hexo;

before(async () => {
  hexo = await buildSite();
});

after(async () => {
  if (hexo) {
    await hexo.exit();
  }
});

function streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

test('after_post_render filter is registered at priority 1000', () => {
  const filters = hexo.extend.filter.list('after_post_render');
  assert.ok(Array.isArray(filters), 'filter.list should return an array');

  const ours = filters.filter((fn) => Function.prototype.toString.call(fn).includes(FILTER_MARKER));
  assert.equal(
    ours.length,
    1,
    `expected exactly one filter matching marker ${FILTER_MARKER}, found ${ours.length}`,
  );
  assert.equal(ours[0].priority, 1000, 'plugin filter must run at priority 1000');
});

test(`generator '${PLUGIN_NAME}' is registered and produces 2 entries with expected paths`, async () => {
  const generator = hexo.extend.generator.get(PLUGIN_NAME);
  assert.equal(typeof generator, 'function', `generator '${PLUGIN_NAME}' should be a function`);

  // The generator does not consult locals (verified against index.js:116-125),
  // so a stub object suffices. Pass hexo.locals for fidelity if available.
  // Hexo wraps registered generators with Bluebird's Promise.method, so the
  // call returns a Promise — await it to get the array of entries.
  const locals = hexo.locals || {};
  const entries = await generator(locals);

  assert.ok(Array.isArray(entries), 'generator must return an array');
  assert.equal(entries.length, 2, 'generator must emit exactly 2 entries');

  const paths = entries.map((e) => e.path).sort();
  assert.deepEqual(
    paths,
    ['css/hbe.style.css', 'lib/hbe.js'],
    'generator paths must be exactly css/hbe.style.css and lib/hbe.js',
  );
});

test('generated assets are byte-identical to source files in lib/', async () => {
  const generator = hexo.extend.generator.get(PLUGIN_NAME);
  const entries = await generator(hexo.locals || {});

  const expectations = {
    'lib/hbe.js': path.join(REPO_ROOT, 'lib', 'hbe.js'),
    'css/hbe.style.css': path.join(REPO_ROOT, 'lib', 'hbe.style.css'),
  };

  for (const entry of entries) {
    const sourcePath = expectations[entry.path];
    assert.ok(sourcePath, `unexpected generator entry path: ${entry.path}`);

    const expectedBytes = fs.readFileSync(sourcePath);
    assert.equal(typeof entry.data, 'function', `entry.data for ${entry.path} should be a function returning a stream`);

    const stream = entry.data();
    const actualBytes = await streamToBuffer(stream);

    assert.ok(
      actualBytes.equals(expectedBytes),
      `byte mismatch for ${entry.path}: generator emitted ${actualBytes.length} bytes, source is ${expectedBytes.length} bytes`,
    );
  }
});
