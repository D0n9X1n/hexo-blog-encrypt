'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { resolve, DEFAULTS } = require('../../src/server/config');

function fakeLogger() {
  const events = [];
  return {
    events,
    info: (msg) => events.push({ level: 'info', msg }),
    warn: (msg) => events.push({ level: 'warn', msg }),
    debug: (msg) => events.push({ level: 'debug', msg }),
  };
}

test('DEFAULTS exposes the documented v4 keys + values', () => {
  assert.equal(DEFAULTS.theme, 'default');
  assert.equal(DEFAULTS.silent, false);
  assert.equal(DEFAULTS.autoSave, false);
  assert.equal(DEFAULTS.kdf.iterations, 250000);
  assert.equal(DEFAULTS.decryptButton.show, true);
  assert.equal(typeof DEFAULTS.decryptButton.text, 'string');
  assert.equal(typeof DEFAULTS.message, 'string');
  assert.equal(typeof DEFAULTS.wrong_pass_message, 'string');
});

test('resolve() returns a NEW object; inputs are not mutated', () => {
  const hexoConfig = { encrypt: { theme: 'shrink' } };
  const data = { password: 'pw' };
  const before = JSON.parse(JSON.stringify({ DEFAULTS, hexoConfig, data }));
  const out = resolve(hexoConfig, data, fakeLogger());
  assert.notEqual(out, DEFAULTS, 'must not be the DEFAULTS instance');
  assert.notEqual(out, hexoConfig.encrypt, 'must not be the hexo block instance');
  // Inputs unchanged after the call:
  assert.deepEqual(DEFAULTS, before.DEFAULTS, 'DEFAULTS must not mutate');
  assert.deepEqual(hexoConfig, before.hexoConfig, 'hexoConfig must not mutate');
  assert.deepEqual(data, before.data, 'data must not mutate');
});

test('"template" key in post data fires deprecation warn AND aliases to theme', () => {
  const log = fakeLogger();
  const out = resolve({}, { password: 'pw', template: 'shrink' }, log);
  assert.equal(out.theme, 'shrink', 'template must alias to theme');
  const warns = log.events.filter((e) => e.level === 'warn');
  assert.ok(
    warns.some((e) => /template/i.test(e.msg) && /theme/i.test(e.msg)),
    'must warn about template→theme deprecation'
  );
});

test('explicit "wrong_hash_message" fires deprecation warn (alias-only under GCM)', () => {
  const log = fakeLogger();
  const out = resolve({}, { password: 'pw', wrong_hash_message: 'custom whm' }, log);
  assert.equal(out.wrong_hash_message, 'custom whm', 'value preserved');
  const warns = log.events.filter((e) => e.level === 'warn');
  assert.ok(
    warns.some((e) => /wrong_hash_message/.test(e.msg)),
    'must warn that wrong_hash_message is deprecated'
  );
});

test('UNSET wrong_hash_message defaults to the resolved wrong_pass_message (single source of truth)', () => {
  const out = resolve({}, { password: 'pw', wrong_pass_message: 'wrong pw!' }, fakeLogger());
  assert.equal(
    out.wrong_hash_message,
    out.wrong_pass_message,
    'whm must default to resolved wpm when user did not set it'
  );
  assert.equal(out.wrong_hash_message, 'wrong pw!');
});

test('new keys (kdf.iterations, decryptButton.{show,text}, autoSave) honoured', () => {
  const out = resolve(
    { encrypt: { kdf: { iterations: 500000 }, decryptButton: { show: false, text: 'Open' }, autoSave: true } },
    { password: 'pw' },
    fakeLogger()
  );
  assert.equal(out.kdf.iterations, 500000);
  assert.equal(out.decryptButton.show, false);
  assert.equal(out.decryptButton.text, 'Open');
  assert.equal(out.autoSave, true);
});

test('kdf.iterations: 1000 THROWS with error mentioning the 100_000 floor', () => {
  assert.throws(
    () => resolve({ encrypt: { kdf: { iterations: 1000 } } }, { password: 'pw' }, fakeLogger()),
    (err) => /100[_,]?000/.test(err.message),
    'must throw with floor mentioned'
  );
});

test('kdf.iterations: 200_000 (above floor, below recommendation) triggers log.warn but returns config', () => {
  const log = fakeLogger();
  const out = resolve({ encrypt: { kdf: { iterations: 200000 } } }, { password: 'pw' }, log);
  assert.equal(out.kdf.iterations, 200000, 'value preserved');
  const warns = log.events.filter((e) => e.level === 'warn');
  assert.ok(
    warns.some((e) => /600[_,]?000/.test(e.msg) || /OWASP/i.test(e.msg) || /recommend/i.test(e.msg)),
    'must warn about being below the recommended iteration count'
  );
});

test('password === "" returns null marker (caller checks; encryption disabled)', () => {
  const out = resolve({}, { password: '' }, fakeLogger());
  assert.equal(out, null, 'empty-string password disables encryption');
});

test('password === undefined returns null (no encryption)', () => {
  const out = resolve({}, {}, fakeLogger());
  assert.equal(out, null, 'undefined password disables encryption');
});

test('numeric password from YAML (password: 12345) is coerced to string and works', () => {
  const out = resolve({}, { password: 12345 }, fakeLogger());
  assert.equal(typeof out.password, 'string');
  assert.equal(out.password, '12345');
});

test('post-data overrides hexo-config (front-matter wins)', () => {
  const out = resolve(
    { encrypt: { theme: 'shrink', autoSave: true } },
    { password: 'pw', theme: 'flip', autoSave: false },
    fakeLogger()
  );
  assert.equal(out.theme, 'flip');
  assert.equal(out.autoSave, false);
});

// ---------------------------------------------------------------------------
// Branch + function coverage backstop tests
// ---------------------------------------------------------------------------
test('resolve() works without a logger argument (no-op default logger)', () => {
  const out = resolve({ encrypt: {} }, { password: 'p' });
  assert.equal(out.password, 'p');
});

test('resolve() works without postData argument (treats as empty object)', () => {
  // hexoConfig provides the password; postData omitted entirely.
  const out = resolve({ encrypt: { password: 'fromHexo' } });
  assert.equal(out.password, 'fromHexo');
});

test('resolve() handles hexoConfig=null (no encrypt block)', () => {
  // Empty post + null hexoConfig → no password → null.
  const out = resolve(null, { password: 'p' });
  assert.equal(out.password, 'p');
});

test('resolve() returns null when hexoConfig.encrypt and postData are both empty', () => {
  assert.equal(resolve({}, {}), null);
});

test('resolve() coerces non-object kdf (e.g. kdf=null) to defaults', () => {
  const out = resolve({}, { password: 'p', kdf: null });
  assert.equal(out.kdf.iterations, DEFAULTS.kdf.iterations);
});

test('resolve() coerces undefined kdf.iterations to defaults', () => {
  const out = resolve({}, { password: 'p', kdf: { other: 1 } });
  assert.equal(out.kdf.iterations, DEFAULTS.kdf.iterations);
});

test('deepMerge: array overlay replaces base wholesale (no element-wise merge)', () => {
  // DEFAULTS has no `tags` field; overlaying hexoConfig.encrypt.tags
  // flows through deepMerge's array-overlay branch
  // (`Array.isArray(overlay) → return clone(overlay)`). The result is
  // the wholesale array from the overlay — element-wise merging would
  // have produced something else.
  // (Post-side `tags` is intentionally NOT picked into the deep-merge —
  // see `POST_KNOWN_KEYS` in `src/server/config.js`. The post's tag list
  // is read directly by `resolveTagPassword` and never deep-merged.)
  const out = resolve(
    { encrypt: { tags: [{ name: 'A', password: 'a' }] } },
    { password: 'p' }
  );
  assert.deepEqual(out.tags, [{ name: 'A', password: 'a' }]);
});

test('shallowPickKnown handles non-object source via post=null path', () => {
  // postData is null → covers `if (!source || typeof source !== 'object') return out;`
  // in shallowPickKnown when called for the post layer.
  const out = resolve({ encrypt: { password: 'p' } }, null);
  assert.equal(out.password, 'p');
});

test('clone() short-circuits primitive values (covers function entry for primitives)', () => {
  // String password is a primitive; deepMerge will recurse into clone(value) for the leaf.
  const out = resolve({}, { password: 'pw', message: 'short' });
  assert.equal(out.password, 'pw');
  assert.equal(out.message, 'short');
});

test('resolve() with no logger arg + deprecation triggers default no-op warn (covers default logger fn)', () => {
  // Use the deprecated `template` alias to force a warn() call on the default no-op logger.
  const out = resolve({}, { password: 'p', template: 'shrink' });
  assert.equal(out.theme, 'shrink');
});

test('resolve() with no logger + low iterations triggers default no-op debug/warn paths', () => {
  // 100_000 ≥ FLOOR but < RECOMMENDED → triggers the OWASP warn band on no-op logger.
  const out = resolve({}, { password: 'p', kdf: { iterations: 100000 } });
  assert.equal(out.kdf.iterations, 100000);
});

test('resolve() with primitive kdf override (e.g. kdf="oops") throws integer-validation error (covers deepMerge primitive overlay)', () => {
  assert.throws(
    () => resolve({}, { password: 'p', kdf: 'oops' }),
    /kdf\.iterations must be an integer/
  );
});
