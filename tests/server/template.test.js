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

test('HTML text escape: hbeButtonText containing markup is text-escaped', () => {
  const r = createRenderer({ templateDir: FIXTURES });
  const out = r.render(baseOpts({ buttonText: '<b>Open</b> & go' }));
  assert.ok(!out.includes('<b>Open</b>'), 'raw markup must not appear in the button label');
  assert.ok(out.includes('&lt;b&gt;Open&lt;/b&gt; &amp; go'), 'tag chars and & must be escaped');
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

test('hex-mode placeholder rejects non-hex value (defence-in-depth)', () => {
  const r = createRenderer({ templateDir: FIXTURES });
  // ciphertext slot is 'hex' mode — splice non-hex characters and require throw.
  assert.throws(
    () => r.render(baseOpts({ ciphertext: 'not-hex-zz' })),
    /refusing to render non-hex value into ciphertext slot/
  );
  assert.throws(
    () => r.render(baseOpts({ salt: 'XYZ-not-hex' })),
    /refusing to render non-hex value into salt slot/
  );
  assert.throws(
    () => r.render(baseOpts({ nonce: 'gghhiijj' })),
    /refusing to render non-hex value into nonce slot/
  );
});

test('createRenderer requires templateDir', () => {
  assert.throws(() => createRenderer(), /createRenderer requires templateDir/);
  assert.throws(() => createRenderer({}), /createRenderer requires templateDir/);
});

test('discoverThemes() with non-existent directory returns empty Map', () => {
  const { _internal } = require('../../src/server/template');
  const map = _internal.discoverThemes('/this/path/does/not/exist/at/all');
  assert.ok(map instanceof Map);
  assert.equal(map.size, 0);
});

test('render() throws if templateDir has no default theme to fall back to', async () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hbe-no-default-'));
  try {
    // Create a templateDir with one non-default theme only.
    fs.writeFileSync(
      path.join(tmp, 'hbe.cyanosis.html'),
      '<div>{{hbeEncryptedData}}</div>'
    );
    const r = createRenderer({ templateDir: tmp });
    // Requesting an unknown theme should warn + try default + then throw because default missing.
    assert.throws(
      () => r.render(baseOpts({ theme: 'something-else' })),
      /default theme not found/
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('valueOf returns empty string for undefined/null fields (text/attr modes)', () => {
  const r = createRenderer({ templateDir: FIXTURES });
  // Render with message=undefined and buttonText=undefined → both substituted as '' (no token leak).
  const opts = baseOpts();
  delete opts.message;
  delete opts.buttonText;
  const out = r.render(opts);
  assert.ok(!out.includes('{{hbeMessage}}'));
  assert.ok(!out.includes('{{hbeButtonText}}'));
});

test('render() with no opts falls back to default theme + empty substitutions', () => {
  const r = createRenderer({ templateDir: FIXTURES });
  const out = r.render();
  // Some unsubstituted hex slots will be empty strings; verify no token leakage.
  assert.ok(!out.includes('{{hbeSalt}}'));
  assert.ok(!out.includes('{{hbeNonce}}'));
  assert.ok(!out.includes('{{hbeEncryptedData}}'));
});

test('createRenderer with no logger arg works (default no-op logger covers fallback warn/info/debug)', () => {
  // No logger → falls back to {warn,info,debug:()=>{}}. Trigger warn by requesting unknown theme.
  const r = createRenderer({ templateDir: FIXTURES });
  // Render with unknown theme to fire the no-op warn.
  const out = r.render(baseOpts({ theme: 'no-such-theme' }));
  assert.ok(out.includes('hexo-blog-encrypt') || out.length > 0);
});

test('replacement values remain literal instead of expanding other placeholders', () => {
  const r = createRenderer({ templateDir: FIXTURES });
  const out = r.render(baseOpts({
    wpm: '{{hbeMessage}}',
    message: '" data-injected="yes',
    buttonText: '{{hbeEncryptedData}} $&',
  }));
  assert.ok(out.includes('data-wpm="{{hbeMessage}}"'), 'attribute value stays literal');
  assert.ok(!out.includes('data-wpm="" data-injected="yes"'), 'no cross-context attribute injection');
  assert.ok(out.includes('{{hbeEncryptedData}} $&'), 'replacement tokens and dollar signs stay literal');
});

// ---------------------------------------------------------------------------
// #247 — {{hbeMessage}} is placed inside data-content="…" by some shipped
// themes (blink, flip, surge), so it must be attribute-escaped everywhere.
// Render EVERY shipped theme from lib/ with breakout payloads.
// ---------------------------------------------------------------------------
const SHIPPED = path.resolve(__dirname, '..', '..', 'lib');
const ENTITY = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&#96;': '`' };
function decodeEntities(s) {
  return s.replace(/&(?:amp|lt|gt|quot|#39|#96);/g, (e) => ENTITY[e]);
}

const MESSAGE_PAYLOADS = [
  '"><img src=x onerror=alert(1)>',
  '" onmouseover="alert(1)',
  "' onfocus='alert(1)` & <b>bold</b>",
];

{
  const shipped = createRenderer({ templateDir: SHIPPED });
  const themes = shipped.listThemes();

  test('#247: shipped theme list includes the attribute-context themes', () => {
    for (const t of ['blink', 'flip', 'surge']) assert.ok(themes.includes(t), `missing theme ${t}`);
  });

  for (const theme of themes) {
    for (const payload of MESSAGE_PAYLOADS) {
      test(`#247: theme '${theme}' escapes message ${JSON.stringify(payload)} in every context`, () => {
        const out = shipped.render(baseOpts({ theme, message: payload }));

        // No raw quote/angle-bracket breakout survives anywhere.
        assert.ok(!out.includes(payload), 'raw payload must not appear');
        assert.ok(!/<img\b/i.test(out), 'no injected <img> element');
        // Inspect real tags only: strip quoted attribute values, then collect
        // event-handler attribute names. The set must equal the theme's own
        // (e.g. the form's onsubmit) rendered with a benign message.
        const handlers = (html) => html.match(/<[a-z][^>]*>/gi)
          .map((tag) => tag.replace(/"[^"]*"|'[^']*'/g, '""'))
          .flatMap((tag) => tag.match(/\son[a-z]+(?=\s*=)/gi) || []);
        const baseline = shipped.render(baseOpts({ theme, message: 'benign' }));
        assert.deepEqual(handlers(out), handlers(baseline), 'no injected event-handler attribute');

        // Every data-content attribute decodes back to the exact message.
        const attrs = [...out.matchAll(/data-content="([^"]*)"/g)].map((m) => decodeEntities(m[1]));
        for (const v of attrs) assert.equal(v, payload, 'data-content must carry the exact message');
        if (['blink', 'flip', 'surge'].includes(theme)) {
          assert.equal(attrs.length, 1, `theme '${theme}' renders the message into data-content`);
        }

        // The visible label text decodes back to the exact message.
        const label = out.match(/<span class="hbe hbe-input-label-content[^"]*"[^>]*>([^<]*)<\/span>/);
        assert.ok(label, 'label span present');
        assert.equal(decodeEntities(label[1]), payload, 'visible text must equal the message');
      });
    }
  }
}
