'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const themesDoc = path.join(repoRoot, 'docs', 'THEMES.md');
const contributing = path.join(repoRoot, '.github', 'CONTRIBUTING.md');
const codeowners = path.join(repoRoot, '.github', 'CODEOWNERS');
const prTemplate = path.join(repoRoot, '.github', 'PULL_REQUEST_TEMPLATE.md');

const REQUIRED_PLACEHOLDERS = [
  '{{hbeFormat}}',
  '{{hbeWrongPassMessage}}',
  '{{hbeWrongHashMessage}}',
  '{{hbeKdfIterations}}',
  '{{hbeAutoSave}}',
  '{{hbeMessage}}',
  '{{hbeButtonText}}',
  '{{hbeSalt}}',
  '{{hbeNonce}}',
  '{{hbeEncryptedData}}'
];

const REQUIRED_DATA_ATTR_NAMES = [
  'data-hbe-format',
  'data-wpm',
  'data-whm',
  'data-salt',
  'data-nonce',
  'data-kdf-iterations',
  'data-auto-save'
];

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

test('docs/THEMES.md exists and encodes the v4 one-file theme drop contract', () => {
  assert.ok(fs.existsSync(themesDoc), 'docs/THEMES.md must exist');
  const body = read(themesDoc);
  assert.ok(
    body.includes('`lib/hbe.<name>.html`'),
    'docs/THEMES.md must reference the literal `lib/hbe.<name>.html` drop path'
  );
  assert.ok(
    /^##\s+Required placeholders\s*$/m.test(body),
    'docs/THEMES.md must contain a "## Required placeholders" heading'
  );
  for (const placeholder of REQUIRED_PLACEHOLDERS) {
    assert.ok(
      body.includes(placeholder),
      `docs/THEMES.md must list placeholder ${placeholder}`
    );
  }
  for (const attrName of REQUIRED_DATA_ATTR_NAMES) {
    assert.ok(
      body.includes(attrName),
      `docs/THEMES.md must reference v4 data attribute "${attrName}"`
    );
  }
  // The v3 IIFE was removed in v4; the doc must NOT advertise it as the
  // browser-side asset path or theme authors will follow a dead link.
  assert.ok(
    !/`lib\/hbe\.js`/.test(body),
    'docs/THEMES.md must not reference the deleted v3 `lib/hbe.js` asset'
  );
  // Likewise the v3-only HMAC/CBC placeholders must not be re-introduced.
  for (const stale of ['{{hbeHmacDigest}}', '{{hbeKeySalt}}', '{{hbeIvSalt}}']) {
    assert.ok(
      !body.includes(stale),
      `docs/THEMES.md must not reference removed v3 placeholder ${stale}`
    );
  }
});

test('docs/THEMES.md stays focused (≤ 200 lines)', () => {
  const lines = read(themesDoc).split('\n').length;
  assert.ok(
    lines <= 200,
    `docs/THEMES.md must be ≤ 200 lines (found ${lines})`
  );
});

test('.github/CONTRIBUTING.md documents the staged branch-protection rollout', () => {
  assert.ok(fs.existsSync(contributing), '.github/CONTRIBUTING.md must exist');
  const body = read(contributing);
  assert.ok(
    /^##\s+Branch protection rollout\s*$/m.test(body),
    '.github/CONTRIBUTING.md must contain a "## Branch protection rollout" section'
  );

  const sectionStart = body.search(/^##\s+Branch protection rollout\s*$/m);
  assert.ok(sectionStart >= 0, 'rollout section start not found');
  // Skip past the heading line so "Branch protection rollout" itself doesn't
  // match the body-step searches below.
  const afterHeading = body.indexOf('\n', sectionStart) + 1;
  const section = body.slice(afterHeading);

  const idxWorkflow = section.search(/\bworkflow/i);
  const idxGreen = section.search(/3\s+(?:consecutive\s+)?green/i);
  // The "required check" step must come AFTER the green-PRs step, so anchor
  // the search past idxGreen to avoid matching the intro "required checks safely" line.
  const tailFromGreen = idxGreen >= 0 ? section.slice(idxGreen) : '';
  const requiredOffset = tailFromGreen.search(/requir(?:e|ed)\s+(?:status\s+)?check/i);
  const idxRequired = idxGreen >= 0 && requiredOffset >= 0 ? idxGreen + requiredOffset : -1;
  const idxProtection = section.search(/branch\s+protection\s+rule/i);

  assert.ok(idxWorkflow >= 0, 'rollout section must mention the workflow merge step');
  assert.ok(idxGreen > idxWorkflow, 'rollout section must mention 3 green PR runs after workflow merge');
  assert.ok(idxRequired > idxGreen, 'rollout section must mention requiring the status check after 3 green runs');
  assert.ok(idxProtection > idxWorkflow, 'rollout section must mention the branch protection rule');
  assert.ok(
    idxRequired > idxGreen && idxProtection >= idxGreen,
    'rollout steps must appear in order: workflow → 3 green PRs → required check → branch protection rule'
  );
});

test('.github/CODEOWNERS exists and assigns @D0n9X1n as default owner', () => {
  assert.ok(fs.existsSync(codeowners), '.github/CODEOWNERS must exist');
  const body = read(codeowners).trim();
  assert.ok(body.length > 0, 'CODEOWNERS must not be empty');
  assert.ok(
    /^\s*\*\s+@D0n9X1n\b/m.test(body),
    'CODEOWNERS must contain a `* @D0n9X1n` default rule'
  );
});

test('.github/PULL_REQUEST_TEMPLATE.md adds an `npm run test` checklist item', () => {
  assert.ok(fs.existsSync(prTemplate), '.github/PULL_REQUEST_TEMPLATE.md must exist');
  const body = read(prTemplate);
  assert.ok(
    /-\s+\[\s?\]\s+.*`npm run test`/.test(body),
    'PR template must contain a checklist line referencing `npm run test`'
  );
});

test('Both READMEs explain WHY to upgrade from v3 BEFORE explaining HOW', () => {
  // The "Upgrading from v3" section is the procedural how-to. The
  // "why upgrade" section motivates the upgrade with concrete, named
  // benefits (security + UX) so a reader can decide whether the rebuild
  // is worth their time. Order matters: motivation precedes mechanics.
  for (const readme of ['ReadMe.md', 'ReadMe.zh.md']) {
    const body = read(path.join(repoRoot, readme));

    const whyMatch = body.search(
      /^##\s+(?:Why upgrade(?: from v3)?\??|为什么.*升级|为什么要升级.*v3)\s*$/m
    );
    const howMatch = body.search(/^##\s+(?:Upgrading from v3|从\s*v3\s*升级)\s*$/m);

    assert.ok(
      whyMatch >= 0,
      `${readme} must contain a "Why upgrade from v3" section explaining benefits`
    );
    assert.ok(
      howMatch >= 0,
      `${readme} must contain an "Upgrading from v3" procedural section`
    );
    assert.ok(
      whyMatch < howMatch,
      `${readme}: the "Why upgrade" section must appear BEFORE the "Upgrading from v3" steps`
    );

    // The why-section must call out at least the four headline reasons
    // (auth-encryption upgrade, per-post salt, stronger KDF, privacy
    // default) so we don't accidentally publish a vague paragraph that
    // satisfies the heading check without saying anything substantive.
    const sectionEnd = body.indexOf('\n## ', whyMatch + 1);
    const whySection = body.slice(whyMatch, sectionEnd > 0 ? sectionEnd : body.length);

    const required = [
      /AES[- ]?256[- ]?GCM|AES-GCM/i,            // auth-encryption upgrade
      /salt/i,                                    // per-post salt
      /PBKDF2|iteration|600[_,]?000|250[_,]?000/i, // stronger KDF defaults
      /autoSave|localStorage/i                    // privacy-default flip
    ];
    for (const re of required) {
      assert.ok(
        re.test(whySection),
        `${readme} "Why upgrade" section must mention ${re} (regex)`
      );
    }
  }
});

test('Both READMEs use only valid, this-repo badges (no stale legacy-fork pointers)', () => {
  // The README header lists badges. Every badge must:
  //   (1) point at THIS repository or this npm package — not the
  //       upstream legacy `MikeCoder/hexo-blog-encrypt` fork that
  //       hasn't been rebuilt since 2023; and
  //   (2) actually exist as a render-able shield (shields.io URL or
  //       a GitHub workflow badge SVG).
  // Concretely we forbid the two stale Scrutinizer badges and require
  // the four core "always-green" badges (release / npm / license /
  // Tests workflow). This test fails closed if any future contributor
  // re-adds the dead badges or drops a core one.
  const FORBIDDEN_BADGE_HOSTS = [
    'scrutinizer-ci.com',
    'MikeCoder/hexo-blog-encrypt'
  ];
  const REQUIRED_BADGE_PATTERNS = [
    /img\.shields\.io\/github\/v\/release\/D0n9X1n\/hexo-blog-encrypt/, // release
    /img\.shields\.io\/npm\/v\/hexo-blog-encrypt/,                       // npm version
    /img\.shields\.io\/npm\/(?:l|dm)\/hexo-blog-encrypt/,                // license / downloads (npm)
    /actions\/workflows\/test\.yml\/badge\.svg/,                         // CI workflow badge
    /badge\/demo-online-brightgreen/                                     // live-demo static badge
  ];
  for (const readme of ['ReadMe.md', 'ReadMe.zh.md']) {
    const body = read(path.join(repoRoot, readme));
    // Restrict the check to actual badge lines — `[![alt](shield-url)](link)`.
    // The intro area legitimately references the upstream repo and historical
    // issues there for context; we only forbid stale badges, not all mentions.
    const badgeLines = body
      .split('\n')
      .filter((line) => /^\[!\[[^\]]+\]\([^)]+\)\]\(/.test(line));
    assert.ok(
      badgeLines.length >= REQUIRED_BADGE_PATTERNS.length,
      `${readme} must have at least ${REQUIRED_BADGE_PATTERNS.length} badge lines, found ${badgeLines.length}`
    );
    const header = badgeLines.join('\n');

    for (const forbidden of FORBIDDEN_BADGE_HOSTS) {
      assert.ok(
        !header.includes(forbidden),
        `${readme} badges must not reference ${forbidden} (legacy fork or dead service)`
      );
    }
    for (const required of REQUIRED_BADGE_PATTERNS) {
      assert.ok(
        required.test(header),
        `${readme} badges must contain one matching ${required}`
      );
    }
  }
});
