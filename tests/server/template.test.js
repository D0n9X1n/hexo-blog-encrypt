'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { createRenderer } = require('../../src/server/template');

const FIXTURES = path.resolve(__dirname, '../fixtures/themes');

function logger() {
  const events = [];
  return {
    events,
    info: (m) => events.push({ level: 'info', msg: m }),
    warn: (m) => events.push({ level: 'warn', msg: m }),
    debug: (m) => events.push({ level: 'debug', msg: m }),
  };
}

function baseOpts(overrides) {
  return Object.assign({
    theme: 'default',
    format: '4',
    ciphertext: 'deadbeefcafe',
    salt: '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff',
    nonce: '0123456789abcdef01234567',
    message: 'Password please',
    wpm: 'Wrong password',
    whm: 'Wrong password',
    buttonText: 'Decrypt',
    kdfIterations: 250000,
    autoSave: false,
  }, overrides || {});
}

test('createRenderer({templateDir}) returns { render } API', () => {
  const r = createRenderer({ templateDir: FIXTURES });
  assert.equal(typeof r.render, 'function');
});

test('render() substitutes the standard placeholders', () => {
  const r = createRenderer({ templateDir: FIXTURES });
  const out = r.render(baseOpts());
  assert.match(out, /id="hexo-blog-encrypt"/);
  assert.ok(!out.includes('{{hbeEncryptedData}}'), 'no unsubstituted placeholders');
  assert.ok(!out.includes('{{hbeMessage}}'), 'no unsubstituted placeholders');
  assert.match(out, /deadbeefcafe/);
  assert.match(out, /Password please/);
  assert.match(out, /data-salt="00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff"/);
  assert.match(out, /data-nonce="0123456789abcdef01234567"/);
  assert.match(out, /data-hbe-format="4"/);
});

test('render() emits data-kdf-iterations as a decimal string', () => {
  const r = createRenderer({ templateDir: FIXTURES });
  const out = r.render(baseOpts({ kdfIterations: 600000 }));
  assert.match(out, /data-kdf-iterations="600000"/);
});

test('render() emits data-auto-save as "true" or "false" string', () => {
  const r = createRenderer({ templateDir: FIXTURES });
  const a = r.render(baseOpts({ autoSave: false }));
  const b = r.render(baseOpts({ autoSave: true }));
  assert.match(a, /data-auto-save="false"/);
  assert.match(b, /data-auto-save="true"/);
});

test('HTML attribute escape: data-wpm with breakout payload is escaped', () => {
  const r = createRenderer({ templateDir: FIXTURES });
  const evil = '"><script>alert(1)</script>';
  const out = r.render(baseOpts({ wpm: evil, whm: evil }));
  // The closing-quote-and-script-open MUST NOT appear verbatim in attribute context.
  assert.ok(!out.includes('"><script>alert(1)</script>'), 'no raw breakout payload in output');
  assert.ok(out.includes('&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;'), 'expected entity escapes for attribute context');
});

test('HTML attribute escape: single-quote breakout payload is escaped', () => {
  const r = createRenderer({ templateDir: FIXTURES });
  const evil = "' onmouseover='alert(1)";
  const out = r.render(baseOpts({ wpm: evil, whm: evil }));
  assert.ok(!out.includes("' onmouseover='alert(1)"), 'no raw single-quote breakout');
  assert.ok(out.includes('&#39;'), 'single-quote must be entity-encoded');
});

test('HTML text escape: hbeMessage body containing markup is text-escaped', () => {
  const r = createRenderer({ templateDir: FIXTURES });
  const out = r.render(baseOpts({ message: '<b>Hi</b> &amp; bye' }));
  // In text context, & < > must be escaped.
  assert.ok(!out.includes('<b>Hi</b> &amp; bye'), 'raw markup must not appear in body text context');
  assert.ok(out.includes('&lt;b&gt;Hi&lt;/b&gt;'), 'tag chars must be escaped in text context');
  assert.ok(out.includes('&amp;amp;'), 'literal "&amp;" in source must double-escape to &amp;amp;');
});

test('HTML attribute escape: HTML-entity payload is preserved as literal text (double-escape attempt)', () => {
  const r = createRenderer({ templateDir: FIXTURES });
  const evil = '&quot;&gt;<script>alert(1)</script>';
  const out = r.render(baseOpts({ wpm: evil, whm: evil }));
  assert.ok(!out.includes('<script>alert(1)</script>'), 'raw script tag must not survive in attribute');
});

test('Theme allowlist: bad theme falls back to default + warns + does NOT throw', () => {
  const log = logger();
  const r = createRenderer({ templateDir: FIXTURES, logger: log });
  let out;
  assert.doesNotThrow(() => {
    out = r.render(baseOpts({ theme: 'nonexistent-theme' }));
  });
  assert.ok(out.includes('id="hexo-blog-encrypt"'), 'must still render the default template');
  const warns = log.events.filter((e) => e.level === 'warn');
  assert.ok(
    warns.some((e) => /nonexistent-theme/.test(e.msg) && /default/i.test(e.msg)),
    'must log a warn naming the bad theme + the fallback'
  );
});

test('No v3 placeholder tokens leak into output', () => {
  const r = createRenderer({ templateDir: FIXTURES });
  const out = r.render(baseOpts());
  assert.ok(!out.includes('{{hbeHmacDigest}}'));
  assert.ok(!out.includes('{{hbeKeySalt}}'));
  assert.ok(!out.includes('{{hbeIvSalt}}'));
});

test('listThemes() returns the discovered theme names from templateDir', () => {
  const r = createRenderer({ templateDir: FIXTURES });
  const themes = r.listThemes();
  assert.ok(Array.isArray(themes));
  assert.ok(themes.includes('default'), 'fixture themes/ contains default');
});

test('Substituted ciphertext placeholder appears between the script tags', () => {
  const r = createRenderer({ templateDir: FIXTURES });
  const out = r.render(baseOpts({ ciphertext: 'aabbccdd' }));
  assert.match(out, /<script id="hbeData"[^>]*>aabbccdd<\/script>/);
});
