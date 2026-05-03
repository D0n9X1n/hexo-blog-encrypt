'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { buildSite } = require('../helpers/buildSite.js');

// Wire-format constants pinned by the plugin contract. These values are the
// public coupling between the server (index.js) and the in-browser decryptor
// (lib/hbe.js); they MUST NOT drift. Re-stating them here (instead of importing
// from the SUT) makes any accidental change in index.js fail loudly here.
const KNOWN_PREFIX = '<hbe-prefix></hbe-prefix>';
const SECRET_NEEDLE = 'THE SECRET IS BUTTERFLY';
const DEFAULT_MESSAGE = 'Hey, password is required here.';
const DEFAULT_ABSTRACT =
  "Here's something encrypted, password is required to continue reading.";
const PBKDF2_KEY_ITERS = 1024;
const PBKDF2_KEY_BYTES = 32;
const PBKDF2_IV_ITERS = 512;
const PBKDF2_IV_BYTES = 16;
const PBKDF2_HASH = 'sha256';
const CIPHER = 'aes-256-cbc';

// All five `data-*` attributes that must appear on the rendered wrapper for
// the browser-side hbe.js to be able to derive the key and verify the HMAC.
// (See lib/hbe.default.html and lib/hbe.js dataset reads.)
const REQUIRED_DATA_ATTRS = [
  'data-wpm=',
  'data-whm=',
  'data-hmacdigest=',
  'data-keysalt=',
  'data-ivsalt=',
];

// All seven placeholder tokens the server replaces (index.js:103-109). After
// rendering, none of these substrings may remain in the output.
const PLACEHOLDER_PREFIX = '{{hbe';

// Independent re-implementation of the server's encryption, used purely to
// DECRYPT the rendered ciphertext from a Node-side test. Keeping it in this
// test file (rather than tests/helpers/) ensures it does not become a "shared
// secret" with the SUT — if the server algorithm drifts in index.js, this
// helper will fail to decrypt and surface the regression. Mirrors index.js
// lines 92-101 (encrypt) and the in-browser hbe.js verification path
// (HMAC-SHA256 over plaintext, knownPrefix sentinel check).
function decryptHbe({ password, keySaltHex, ivSaltHex, ciphertextHex, hmacDigestHex }) {
  const keySalt = Buffer.from(keySaltHex, 'hex');
  const ivSalt = Buffer.from(ivSaltHex, 'hex');
  const key = crypto.pbkdf2Sync(password, keySalt, PBKDF2_KEY_ITERS, PBKDF2_KEY_BYTES, PBKDF2_HASH);
  const iv = crypto.pbkdf2Sync(password, ivSalt, PBKDF2_IV_ITERS, PBKDF2_IV_BYTES, PBKDF2_HASH);
  const decipher = crypto.createDecipheriv(CIPHER, key, iv);
  let plaintext;
  try {
    plaintext = decipher.update(ciphertextHex, 'hex', 'utf8') + decipher.final('utf8');
  } catch (err) {
    const wrapped = new Error('decrypt failed (likely wrong password): ' + err.message);
    wrapped.cause = err;
    throw wrapped;
  }
  const hmac = crypto.createHmac(PBKDF2_HASH, key);
  hmac.update(plaintext, 'utf8');
  if (hmac.digest('hex') !== hmacDigestHex) {
    throw new Error('HMAC mismatch (wrong password or tampered ciphertext)');
  }
  if (!plaintext.startsWith(KNOWN_PREFIX)) {
    throw new Error('decrypted content missing known prefix sentinel');
  }
  return plaintext;
}

// Pull the wire-format payload out of a rendered hbe wrapper. Tolerates
// arbitrary attribute order on the <script id="hbeData"> element and any
// surrounding whitespace inside the script body.
function extractPayload(html) {
  const m = (re) => {
    const r = html.match(re);
    if (!r) {
      throw new Error('payload missing field; regex=' + re);
    }
    return r[1];
  };
  return {
    keySaltHex: m(/data-keysalt="([0-9a-f]+)"/i),
    ivSaltHex: m(/data-ivsalt="([0-9a-f]+)"/i),
    hmacDigestHex: m(/data-hmacdigest="([0-9a-f]+)"/i),
    ciphertextHex: m(/<script id="hbeData"[^>]*>([\s\S]*?)<\/script>/i).trim(),
  };
}

// Build a synthetic post-data object that the plugin's after_post_render
// filter will see exactly the same as a real Hexo post. We invoke the filter
// directly via `hexo.execFilter()` instead of materializing files on disk,
// which gives perfect cross-test isolation: zero filesystem writes under
// `tests/fixtures/`, no chance of contaminating sibling test files (T5/T6
// boot the same fixture in parallel).
//
// Every test sets `theme:'default'`, `silent:false`, `template:undefined`
// explicitly in `data` so they win over `defaultConfig` (which the plugin
// MUTATES via `Object.assign(defaultConfig, ...)` on each successful encrypt
// — a known plugin behavior we work around rather than fix).
function makeSyntheticData(overrides) {
  return Object.assign(
    {
      title: 'synthetic',
      content: '<p>before</p>\n' + SECRET_NEEDLE + '\n<p>after</p>',
      theme: 'default',
      silent: false,
      template: undefined,
    },
    overrides || {}
  );
}

let hexo;

before(async () => {
  hexo = await buildSite();
});

after(async () => {
  if (hexo) {
    await hexo.exit();
  }
});

// ---------------------------------------------------------------------------
// Criterion 3 — no password, no matching tag → bypass encryption entirely
// ---------------------------------------------------------------------------
test('criterion 3: post without password and without matching tag is left untouched', async () => {
  hexo.config.encrypt = {};
  const data = makeSyntheticData({
    title: 'plain-control',
    content: '<p>plain content with no secrets</p>',
  });
  delete data.password;

  const before = data.content;
  await hexo.execFilter('after_post_render', data, { context: hexo });

  assert.equal(data.encrypt, undefined,
    'data.encrypt must remain undefined when no password resolution applies');
  assert.equal(data.content, before,
    'data.content must be untouched (filter must early-return)');
  assert.ok(!data.content.includes('data-hmacdigest='),
    'plain post must NOT carry hbe wrapper attributes');
});

// ---------------------------------------------------------------------------
// Criterion 4 — front-matter password === "" disables encryption even when a
// matching configured tag is present (early return at index.js:38-40)
// ---------------------------------------------------------------------------
test('criterion 4: empty-string front-matter password disables encryption even with matching tag', async () => {
  hexo.config.encrypt = { tags: [{ name: 'Secret', password: 'tagpass' }] };
  const data = makeSyntheticData({
    title: 'empty-password',
    password: '',
    tags: [{ name: 'Secret' }],
    content: '<p>this should remain in the clear</p>',
  });

  const before = data.content;
  await hexo.execFilter('after_post_render', data, { context: hexo });

  assert.equal(data.encrypt, undefined,
    'empty password must short-circuit encryption (index.js:38)');
  assert.equal(data.content, before,
    'data.content must be untouched');
  assert.ok(!data.content.includes('data-hmacdigest='),
    'no hbe wrapper attributes when encryption is disabled');
});

// ---------------------------------------------------------------------------
// Criterion 5 — front-matter password "hello" → full encryption pipeline
// ---------------------------------------------------------------------------
test('criterion 5: front-matter password produces a fully-rendered hbe wrapper', async () => {
  hexo.config.encrypt = {};
  const data = makeSyntheticData({
    title: 'fm-password',
    password: 'hello',
  });

  const original = data.content;
  await hexo.execFilter('after_post_render', data, { context: hexo });

  assert.equal(data.encrypt, true, 'data.encrypt must be set to true');
  assert.ok(data.origin, 'data.origin must be truthy (set at index.js:68)');
  assert.equal(data.origin, original,
    'data.origin must equal the pre-filter content');
  assert.ok(data.origin.includes(SECRET_NEEDLE),
    'data.origin must contain the original plaintext secret');

  // Excerpt + more get the configured abstract (index.js:111).
  assert.equal(data.excerpt, data.more,
    'data.excerpt must equal data.more (both set on the same line)');
  assert.equal(data.more, DEFAULT_ABSTRACT,
    'data.more must equal config.abstract default');

  for (const attr of REQUIRED_DATA_ATTRS) {
    assert.ok(data.content.includes(attr),
      `rendered content must contain ${attr}`);
  }
  assert.ok(data.content.includes(DEFAULT_MESSAGE),
    'rendered content must contain the configured message');

  const scriptMatch = data.content.match(/<script id="hbeData"[^>]*>([\s\S]*?)<\/script>/i);
  assert.ok(scriptMatch, 'rendered content must contain a <script id="hbeData"> block');
  assert.ok(scriptMatch[1].trim().length > 0,
    'the <script id="hbeData"> block must contain a non-empty ciphertext payload');

  assert.equal(data.content.indexOf(PLACEHOLDER_PREFIX), -1,
    `no "${PLACEHOLDER_PREFIX}*" placeholder may remain in the rendered output ` +
      '(proves all 7 substitutions completed)');
});

// ---------------------------------------------------------------------------
// Criterion 6 — tag-only encryption (no front-matter password) decrypts with
// the configured tag password. This is the headline server↔browser contract:
// salts and ciphertext extracted from the wire must round-trip with the
// password the user would type in the browser.
// ---------------------------------------------------------------------------
test('criterion 6: tag-only encryption produces ciphertext decryptable with the tag password', async () => {
  hexo.config.encrypt = { tags: [{ name: 'Secret', password: 'tagpass' }] };
  const data = makeSyntheticData({
    title: 'tag-only',
    tags: [{ name: 'Secret' }],
  });
  delete data.password;

  await hexo.execFilter('after_post_render', data, { context: hexo });

  assert.equal(data.encrypt, true, 'tag-driven encryption must set data.encrypt');

  const payload = extractPayload(data.content);
  const plaintext = decryptHbe({ password: 'tagpass', ...payload });
  assert.ok(plaintext.startsWith(KNOWN_PREFIX),
    'decrypted plaintext must start with the known-prefix sentinel');
  assert.ok(plaintext.includes(SECRET_NEEDLE),
    'decrypted plaintext must contain the original secret');
});

// ---------------------------------------------------------------------------
// Criterion 7 — front-matter password takes precedence over a tag password.
// Decryption with the front-matter password succeeds; decryption with the
// tag password fails (HMAC mismatch / padding error / missing prefix).
// ---------------------------------------------------------------------------
test('criterion 7: front-matter password wins over tag password', async () => {
  hexo.config.encrypt = { tags: [{ name: 'Secret', password: 'tagpass' }] };
  const data = makeSyntheticData({
    title: 'fm-wins',
    password: 'fmpass',
    tags: [{ name: 'Secret' }],
  });

  await hexo.execFilter('after_post_render', data, { context: hexo });

  assert.equal(data.encrypt, true, 'encryption must run');

  const payload = extractPayload(data.content);

  // Front-matter password decrypts successfully.
  const ok = decryptHbe({ password: 'fmpass', ...payload });
  assert.ok(ok.includes(SECRET_NEEDLE),
    'front-matter password must decrypt successfully');

  // Tag password must FAIL — either AES padding error, HMAC mismatch, or
  // missing known-prefix sentinel. Any of these signals "wrong password".
  assert.throws(
    () => decryptHbe({ password: 'tagpass', ...payload }),
    (err) =>
      err instanceof Error &&
      /decrypt failed|HMAC mismatch|known prefix/i.test(err.message),
    'tag password must NOT decrypt when front-matter password takes precedence'
  );
});

// ---------------------------------------------------------------------------
// Criterion 9 — `silent` config gates `log.info` (line 84/86) but never
// `log.warn` (line 77, deprecated `template` property). We monkey-patch the
// hexo.log methods after boot, then trigger the filter twice with different
// silent settings. The deprecated-`template` property is set in
// hexo.config.encrypt to make log.warn fire on every encrypt path. The
// per-post `theme:'default'` keeps the encryption path itself reachable
// (avoids ENOENT from fs.readFileSync at index.js:81).
// ---------------------------------------------------------------------------
test('criterion 9: silent suppresses info logs but not warn logs', async () => {
  const originalInfo = hexo.log.info;
  const originalWarn = hexo.log.warn;
  let infoCount = 0;
  let warnCount = 0;
  hexo.log.info = () => { infoCount++; };
  hexo.log.warn = () => { warnCount++; };

  try {
    // --- Phase A: silent: true ------------------------------------------------
    hexo.config.encrypt = { template: 'deprecated-value', silent: true };
    infoCount = 0;
    warnCount = 0;
    const dataSilent = makeSyntheticData({
      title: 'silent-true',
      password: 'pw',
      silent: true,
      template: 'deprecated-value',
    });
    await hexo.execFilter('after_post_render', dataSilent, { context: hexo });
    assert.equal(dataSilent.encrypt, true,
      'sanity: encryption path actually ran in silent:true phase');
    assert.equal(infoCount, 0,
      'silent:true must produce zero log.info calls');
    assert.ok(warnCount >= 1,
      'silent:true must still produce at least one log.warn call ' +
        '(deprecated `template` property)');

    // --- Phase B: silent: false -----------------------------------------------
    hexo.config.encrypt = { template: 'deprecated-value', silent: false };
    infoCount = 0;
    warnCount = 0;
    const dataLoud = makeSyntheticData({
      title: 'silent-false',
      password: 'pw',
      silent: false,
      template: 'deprecated-value',
    });
    await hexo.execFilter('after_post_render', dataLoud, { context: hexo });
    assert.equal(dataLoud.encrypt, true,
      'sanity: encryption path actually ran in silent:false phase');
    assert.ok(infoCount >= 1,
      'silent:false must produce at least one log.info call');
    assert.ok(warnCount >= 1,
      'silent:false must produce at least one log.warn call');
  } finally {
    hexo.log.info = originalInfo;
    hexo.log.warn = originalWarn;
  }
});
