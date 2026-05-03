'use strict';

// Defence-in-depth contract checks for every theme. These run via HTTP
// (not a browser context) so they're cheap and catch server-side
// regressions even if a browser-level spec is skipped or quarantined.
//
// Asserts per theme:
//   - HTTP 200 response
//   - All five `data-*` attributes present (data-wpm, data-whm,
//     data-hmacdigest, data-keysalt, data-ivsalt)
//   - The password-input element (`<input ... id="hbePass">`) is rendered
//   - Zero unsubstituted `{{hbe…}}` placeholders remain

const fs = require('fs');
const path = require('path');

const { test, expect } = require('./fixtures');
const { discoverThemes } = require('../helpers/buildSite');

const THEMES_FILE = path.join(__dirname, '.themes.json');
const themes = fs.existsSync(THEMES_FILE)
  ? JSON.parse(fs.readFileSync(THEMES_FILE, 'utf8'))
  : discoverThemes();

const REQUIRED_DATA_ATTRS = [
  'data-hbe-format',
  'data-wpm',
  'data-whm',
  'data-salt',
  'data-nonce',
  'data-kdf-iterations',
  'data-auto-save',
];

// Wave 4 v4 SHELL contract: form + button + role=alert error region.
// Wire-format attribute swap deferred to Wave 6 (filter rewrite lands the
// substitution at the same time, so `npm test` stays green at every commit).
const REQUIRED_SHELL_SLOTS = [
  /id=["']hbeForm["']/,
  /id=["']hbePass["']/,
  /class=["'][^"']*\bhbe-button\b[^"']*["']/,
  /class=["'][^"']*\bhbe-error\b[^"']*["']/,
  /role=["']alert["']/,
];

for (const theme of themes) {
  test(`theme contract: ${theme}`, async ({ request }) => {
    const res = await request.get(`/encrypted-${theme}/`);
    expect(res.status(), `GET /encrypted-${theme}/`).toBe(200);

    const html = await res.text();

    for (const attr of REQUIRED_DATA_ATTRS) {
      expect(
        html,
        `${attr} missing from /encrypted-${theme}/ wrapper HTML`
      ).toContain(attr + '=');
    }

    for (const slotPattern of REQUIRED_SHELL_SLOTS) {
      expect(
        slotPattern.test(html),
        `theme '${theme}' missing v4 shell slot matching ${slotPattern}`
      ).toBe(true);
    }

    expect(
      html,
      `password input (#hbePass) missing from /encrypted-${theme}/`
    ).toMatch(/<input[^>]*id="hbePass"/);

    const leftoverPlaceholder = html.match(/\{\{hbe[A-Za-z]*\}\}/);
    expect(
      leftoverPlaceholder,
      `unsubstituted placeholder in /encrypted-${theme}/: ` +
        (leftoverPlaceholder && leftoverPlaceholder[0])
    ).toBeNull();
  });
}
