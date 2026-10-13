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
  assert.equal(DEFAULTS.stableSalt, false);
  assert.equal(DEFAULTS.kdf.iterations, 250000);
  assert.equal(DEFAULTS.decryptButton.show, true);
  assert.equal(typeof DEFAULTS.decryptButton.text, 'string');
  assert.equal(typeof DEFAULTS.message, 'string');
  assert.equal(typeof DEFAULTS.wrong_pass_message, 'string');
});

test('#260: server KDF default is defined once (crypto.js) and reused by config.js', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const { DEFAULT_ITERATIONS } = require('../../src/server/crypto');
  assert.equal(DEFAULTS.kdf.iterations, DEFAULT_ITERATIONS);
  const dir = path.resolve(__dirname, '..', '..', 'src', 'server');
  const hits = fs.readdirSync(dir)
    .filter((f) => f.endsWith('.js'))
    .flatMap((f) => (fs.readFileSync(path.join(dir, f), 'utf8').match(/\b250_?000\b/g) || []).map(() => f));
  assert.deepEqual(hits, ['crypto.js'], `default iteration literal must live only in crypto.js; found in ${hits}`);
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

test('new keys (kdf.iterations, decryptButton.{show,text}, autoSave, stableSalt) honoured', () => {
  const out = resolve(
    {
      encrypt: {
        kdf: { iterations: 500000 },
        decryptButton: { show: false, text: 'Open' },
        autoSave: true,
        stableSalt: true,
      },
    },
    { password: 'pw' },
    fakeLogger()
  );
  assert.equal(out.kdf.iterations, 500000);
  assert.equal(out.decryptButton.show, false);
  assert.equal(out.decryptButton.text, 'Open');
  assert.equal(out.autoSave, true);
  assert.equal(out.stableSalt, true);
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
    { encrypt: { theme: 'shrink', autoSave: true, stableSalt: true } },
    { password: 'pw', theme: 'flip', autoSave: false, stableSalt: false },
    fakeLogger()
  );
  assert.equal(out.theme, 'flip');
  assert.equal(out.autoSave, false);
  assert.equal(out.stableSalt, false);
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

// ---------------------------------------------------------------------------
// #249 — boolean options are validated, not coerced by truthiness.
// ---------------------------------------------------------------------------
const BOOL_OPTS = ['autoSave', 'stableSalt', 'silent'];

for (const name of BOOL_OPTS) {
  test(`#249: quoted "false" for site-level ${name} resolves to false and warns`, () => {
    const log = fakeLogger();
    const out = resolve({ encrypt: { [name]: 'false' } }, { password: 'pw' }, log);
    assert.equal(out[name], false);
    const warns = log.events.filter((e) => e.level === 'warn').map((e) => e.msg);
    assert.ok(warns.some((m) => m.includes(`encrypt.${name}`) && /string/.test(m)),
      `expected a quoted-boolean warning; got ${JSON.stringify(warns)}`);
  });

  test(`#249: quoted " TRUE " for post-level ${name} resolves to true and warns`, () => {
    const log = fakeLogger();
    const out = resolve({}, { password: 'pw', [name]: ' TRUE ' }, log);
    assert.equal(out[name], true);
    assert.ok(log.events.some((e) => e.level === 'warn' && e.msg.includes(`front-matter ${name}`)));
  });

  for (const [label, bad] of [['number 0', 0], ['number 1', 1], ['object', { a: 1 }], ['array', [true]], ['string "yes"', 'yes']]) {
    test(`#249: ${label} for ${name} is rejected at site and post level`, () => {
      assert.throws(
        () => resolve({ encrypt: { [name]: bad } }, { password: 'pw' }, fakeLogger()),
        (err) => err.message.includes(`encrypt.${name}`) && /must be a boolean/.test(err.message),
      );
      assert.throws(
        () => resolve({}, { password: 'pw', [name]: bad }, fakeLogger()),
        (err) => err.message.includes(`front-matter ${name}`) && /must be a boolean/.test(err.message),
      );
    });
  }

  test(`#249: real booleans for ${name} pass without warnings`, () => {
    const log = fakeLogger();
    const out = resolve({ encrypt: { [name]: true } }, { password: 'pw', [name]: false }, log);
    assert.equal(out[name], false);
    assert.equal(log.events.filter((e) => e.level === 'warn' && e.msg.includes(name)).length, 0);
  });
}

test('#249: decryptButton.show "false" (quoted) resolves to false and warns', () => {
  const log = fakeLogger();
  const out = resolve({ encrypt: { decryptButton: { show: 'false', text: 'Open' } } }, { password: 'pw' }, log);
  assert.equal(out.decryptButton.show, false);
  assert.equal(out.decryptButton.text, 'Open');
  assert.ok(log.events.some((e) => e.level === 'warn' && e.msg.includes('encrypt.decryptButton.show')));
});

test('#249: decryptButton.show non-boolean is rejected', () => {
  assert.throws(
    () => resolve({}, { password: 'pw', decryptButton: { show: 0 } }, fakeLogger()),
    /front-matter decryptButton\.show must be a boolean/,
  );
});

test('#249: decryptButton without show, or null, keeps defaults', () => {
  assert.equal(resolve({}, { password: 'pw', decryptButton: { text: 'Go' } }).decryptButton.show, true);
  assert.equal(resolve({}, { password: 'pw', decryptButton: null }).decryptButton.show, true);
  assert.equal(resolve({}, { password: 'pw', decryptButton: [1] }).decryptButton.length, 1);
});

test('#249: boolean normalisation does not mutate the caller\'s decryptButton object', () => {
  const site = { encrypt: { decryptButton: { show: 'false' } } };
  resolve(site, { password: 'pw' }, fakeLogger());
  assert.equal(site.encrypt.decryptButton.show, 'false');
});

// ---------------------------------------------------------------------------
// #251 — password: { env: NAME } reads the password from the environment.
// ---------------------------------------------------------------------------
const ENV_NAME = 'HBE_TEST_PASSWORD_251';
const ENV_VALUE = 'env-secret-value-251';

function withEnv(value, fn) {
  const had = Object.prototype.hasOwnProperty.call(process.env, ENV_NAME);
  const prev = process.env[ENV_NAME];
  if (value === undefined) delete process.env[ENV_NAME];
  else process.env[ENV_NAME] = value;
  try {
    return fn();
  } finally {
    if (had) process.env[ENV_NAME] = prev;
    else delete process.env[ENV_NAME];
  }
}

test('#251: front-matter password { env } resolves from process.env', () => {
  withEnv(ENV_VALUE, () => {
    const out = resolve({}, { password: { env: ENV_NAME } }, fakeLogger());
    assert.equal(out.password, ENV_VALUE);
  });
});

test('#251: site-level encrypt.password { env } resolves from process.env', () => {
  withEnv(ENV_VALUE, () => {
    const out = resolve({ encrypt: { password: { env: ENV_NAME } } }, {}, fakeLogger());
    assert.equal(out.password, ENV_VALUE);
  });
});

for (const [label, value] of [['missing', undefined], ['empty', '']]) {
  test(`#251: ${label} env var fails the build, naming the variable and post`, () => {
    withEnv(value, () => {
      assert.throws(
        () => resolve({}, { title: 'Diary', password: { env: ENV_NAME } }, fakeLogger()),
        (err) => err.message.includes(ENV_NAME)
          && /not set or is empty/.test(err.message)
          && err.message.includes('"Diary"'),
      );
    });
  });
}

test('#251: env error without a post title still names the variable', () => {
  withEnv(undefined, () => {
    assert.throws(
      () => resolve({}, { password: { env: ENV_NAME } }),
      (err) => err.message.includes(ENV_NAME) && !err.message.includes('post "'),
    );
  });
});

for (const [label, bad] of [
  ['object without env', { name: 'X' }],
  ['empty env name', { env: '' }],
  ['non-string env name', { env: 42 }],
  ['array', ['pw']],
]) {
  test(`#251: password as ${label} is rejected with a clear error`, () => {
    assert.throws(
      () => resolve({}, { password: bad }, fakeLogger()),
      /password must be a string, a number, or \{ env: NAME \}/,
    );
  });
}

test('#251: resolved env value never appears in warnings', () => {
  withEnv(ENV_VALUE, () => {
    const log = fakeLogger();
    resolve({}, { password: { env: ENV_NAME }, template: 'flip', autoSave: 'true' }, log);
    assert.ok(log.events.length > 0);
    for (const e of log.events) assert.ok(!e.msg.includes(ENV_VALUE));
  });
});

test('#251: env resolution does not mutate the caller\'s front matter', () => {
  withEnv(ENV_VALUE, () => {
    const post = { password: { env: ENV_NAME } };
    resolve({}, post, fakeLogger());
    assert.deepEqual(post.password, { env: ENV_NAME });
  });
});

// ---------------------------------------------------------------------------
// #259 — localized defaults from post lang/language or site language.
// ---------------------------------------------------------------------------
const ZH = {
  abstract: '有东西被加密了, 请输入密码查看.',
  message: '您好, 这里需要密码.',
  wrong_pass_message: '抱歉, 这个密码看着不太对, 请再试试.',
  button: '解密',
};

function assertZh(out) {
  assert.equal(out.abstract, ZH.abstract);
  assert.equal(out.message, ZH.message);
  assert.equal(out.wrong_pass_message, ZH.wrong_pass_message);
  assert.equal(out.wrong_hash_message, ZH.wrong_pass_message);
  assert.equal(out.decryptButton.text, ZH.button);
}

function assertEn(out) {
  assert.equal(out.abstract, DEFAULTS.abstract);
  assert.equal(out.message, DEFAULTS.message);
  assert.equal(out.wrong_pass_message, DEFAULTS.wrong_pass_message);
  assert.equal(out.decryptButton.text, DEFAULTS.decryptButton.text);
}

for (const lang of ['zh-CN', 'zh-cn', 'zh_CN', 'zh-Hans', 'zh', ' ZH-HANS ', 'zh-Hans-CN']) {
  test(`#259: site language ${JSON.stringify(lang)} selects Simplified Chinese defaults`, () => {
    assertZh(resolve({ language: lang }, { password: 'pw' }));
  });
}

test('#259: site language as an array uses the first entry', () => {
  assertZh(resolve({ language: ['zh-CN', 'en'] }, { password: 'pw' }));
  assertEn(resolve({ language: ['en', 'zh-CN'] }, { password: 'pw' }));
});

test('#259: post lang / language override the site language', () => {
  assertZh(resolve({ language: 'en' }, { password: 'pw', lang: 'zh-CN' }));
  assertZh(resolve({ language: 'en' }, { password: 'pw', language: 'zh-Hans' }));
  assertEn(resolve({ language: 'zh-CN' }, { password: 'pw', lang: 'en' }));
});

for (const lang of [undefined, 'en', 'en-US', 'fr', 'zh-TW', 'zh-Hant', '', 42, [], null]) {
  test(`#259: language ${JSON.stringify(lang)} falls back to English defaults`, () => {
    assertEn(resolve({ language: lang }, { password: 'pw' }));
  });
}

test('#259: explicit site and post config always win over localized defaults', () => {
  const out = resolve(
    { language: 'zh-CN', encrypt: { message: 'site msg', decryptButton: { text: 'Open' } } },
    { password: 'pw', abstract: 'post abstract' },
  );
  assert.equal(out.message, 'site msg');
  assert.equal(out.decryptButton.text, 'Open');
  assert.equal(out.abstract, 'post abstract');
  assert.equal(out.wrong_pass_message, ZH.wrong_pass_message);
});

test('#259: post lang is not treated as an encrypt option', () => {
  const out = resolve({}, { password: 'pw', lang: 'zh-CN' });
  assert.equal(out.lang, undefined);
  assert.equal(out.language, undefined);
});
