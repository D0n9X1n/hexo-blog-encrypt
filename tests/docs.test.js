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
