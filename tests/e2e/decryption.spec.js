'use strict';

// Browser-event-timing rule (per T6 plan):
//
//   ALL `page.on('console')`, `page.on('dialog')`, and
//   `hexo-blog-decrypt` window-event listeners must be registered BEFORE
//   the action that may fire them. Playwright cannot retroactively
//   capture events fired before subscription. For events that need to
//   survive a navigation (e.g. the cache-reload spec), use
//   `page.addInitScript` so the listener is wired before the page's
//   own scripts execute.
//
// Determinism rule: never assert on ciphertext bytes — only on
// decryption outcomes (the secret text appearing, the cache key being
// written, the alert message, etc.).

const fs = require('fs');
const path = require('path');

const { test, expect } = require('./fixtures');
const { discoverThemes } = require('../helpers/buildSite');

const THEMES_FILE = path.join(__dirname, '.themes.json');
const themes = fs.existsSync(THEMES_FILE)
  ? JSON.parse(fs.readFileSync(THEMES_FILE, 'utf8'))
  : discoverThemes();

const SECRET = 'THE SECRET IS BUTTERFLY';
const PASSWORD = 'hello';
// Keep in sync with `defaultConfig.wrong_pass_message` in `index.js`.
const WRONG_PASS_MESSAGE =
  'Oh, this is an invalid password. Check and try again, please.';

// One-shot baseURL resolution probe: the FIRST spec to run asserts that
// the page didn't end up at about:blank. A misconfigured fixture (e.g.
// baseURL not propagated from globalSetup) would otherwise surface as a
// 30-second timeout, which is hard to diagnose.
let baseURLProbeDone = false;

for (const theme of themes) {
  test.describe.parallel('theme: ' + theme, () => {
    test('right password decrypts (criteria 10 + 11)', async ({ page }) => {
      const consoleErrors = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
      });

      await page.goto(`/encrypted-${theme}/`);

      if (!baseURLProbeDone) {
        expect(page.url(), 'baseURL did not propagate from globalSetup')
          .not.toBe('about:blank');
        baseURLProbeDone = true;
      }

      await expect(page.locator('#hexo-blog-encrypt')).toBeVisible();
      await expect(page.locator('#hbePass')).toBeVisible();
      await expect(page.locator('body')).not.toContainText(SECRET);

      // Subscribe BEFORE the action that fires the event.
      const decrypted = page.evaluate(
        () => new Promise((resolve) => {
          window.addEventListener(
            'hexo-blog-decrypt',
            () => resolve(true),
            { once: true }
          );
        })
      );

      await page.locator('#hbePass').fill(PASSWORD);
      await page.locator('#hbePass').press('Enter');

      await decrypted;

      await expect(page.locator('body')).toContainText(SECRET);

      // localStorage write happens in a separate microtask after the
      // event dispatch — poll briefly so we don't race lib/hbe.js.
      await expect.poll(
        () => page.evaluate(
          () => Object.keys(localStorage)
            .some((k) => k.startsWith('hexo-blog-encrypt:#'))
        ),
        { timeout: 5000 }
      ).toBe(true);

      expect(
        consoleErrors,
        `Console errors during decrypt:\n${consoleErrors.join('\n')}`
      ).toEqual([]);
    });

    test('wrong password alerts (criterion 12)', async ({ page }) => {
      let dialogText = null;
      page.on('dialog', (dialog) => {
        dialogText = dialog.message();
        dialog.dismiss().catch(() => { /* ignore */ });
      });

      await page.goto(`/encrypted-${theme}/`);
      await expect(page.locator('#hbePass')).toBeVisible();

      await page.locator('#hbePass').fill('wrongpw');
      await page.locator('#hbePass').press('Enter');

      await expect.poll(() => dialogText, { timeout: 5000 })
        .toBe(WRONG_PASS_MESSAGE);

      await expect(page.locator('body')).not.toContainText(SECRET);

      const cacheCount = await page.evaluate(
        () => Object.keys(localStorage)
          .filter((k) => k.startsWith('hexo-blog-encrypt:'))
          .length
      );
      expect(cacheCount).toBe(0);
    });

    test('cache reload auto-decrypts (criterion 13)', async ({ page }) => {
      // 1) Right-password decrypt to populate localStorage.
      await page.goto(`/encrypted-${theme}/`);

      const firstDecrypt = page.evaluate(
        () => new Promise((resolve) => {
          window.addEventListener(
            'hexo-blog-decrypt',
            () => resolve(true),
            { once: true }
          );
        })
      );

      await page.locator('#hbePass').fill(PASSWORD);
      await page.locator('#hbePass').press('Enter');
      await firstDecrypt;

      // Wait for the cache write before reloading (it happens after the
      // event in lib/hbe.js).
      await expect.poll(
        () => page.evaluate(
          () => Object.keys(localStorage)
            .some((k) => k.startsWith('hexo-blog-encrypt:#'))
        ),
        { timeout: 5000 }
      ).toBe(true);

      // 2) Install a listener that survives navigation — addInitScript
      //    runs before the page's own scripts on every navigation, so
      //    the listener is in place before lib/hbe.js fires the event.
      await page.addInitScript(() => {
        window.__hbeAutoDecryptFired = false;
        window.addEventListener('hexo-blog-decrypt', () => {
          window.__hbeAutoDecryptFired = true;
        });
      });

      // 3) Reload — no password interaction.
      await page.reload();

      await expect.poll(
        () => page.evaluate(() => window.__hbeAutoDecryptFired === true),
        { timeout: 2000 }
      ).toBe(true);

      await expect(page.locator('body')).toContainText(SECRET);
    });
  });
}
