'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const { buildSite } = require('../helpers/buildSite.js');

// v4 wire-format constants pinned by the plugin contract. Re-stated here
// (instead of imported) so any drift in src/server/* fails loudly.
const SECRET_NEEDLE = 'THE SECRET IS BUTTERFLY';
const DEFAULT_MESSAGE = 'Hey, password is required here.';
const DEFAULT_ABSTRACT =
  "Here's something encrypted, password is required to continue reading.";
const PBKDF2_ITERS = 250000;
const KEY_BYTES = 32;
const SALT_HEX = 64;       // 32 bytes
const NONCE_HEX = 24;      // 12 bytes
const HASH = 'sha256';
const CIPHER_NAME = 'aes-256-gcm';
const TAG_BYTES = 16;
const FORMAT_VERSION = '4';

const REQUIRED_DATA_ATTRS = [
  'data-hbe-format=',
  'data-wpm=',
  'data-whm=',
  'data-salt=',
  'data-nonce=',
  'data-kdf-iterations=',
  'data-auto-save=',
];

const PLACEHOLDER_PREFIX = '{{hbe';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const BUNDLE_PATH = path.join(REPO_ROOT, 'lib', 'hbe.bundle.js');

// Independent v4 GCM round-trip: catches algorithm drift in src/server/crypto.js
// without sharing code with the SUT.
function decryptHbeV4({ password, saltHex, nonceHex, ciphertextHex, iterations }) {
  const iter = iterations || PBKDF2_ITERS;
  const salt = Buffer.from(saltHex, 'hex');
  const nonce = Buffer.from(nonceHex, 'hex');
  const blob = Buffer.from(ciphertextHex, 'hex');
  if (blob.length < TAG_BYTES) throw new Error('ciphertext shorter than auth tag');
  const tag = blob.subarray(blob.length - TAG_BYTES);
  const ct = blob.subarray(0, blob.length - TAG_BYTES);
  const key = crypto.pbkdf2Sync(password, salt, iter, KEY_BYTES, HASH);
  const decipher = crypto.createDecipheriv(CIPHER_NAME, key, nonce);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}

function extractPayload(html) {
  const m = (re) => {
    const r = html.match(re);
    if (!r) throw new Error('payload missing field; regex=' + re);
    return r[1];
  };
  return {
    saltHex: m(/data-salt="([0-9a-f]+)"/i),
    nonceHex: m(/data-nonce="([0-9a-f]+)"/i),
    ciphertextHex: m(/<script id="hbeData"[^>]*>([\s\S]*?)<\/script>/i).trim(),
    formatVersion: m(/data-hbe-format="([^"]*)"/i),
    kdfIterations: m(/data-kdf-iterations="([^"]*)"/i),
    autoSave: m(/data-auto-save="([^"]*)"/i),
    wpm: m(/data-wpm="([^"]*)"/i),
    whm: m(/data-whm="([^"]*)"/i),
  };
}

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
// Criterion 3 — bypass when no password and no matching tag
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

  assert.equal(data.encrypt, undefined);
  assert.equal(data.content, before);
  assert.ok(!data.content.includes('data-salt='));
});

// ---------------------------------------------------------------------------
// Criterion 4 — empty FM password disables even with matching tag
// ---------------------------------------------------------------------------
test('criterion 4: empty-string front-matter password disables encryption even with matching tag', async () => {
  hexo.config.encrypt = { tags: [{ name: 'Secret', password: 'tagpass' }] };
  const data = makeSyntheticData({
    title: 'empty-password',
    password: '',
    tags: [{ name: 'Secret' }],
  });

  const before = data.content;
  await hexo.execFilter('after_post_render', data, { context: hexo });

  assert.equal(data.encrypt, undefined);
  assert.equal(data.content, before);
});

// ---------------------------------------------------------------------------
// Criterion 5 — full pipeline emits all v4 wire-format pieces
// ---------------------------------------------------------------------------
test('criterion 5: front-matter password produces a fully-rendered v4 hbe wrapper', async () => {
  hexo.config.encrypt = {};
  const data = makeSyntheticData({
    title: 'fm-password',
    password: 'hello',
  });

  const original = data.content;
  await hexo.execFilter('after_post_render', data, { context: hexo });

  assert.equal(data.encrypt, true);
  assert.equal(data.origin, original);
  assert.ok(data.origin.includes(SECRET_NEEDLE));
  assert.equal(data.excerpt, data.more);
  assert.equal(data.more, DEFAULT_ABSTRACT);

  for (const attr of REQUIRED_DATA_ATTRS) {
    assert.ok(data.content.includes(attr),
      `rendered content must contain ${attr}`);
  }
  assert.ok(data.content.includes(DEFAULT_MESSAGE));

  const scriptMatch = data.content.match(/<script id="hbeData"[^>]*>([\s\S]*?)<\/script>/i);
  assert.ok(scriptMatch);
  assert.ok(scriptMatch[1].trim().length > 0);

  assert.equal(data.content.indexOf(PLACEHOLDER_PREFIX), -1,
    `no "${PLACEHOLDER_PREFIX}*" placeholder may remain`);
});

// ---------------------------------------------------------------------------
// Criterion 6 — tag-only encryption decrypts with the configured tag password
// ---------------------------------------------------------------------------
test('criterion 6: tag-only encryption produces ciphertext decryptable with the tag password', async () => {
  hexo.config.encrypt = { tags: [{ name: 'Secret', password: 'tagpass' }] };
  const data = makeSyntheticData({
    title: 'tag-only',
    tags: [{ name: 'Secret' }],
  });
  delete data.password;

  await hexo.execFilter('after_post_render', data, { context: hexo });
  assert.equal(data.encrypt, true);

  const payload = extractPayload(data.content);
  const plaintext = decryptHbeV4({ password: 'tagpass', ...payload });
  assert.ok(plaintext.includes(SECRET_NEEDLE));
});

// ---------------------------------------------------------------------------
// Criterion 7 — front-matter wins over tag
// ---------------------------------------------------------------------------
test('criterion 7: front-matter password wins over tag password', async () => {
  hexo.config.encrypt = { tags: [{ name: 'Secret', password: 'tagpass' }] };
  const data = makeSyntheticData({
    title: 'fm-wins',
    password: 'fmpass',
    tags: [{ name: 'Secret' }],
  });

  await hexo.execFilter('after_post_render', data, { context: hexo });
  assert.equal(data.encrypt, true);

  const payload = extractPayload(data.content);
  const ok = decryptHbeV4({ password: 'fmpass', ...payload });
  assert.ok(ok.includes(SECRET_NEEDLE));

  assert.throws(() => decryptHbeV4({ password: 'tagpass', ...payload }));
});

// ---------------------------------------------------------------------------
// Regression — `data.tags` is a Hexo Warehouse Query containing function
// values (e.g. moment-locale plurals on each Tag's `length` getter); under
// `structuredClone` (Node ≥18) those are NOT cloneable and would have
// thrown DataCloneError in `config.deepMerge`. The fix is that
// `resolve()`'s post-side pick uses POST_KNOWN_KEYS, which DELIBERATELY
// excludes `tags` (the post's tag list is read directly via
// `resolveTagPassword(hexo.config.encrypt, data.tags)` — never deep-merged).
// ---------------------------------------------------------------------------
test('regression: post.tags as a function-bearing object does NOT crash deepMerge', async () => {
  hexo.config.encrypt = { tags: [{ name: 'Secret', password: 'tagpass' }] };
  // Mimic Hexo's Warehouse Tag: a non-plain object whose enumerable
  // members include functions. `structuredClone` would throw on this
  // shape if it ever flowed through `deepMerge`'s `clone`.
  function HexoTag(name) {
    this.name = name;
    this.length = function lengthGetter() { return 1; };
    this.relative = function relativePath() { return '/tags/' + name + '/'; };
  }
  const tagShim = [new HexoTag('Secret')];
  const data = makeSyntheticData({
    title: 'tags-with-functions',
    password: 'fmpass',
    tags: tagShim,
  });

  await assert.doesNotReject(
    hexo.execFilter('after_post_render', data, { context: hexo }),
    'filter must not crash on function-bearing post.tags'
  );
  assert.equal(data.encrypt, true);

  // The original tags array reference is preserved on `data.tags`
  // (we never mutate it, never deep-clone it).
  assert.strictEqual(data.tags, tagShim);
  assert.equal(data.tags[0].name, 'Secret');
  assert.equal(typeof data.tags[0].length, 'function');
});

// ---------------------------------------------------------------------------
// Regression — `data.tags` is a Hexo Warehouse Query (NOT a plain array).
// `Array.isArray(query) === false` would silently disable tag-encryption,
// publishing the post in PLAINTEXT. The fix is `normalizePostTags` in
// `src/server/index.js`, which accepts arrays, `.toArray()`-able queries,
// and any object with a working `.forEach`. v3 used `data.tags.forEach`,
// so this restores back-compat.
// ---------------------------------------------------------------------------
test('regression: tag-only encryption fires when post.tags is a Warehouse-Query-like (.forEach) object', async () => {
  hexo.config.encrypt = { tags: [{ name: 'Secret', password: 'tagpass' }] };
  // Warehouse Query: NOT an Array, but iterable via .forEach.
  // This is exactly the shape Hexo passes for `data.tags` in real builds.
  const tagQuery = {
    length: 1,
    forEach(fn) { fn({ name: 'Secret' }); },
  };
  const data = makeSyntheticData({
    title: 'tag-query',
    tags: tagQuery,
  });
  delete data.password; // tag-only — no front-matter password

  await hexo.execFilter('after_post_render', data, { context: hexo });

  assert.equal(data.encrypt, true, 'tag-only encryption must fire for Warehouse-Query-like .tags');
  assert.ok(data.content.includes('hbeData'), 'wrapper must be rendered');
  assert.equal(data.content.indexOf(SECRET_NEEDLE), -1,
    'plaintext secret MUST NOT appear in rendered output');

  const payload = extractPayload(data.content);
  const plaintext = decryptHbeV4({ password: 'tagpass', ...payload });
  assert.ok(plaintext.includes(SECRET_NEEDLE));
});

test('regression: tag-only encryption fires when post.tags exposes .toArray() (Warehouse Query)', async () => {
  hexo.config.encrypt = { tags: [{ name: 'Secret', password: 'tagpass' }] };
  const tagQuery = {
    toArray() { return [{ name: 'Secret' }]; },
    forEach() { throw new Error('toArray should be preferred'); },
  };
  const data = makeSyntheticData({
    title: 'tag-query-toarray',
    tags: tagQuery,
  });
  delete data.password;

  await hexo.execFilter('after_post_render', data, { context: hexo });

  assert.equal(data.encrypt, true);
  assert.equal(data.content.indexOf(SECRET_NEEDLE), -1);
  const payload = extractPayload(data.content);
  assert.ok(decryptHbeV4({ password: 'tagpass', ...payload }).includes(SECRET_NEEDLE));
});

test('regression: post.tags = null/undefined does NOT crash and leaves post unencrypted', async () => {
  hexo.config.encrypt = { tags: [{ name: 'Secret', password: 'tagpass' }] };
  const data = makeSyntheticData({ title: 'no-tags', tags: null });
  delete data.password;
  await hexo.execFilter('after_post_render', data, { context: hexo });
  assert.notEqual(data.encrypt, true);
  assert.ok(data.content.includes(SECRET_NEEDLE), 'no tags + no fm password = unencrypted');
});

test('regression: post.tags is a non-iterable object falls back to no tag-encryption', async () => {
  hexo.config.encrypt = { tags: [{ name: 'Secret', password: 'tagpass' }] };
  const data = makeSyntheticData({ title: 'weird-tags', tags: { not: 'iterable' } });
  delete data.password;
  await hexo.execFilter('after_post_render', data, { context: hexo });
  assert.notEqual(data.encrypt, true);
});

// ---------------------------------------------------------------------------
// Criterion 9 — silent gates info but not warn
// ---------------------------------------------------------------------------
test('criterion 9: silent suppresses info logs but not warn logs', async () => {
  const originalInfo = hexo.log.info;
  const originalWarn = hexo.log.warn;
  let infoCount = 0;
  let warnCount = 0;
  hexo.log.info = () => { infoCount++; };
  hexo.log.warn = () => { warnCount++; };

  try {
    // Silent
    hexo.config.encrypt = { template: 'deprecated-value', silent: true };
    infoCount = 0; warnCount = 0;
    const dataSilent = makeSyntheticData({
      title: 'silent-true',
      password: 'pw',
      silent: true,
      template: 'deprecated-value',
    });
    await hexo.execFilter('after_post_render', dataSilent, { context: hexo });
    assert.equal(dataSilent.encrypt, true);
    assert.equal(infoCount, 0, 'silent must suppress info');
    assert.ok(warnCount >= 1, 'silent must NOT suppress warn (deprecated template)');

    // Loud
    hexo.config.encrypt = { template: 'deprecated-value', silent: false };
    infoCount = 0; warnCount = 0;
    const dataLoud = makeSyntheticData({
      title: 'silent-false',
      password: 'pw',
      silent: false,
      template: 'deprecated-value',
    });
    await hexo.execFilter('after_post_render', dataLoud, { context: hexo });
    assert.equal(dataLoud.encrypt, true);
    assert.ok(infoCount >= 1);
    assert.ok(warnCount >= 1);
  } finally {
    hexo.log.info = originalInfo;
    hexo.log.warn = originalWarn;
  }
});

// ---------------------------------------------------------------------------
// v4 NEW: per-post salt — same password, two posts → different salts/ciphertext
// ---------------------------------------------------------------------------
test('per-post salt: two posts with the same password produce different salts AND ciphertexts', async () => {
  hexo.config.encrypt = {};
  const a = makeSyntheticData({ title: 'a', password: 'shared', content: '<p>same</p>' });
  const b = makeSyntheticData({ title: 'b', password: 'shared', content: '<p>same</p>' });

  await hexo.execFilter('after_post_render', a, { context: hexo });
  await hexo.execFilter('after_post_render', b, { context: hexo });

  const pa = extractPayload(a.content);
  const pb = extractPayload(b.content);
  assert.notEqual(pa.saltHex, pb.saltHex, 'per-post salt must differ');
  assert.notEqual(pa.ciphertextHex, pb.ciphertextHex, 'ciphertext must differ');
});

// ---------------------------------------------------------------------------
// v4 NEW: per-encryption nonce — same content built twice → different nonce/ciphertext
// ---------------------------------------------------------------------------
test('per-encryption nonce: same post built twice produces different nonces and ciphertexts', async () => {
  hexo.config.encrypt = {};
  const opts = { title: 'same', password: 'p', content: '<p>same</p>' };
  const r1 = makeSyntheticData(opts);
  const r2 = makeSyntheticData(opts);

  await hexo.execFilter('after_post_render', r1, { context: hexo });
  await hexo.execFilter('after_post_render', r2, { context: hexo });

  const p1 = extractPayload(r1.content);
  const p2 = extractPayload(r2.content);
  assert.notEqual(p1.nonceHex, p2.nonceHex, 'nonce must differ');
  assert.notEqual(p1.ciphertextHex, p2.ciphertextHex, 'ciphertext must differ');
});

// ---------------------------------------------------------------------------
// v4 NEW: salt and nonce hex lengths
// ---------------------------------------------------------------------------
test('salt = exactly 64 hex chars (32 bytes), nonce = exactly 24 hex chars (12 bytes)', async () => {
  hexo.config.encrypt = {};
  const data = makeSyntheticData({ title: 'sizes', password: 'p' });
  await hexo.execFilter('after_post_render', data, { context: hexo });
  const p = extractPayload(data.content);
  assert.equal(p.saltHex.length, SALT_HEX);
  assert.equal(p.nonceHex.length, NONCE_HEX);
});

// ---------------------------------------------------------------------------
// v4 NEW: numeric password from YAML still works
// ---------------------------------------------------------------------------
test('numeric password from YAML (password: 12345) still works', async () => {
  hexo.config.encrypt = {};
  const data = makeSyntheticData({ title: 'numeric', password: 12345 });
  await hexo.execFilter('after_post_render', data, { context: hexo });
  assert.equal(data.encrypt, true);
  const p = extractPayload(data.content);
  const pt = decryptHbeV4({ password: '12345', ...p });
  assert.ok(pt.includes(SECRET_NEEDLE));
});

// ---------------------------------------------------------------------------
// v4 NEW: filter idempotence — re-running the filter is a strict no-op
// (achieved via a per-instance Symbol marker on `data`, NOT `data.encrypt`
// or `data.origin`, both of which collide with legitimate user FM signals).
// ---------------------------------------------------------------------------
test('filter idempotence: re-running the filter does NOT re-encrypt the wrapper', async () => {
  hexo.config.encrypt = {};
  const data = makeSyntheticData({ title: 'idem', password: 'p' });
  await hexo.execFilter('after_post_render', data, { context: hexo });
  assert.equal(data.encrypt, true);

  const snapshot = {
    content: data.content,
    encrypt: data.encrypt,
    origin: data.origin,
  };

  await hexo.execFilter('after_post_render', data, { context: hexo });
  // Only assert what THIS filter is responsible for. Hexo's own
  // `after_post_render` filters can mutate `excerpt`/`more` independently
  // on each pass, which is fine. The contract is: don't re-wrap content,
  // don't lose origin, don't flip encrypt off.
  assert.equal(data.content, snapshot.content,
    'wrapper content must not be re-wrapped');
  assert.equal(data.encrypt, snapshot.encrypt);
  assert.equal(data.origin, snapshot.origin);
  // And the result must still parse as a single v4 wrapper (no nested ones).
  const wrappers = data.content.match(/data-hbe-format=/g) || [];
  assert.equal(wrappers.length, 1,
    `expected exactly 1 v4 wrapper after re-run, got ${wrappers.length}`);
});

// ---------------------------------------------------------------------------
// Idempotence-marker regression tests (cross-model audit fixes)
// ---------------------------------------------------------------------------
test('idempotence marker: user FM "encrypt: true" with password STILL encrypts', async () => {
  hexo.config.encrypt = {};
  const data = makeSyntheticData({ title: 'fm-encrypt-flag', password: 'p' });
  // The fixture template already sets encrypt: true; assert it explicitly here
  // so the regression is visible.
  data.encrypt = true;
  await hexo.execFilter('after_post_render', data, { context: hexo });
  assert.equal(data.encrypt, true);
  assert.match(data.content, /class="hbe hbe-container"/);
  assert.match(data.content, /data-hbe-format="4"/);
});

test('idempotence marker: user FM "origin: <anything>" does NOT skip encryption', async () => {
  hexo.config.encrypt = {};
  const data = makeSyntheticData({ title: 'fm-origin-set', password: 'p' });
  // Some users / unrelated plugins set `origin` on `data`. Our marker must
  // NOT collide with that — encryption must still proceed.
  data.origin = 'some unrelated value set by another plugin';
  await hexo.execFilter('after_post_render', data, { context: hexo });
  assert.equal(data.encrypt, true);
  assert.match(data.content, /class="hbe hbe-container"/);
  // After a real encryption pass, `origin` is overwritten to the pre-encryption
  // plaintext (legacy theme contract).
  assert.ok(data.origin.includes(SECRET_NEEDLE),
    'origin must reflect the real plaintext after our pass, not the user-set sentinel');
});

test('idempotence marker: an external filter that pre-sets data.origin is NOT mistaken for our pass', async () => {
  hexo.config.encrypt = {};
  const data = makeSyntheticData({ title: 'pre-origin', password: 'p' });
  data.origin = data.content; // simulate another plugin setting origin === content
  await hexo.execFilter('after_post_render', data, { context: hexo });
  assert.equal(data.encrypt, true);
  assert.match(data.content, /data-hbe-format="4"/);
});

// ---------------------------------------------------------------------------
// v4 NEW: theme allowlist fallback
// ---------------------------------------------------------------------------
test("theme allowlist fallback: theme 'nonexistent' renders default + warn logged", async () => {
  hexo.config.encrypt = {};
  const originalWarn = hexo.log.warn;
  let warnMessages = [];
  hexo.log.warn = (m) => { warnMessages.push(m); };
  try {
    const data = makeSyntheticData({
      title: 'fallback-theme',
      password: 'p',
      theme: 'nonexistent',
    });
    await hexo.execFilter('after_post_render', data, { context: hexo });
    assert.equal(data.encrypt, true);
    // Should have warned about fallback theme
    assert.ok(
      warnMessages.some((m) => /nonexistent|allowlist|fallback|default/i.test(String(m))),
      `expected a fallback warning; got: ${JSON.stringify(warnMessages)}`
    );
    // Should still render default theme markup (hbe-input-default class).
    assert.ok(/hbe-input-default/.test(data.content),
      'fallback should render default theme markup');
  } finally {
    hexo.log.warn = originalWarn;
  }
});

// ---------------------------------------------------------------------------
// v4 NEW: HTML-escape XSS in attribute context
// ---------------------------------------------------------------------------
test('HTML-escape XSS in attribute context: malicious wrong_pass_message is escaped', async () => {
  hexo.config.encrypt = { wrong_pass_message: '"><script>alert(1)</script>' };
  const data = makeSyntheticData({ title: 'xss-attr', password: 'p' });
  await hexo.execFilter('after_post_render', data, { context: hexo });
  assert.equal(data.encrypt, true);
  // Raw injection attempt must not appear unescaped in the wpm attr.
  assert.ok(!data.content.includes('"><script>alert(1)</script>'),
    'unescaped XSS payload must not appear in output');
  // Properly escaped sequences must appear instead.
  assert.ok(/data-wpm="[^"]*&quot;[^"]*&lt;script&gt;[^"]*"/i.test(data.content),
    'wpm attr value must be HTML-escaped');
});

// ---------------------------------------------------------------------------
// v4 NEW: root-prefix variants for wrapper script src
// ---------------------------------------------------------------------------
const rootCases = [
  { input: '/', expected: '/' },
  { input: '/blog/', expected: '/blog/' },
  { input: '/blog', expected: '/blog/' },
];
for (const { input, expected } of rootCases) {
  test(`root prefix variant ${JSON.stringify(input)} produces script src starting with ${JSON.stringify(expected)}lib/`, async () => {
    const originalRoot = hexo.config.root;
    hexo.config.root = input;
    hexo.config.encrypt = {};
    try {
      const data = makeSyntheticData({ title: `root-${expected}`, password: 'p' });
      await hexo.execFilter('after_post_render', data, { context: hexo });
      const m = data.content.match(/<script[^>]*src="([^"]+)"/);
      assert.ok(m);
      assert.ok(m[1].startsWith(expected + 'lib/hbe.'),
        `expected src to start with ${expected}lib/hbe.; got ${m[1]}`);
      assert.ok(/lib\/hbe\.[0-9a-f]{10}\.js$/.test(m[1]),
        `expected hashed bundle filename; got ${m[1]}`);
    } finally {
      hexo.config.root = originalRoot;
    }
  });
}

// ---------------------------------------------------------------------------
// v4 NEW: wrapper script src embeds the SAME hash as generator emits
// ---------------------------------------------------------------------------
test('wrapper script src hash matches the SHA-256(bundle) hash the generator emits', async () => {
  hexo.config.encrypt = {};
  hexo.config.root = '/';
  const data = makeSyntheticData({ title: 'hash-match', password: 'p' });
  await hexo.execFilter('after_post_render', data, { context: hexo });
  const m = data.content.match(/<script[^>]*src="\/lib\/hbe\.([0-9a-f]+)\.js"/);
  assert.ok(m, 'expected hashed script src');
  const wrapperHash = m[1];
  const expectedHash = crypto.createHash('sha256')
    .update(fs.readFileSync(BUNDLE_PATH))
    .digest('hex')
    .slice(0, 10);
  assert.equal(wrapperHash, expectedHash);
});

// ---------------------------------------------------------------------------
// v4 NEW: data-kdf-iterations matches the resolved iteration count
// ---------------------------------------------------------------------------
test('data-kdf-iterations equals resolved kdf.iterations (default 250000) as string', async () => {
  hexo.config.encrypt = {};
  const data = makeSyntheticData({ title: 'kdf-default', password: 'p' });
  await hexo.execFilter('after_post_render', data, { context: hexo });
  const p = extractPayload(data.content);
  assert.equal(p.kdfIterations, String(PBKDF2_ITERS));
});

test('data-kdf-iterations honours user-set kdf.iterations (and matches server-side PBKDF2 count)', async () => {
  hexo.config.encrypt = {};
  const data = makeSyntheticData({
    title: 'kdf-custom',
    password: 'p',
    kdf: { iterations: 600000 },
  });
  await hexo.execFilter('after_post_render', data, { context: hexo });
  const p = extractPayload(data.content);
  assert.equal(p.kdfIterations, '600000');
  // And decrypt with 600000 iterations (server-side count must match).
  const pt = decryptHbeV4({ password: 'p', iterations: 600000, ...p });
  assert.ok(pt.includes(SECRET_NEEDLE));
});

// ---------------------------------------------------------------------------
// v4 NEW: data-auto-save matches resolved autoSave value
// ---------------------------------------------------------------------------
test('data-auto-save defaults to "false"', async () => {
  hexo.config.encrypt = {};
  const data = makeSyntheticData({ title: 'as-default', password: 'p' });
  await hexo.execFilter('after_post_render', data, { context: hexo });
  const p = extractPayload(data.content);
  assert.equal(p.autoSave, 'false');
});

test('data-auto-save reflects autoSave: true when user opts in', async () => {
  hexo.config.encrypt = { autoSave: true };
  const data = makeSyntheticData({ title: 'as-on', password: 'p' });
  await hexo.execFilter('after_post_render', data, { context: hexo });
  const p = extractPayload(data.content);
  assert.equal(p.autoSave, 'true');
});

// ---------------------------------------------------------------------------
// v4 NEW: data-whm defaulting (whm := wpm when user did not set whm)
// ---------------------------------------------------------------------------
test('data-whm equals data-wpm when user did not set wrong_hash_message', async () => {
  hexo.config.encrypt = {};
  const data = makeSyntheticData({ title: 'whm-default', password: 'p' });
  await hexo.execFilter('after_post_render', data, { context: hexo });
  const p = extractPayload(data.content);
  assert.equal(p.whm, p.wpm);
});

test('data-whm differs from data-wpm when user explicitly sets wrong_hash_message', async () => {
  hexo.config.encrypt = { wrong_hash_message: 'custom-hash-msg' };
  const data = makeSyntheticData({ title: 'whm-set', password: 'p' });
  await hexo.execFilter('after_post_render', data, { context: hexo });
  const p = extractPayload(data.content);
  assert.equal(p.whm, 'custom-hash-msg');
  assert.notEqual(p.whm, p.wpm);
});

// ---------------------------------------------------------------------------
// v4 NEW: format-version pin
// ---------------------------------------------------------------------------
test('data-hbe-format equals "4"', async () => {
  hexo.config.encrypt = {};
  const data = makeSyntheticData({ title: 'fmt', password: 'p' });
  await hexo.execFilter('after_post_render', data, { context: hexo });
  const p = extractPayload(data.content);
  assert.equal(p.formatVersion, FORMAT_VERSION);
});

// ---------------------------------------------------------------------------
// resolveTagPassword branch coverage: post has tags, none match
// ---------------------------------------------------------------------------
test('post with tags but none matching configured encrypt.tags is left untouched', async () => {
  hexo.config.encrypt = { tags: [{ name: 'Secret', password: 'tagpass' }] };
  const data = makeSyntheticData({
    title: 'no-tag-match',
    content: '<p>plain</p>',
    tags: [{ name: 'PublicNotes' }, { name: 'Misc' }],
  });
  delete data.password;

  const before = data.content;
  await hexo.execFilter('after_post_render', data, { context: hexo });

  assert.equal(data.encrypt, undefined);
  assert.equal(data.content, before);
});

// ---------------------------------------------------------------------------
// cfg === null guard: tag config has empty password (resolve() returns null)
// ---------------------------------------------------------------------------
test('matching tag with empty-string password is bypassed (cfg null guard)', async () => {
  hexo.config.encrypt = { tags: [{ name: 'Secret', password: '' }] };
  const data = makeSyntheticData({
    title: 'tag-empty-pw',
    content: '<p>plain</p>',
    tags: [{ name: 'Secret' }],
  });
  delete data.password;

  const before = data.content;
  await hexo.execFilter('after_post_render', data, { context: hexo });

  assert.equal(data.encrypt, undefined);
  assert.equal(data.content, before);
});

// ---------------------------------------------------------------------------
// register() argument validation
// ---------------------------------------------------------------------------
test('register(undefined) throws a clear error', () => {
  const { register } = require('../../src/server');
  assert.throws(() => register(), /hexo instance is required/);
});

// ---------------------------------------------------------------------------
// Branch coverage backstop: data.title not a string → "(untitled)"
// ---------------------------------------------------------------------------
test('post without a string title renders without crashing (uses "(untitled)" log label)', async () => {
  hexo.config.encrypt = {};
  const data = makeSyntheticData({ password: 'p' });
  delete data.title;
  await hexo.execFilter('after_post_render', data, { context: hexo });
  assert.equal(data.encrypt, true);
});

// ---------------------------------------------------------------------------
// Branch: empty data.content → still encrypts (covers `data.content || ''`)
// ---------------------------------------------------------------------------
test('post with empty content still encrypts (empty plaintext)', async () => {
  hexo.config.encrypt = {};
  const data = makeSyntheticData({ title: 'empty', password: 'p', content: '' });
  await hexo.execFilter('after_post_render', data, { context: hexo });
  assert.equal(data.encrypt, true);
  assert.match(data.content, /class="hbe hbe-container"/);
});

// ---------------------------------------------------------------------------
// Branch: decryptButton.show=false hides the button label
// ---------------------------------------------------------------------------
test('decryptButton.show=false renders an empty button-text slot', async () => {
  hexo.config.encrypt = { decryptButton: { show: false, text: 'Custom' } };
  const data = makeSyntheticData({ title: 'no-btn', password: 'p' });
  await hexo.execFilter('after_post_render', data, { context: hexo });
  // The button element is still present in markup; only its text is empty.
  assert.match(data.content, /<button class="hbe hbe-button"[^>]*>\s*<\/button>/);
});

// ---------------------------------------------------------------------------
// Branch: decryptButton with non-string text falls back to 'Decrypt'
// ---------------------------------------------------------------------------
test('decryptButton with non-string text falls back to default "Decrypt"', async () => {
  hexo.config.encrypt = { decryptButton: { show: true, text: 12345 } };
  const data = makeSyntheticData({ title: 'numeric-btn', password: 'p' });
  await hexo.execFilter('after_post_render', data, { context: hexo });
  assert.match(data.content, /<button class="hbe hbe-button"[^>]*>Decrypt<\/button>/);
});

// ---------------------------------------------------------------------------
// Branch: cfg.theme falsy → falls back to 'default'
// ---------------------------------------------------------------------------
test('post with theme="" front-matter falls back to default theme', async () => {
  hexo.config.encrypt = {};
  const data = makeSyntheticData({ title: 'no-theme', password: 'p', theme: '' });
  await hexo.execFilter('after_post_render', data, { context: hexo });
  assert.equal(data.encrypt, true);
});

// ---------------------------------------------------------------------------
// Branch: data.content === undefined → coerced to '' (covers `== null` truthy)
// ---------------------------------------------------------------------------
test('post with undefined content still encrypts (empty plaintext)', async () => {
  hexo.config.encrypt = {};
  const data = makeSyntheticData({ title: 'undef-content', password: 'p' });
  delete data.content;
  await hexo.execFilter('after_post_render', data, { context: hexo });
  assert.equal(data.encrypt, true);
});

// ---------------------------------------------------------------------------
// Branch: hexo.config.root is non-string (e.g. undefined) → falls back to '/'
// ---------------------------------------------------------------------------
test('non-string hexo.config.root falls back to "/" prefix', async () => {
  hexo.config.encrypt = {};
  const originalRoot = hexo.config.root;
  hexo.config.root = undefined;
  try {
    const data = makeSyntheticData({ title: 'no-root', password: 'p' });
    await hexo.execFilter('after_post_render', data, { context: hexo });
    assert.match(data.content, /<script data-pjax src="\/lib\/hbe\.[0-9a-f]{10}\.js"><\/script>/);
  } finally {
    hexo.config.root = originalRoot;
  }
});

// ---------------------------------------------------------------------------
// hexo.config.encrypt as a primitive (e.g. YAML `encrypt: true`) is treated
// as "no encrypt block configured" — must NOT crash with cryptic TypeError.
// ---------------------------------------------------------------------------
test('hexo.config.encrypt = true (YAML boolean) does not crash; uses defaults', async () => {
  hexo.config.encrypt = true;
  const data = makeSyntheticData({ title: 'yaml-bool', password: 'p' });
  await hexo.execFilter('after_post_render', data, { context: hexo });
  // Defaults applied; encryption proceeds because FM password is present.
  assert.equal(data.encrypt, true);
  assert.match(data.content, /data-hbe-format="4"/);
});

test('hexo.config.encrypt = "string" (malformed config) does not crash; uses defaults', async () => {
  hexo.config.encrypt = 'oops-i-meant-a-map';
  const data = makeSyntheticData({ title: 'yaml-str', password: 'p' });
  await hexo.execFilter('after_post_render', data, { context: hexo });
  assert.equal(data.encrypt, true);
});

test('hexo.config.encrypt = ["array"] (malformed) does not crash; uses defaults', async () => {
  hexo.config.encrypt = ['nope'];
  const data = makeSyntheticData({ title: 'yaml-arr', password: 'p' });
  await hexo.execFilter('after_post_render', data, { context: hexo });
  assert.equal(data.encrypt, true);
});
