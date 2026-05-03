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
