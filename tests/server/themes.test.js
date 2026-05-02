'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { buildSite, discoverThemes } = require('../helpers/buildSite.js');

// Discovered at module-load time so the parameterized `test()` calls below
// register synchronously, giving the runner one sub-test per theme.
// `discoverThemes()` reads from `lib/hbe.*.html` on disk and excludes the
// non-theme `hbe.js` and `hbe.style.css` siblings (see helpers/buildSite.js).
const THEMES = discoverThemes();

const REQUIRED_DATA_ATTRS = [
  'data-wpm',
  'data-whm',
  'data-hmacdigest',
  'data-keysalt',
  'data-ivsalt',
];

let hexo;
let postsBySlug;
let configuredMessage;

before(async () => {
  hexo = await buildSite();
  // Index posts by slug once. Sibling tests boot the same fixture, but we only
  // assert against `encrypted-<theme>` slugs we own, so cross-test posts (if
  // any) are ignored. The buildSite helper materializes posts deterministically
  // (idempotent overwrite), so concurrent boots converge to the same content.
  const all = hexo.locals.get('posts').toArray();
  postsBySlug = new Map(all.map((p) => [p.slug, p]));
  // Default message comes from index.js's `defaultConfig`. After init, the
  // effective value lives at `hexo.config.encrypt.message` (or the default if
  // the fixture didn't override). We read it back rather than hard-coding to
  // avoid drift if the SUT default changes.
  const enc = hexo.config && hexo.config.encrypt;
  configuredMessage = (enc && enc.message) || 'Hey, password is required here.';
});

after(async () => {
  if (hexo) {
    await hexo.exit();
  }
});

test('discovered theme list is non-empty', () => {
  assert.ok(THEMES.length > 0, 'expected at least one theme under lib/hbe.*.html');
});

for (const theme of THEMES) {
  test(`theme '${theme}' renders an encrypted post with all placeholders substituted`, () => {
    const slug = `encrypted-${theme}`;
    const post = postsBySlug.get(slug);
    assert.ok(post, `expected materialized post with slug ${slug} to exist`);

    assert.equal(post.encrypt, true, `post for theme '${theme}' must be flagged as encrypted`);

    const content = String(post.content || '');
    assert.ok(content.length > 0, `post content for theme '${theme}' must not be empty`);

    // Criterion 8: all 7 placeholder substitutions complete.
    assert.ok(
      !content.includes('{{hbe'),
      `theme '${theme}' content still contains an unrendered '{{hbe' placeholder`,
    );

    for (const attr of REQUIRED_DATA_ATTRS) {
      assert.ok(
        content.includes(attr),
        `theme '${theme}' content is missing required attribute '${attr}'`,
      );
    }

    assert.ok(
      content.includes(configuredMessage),
      `theme '${theme}' content does not embed the configured message text`,
    );
  });
}
