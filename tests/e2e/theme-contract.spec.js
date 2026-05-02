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
  'data-wpm',
  'data-whm',
  'data-hmacdigest',
  'data-keysalt',
  'data-ivsalt',
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
