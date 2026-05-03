'use strict';

// Browser-event-timing rule (per T6 plan):
//
//   ALL `page.on('console')`, `page.on('dialog')`, and
//   `hexo-blog-decrypt` window-event listeners must be registered BEFORE
//   the action that may fire them. Playwright cannot retroactively
//   capture events fired before subscription. For events that need to
//   survive a navigation (e.g. the autosave-cached reload spec), use
//   `page.addInitScript` so the listener is wired before the page's
//   own scripts execute.
//
// v4 wire-format notes (vs. v3):
//   - Wrong-password feedback is INLINE — text inside the wrapper's
//     `[role="alert"]` element. NO `alert()` dialog (Playwright's
//     `page.on('dialog')` will never fire under v4).
//   - localStorage cache key prefix is `hbe.v4.` (v3 was
//     `hexo-blog-encrypt:#`). The v3 prefix MUST stay absent —
//     `storage.js` purges any v3 leftovers on read.
//   - Cache-on-reload only happens when the post opts in via
//     `autoSave: true` in front-matter. Default is OFF.
//   - The decrypted DOM REPLACES the encrypted wrapper via
//     `parentNode.replaceChild`. The new container retains
//     `id="hexo-blog-encrypt"` but adds the class
//     `hbe-decrypted-content`. We assert on body text + that class
//     (NOT on the original wrapper still being present).
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
// Keep in sync with `defaultConfig.wrong_pass_message` in
// `src/server/config.js`.
const WRONG_PASS_MESSAGE =
  'Oh, this is an invalid password. Check and try again, please.';

// One-shot baseURL resolution probe: the FIRST spec to run asserts that
// the page didn't end up at about:blank. A misconfigured fixture (e.g.
// baseURL not propagated from globalSetup) would otherwise surface as a
// 30-second timeout, which is hard to diagnose.
let baseURLProbeDone = false;

// Helper: subscribe to the v4 'hexo-blog-decrypt' window CustomEvent
// BEFORE triggering submission. Returns a Playwright JSHandle promise
// that resolves with the dispatched `event.detail.mode` string
// ('manual' | 'cached'). Capturing the mode (not a boolean) lets a
// single helper power both the manual-decrypt and the autosave-cached
// reload assertions.
function listenForDecryptMode(page) {
  return page.evaluate(
    () => new Promise((resolve) => {
      window.addEventListener(
        'hexo-blog-decrypt',
        (e) => resolve((e && e.detail && e.detail.mode) || 'legacy'),
        { once: true }
      );
    })
  );
}

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
      const decryptMode = listenForDecryptMode(page);

      await page.locator('#hbePass').fill(PASSWORD);
      await page.locator('#hbePass').press('Enter');

      expect(await decryptMode).toBe('manual');

      await expect(page.locator('body')).toContainText(SECRET);

      // The fixture template embeds `<script>window.__seenScript = true;</script>`
      // inside the encrypted body. Verify the v3 script-resurrection trick
      // in `dom.js` (innerHTML-inserted scripts re-created as live nodes)
      // still executes user scripts after decryption — a regression here
      // would silently break user themes that depend on inline scripts.
      await expect.poll(
        () => page.evaluate(() => window.__seenScript === true),
        { timeout: 2000 }
      ).toBe(true);

      // The wrapper is replaced by a new element with the same id but
      // an added .hbe-decrypted-content class.
      await expect(page.locator('#hexo-blog-encrypt'))
        .toHaveClass(/hbe-decrypted-content/);

      // autoSave defaults to false → NOTHING should be written to
      // localStorage on a successful decrypt.
      const cacheCount = await page.evaluate(() =>
        Object.keys(localStorage)
          .filter((k) => k.startsWith('hbe.v4.'))
          .length
      );
      expect(cacheCount, 'autoSave default-off must not write localStorage')
        .toBe(0);

      expect(
        consoleErrors,
        `Console errors during decrypt:\n${consoleErrors.join('\n')}`
      ).toEqual([]);
    });

    test('wrong password shows inline alert (criterion 12)', async ({ page }) => {
      // Negative assertion: under v4 we MUST NOT trigger a browser
      // dialog. If one fires, fail the test loudly.
      page.on('dialog', (dialog) => {
        throw new Error(
          `v4 must not call alert(); got dialog "${dialog.message()}"`
        );
      });

      await page.goto(`/encrypted-${theme}/`);
      await expect(page.locator('#hbePass')).toBeVisible();

      await page.locator('#hbePass').fill('wrongpw');
      await page.locator('#hbePass').press('Enter');

      // Inline alert appears with the configured wrong-password message.
      await expect(
        page.locator('#hexo-blog-encrypt [role="alert"]')
      ).toHaveText(WRONG_PASS_MESSAGE);

      // The wrapper stays in place; secret never appears.
      await expect(page.locator('#hexo-blog-encrypt'))
        .not.toHaveClass(/hbe-decrypted-content/);
      await expect(page.locator('body')).not.toContainText(SECRET);

      // No localStorage write on failed decrypt.
      const cacheCount = await page.evaluate(() =>
        Object.keys(localStorage)
          .filter((k) => k.startsWith('hbe.v4.'))
          .length
      );
      expect(cacheCount).toBe(0);
    });

    test('reload re-prompts when autoSave default-off (criterion 13)', async ({ page }) => {
      // Decrypt once.
      await page.goto(`/encrypted-${theme}/`);

      const firstDecrypt = listenForDecryptMode(page);
      await page.locator('#hbePass').fill(PASSWORD);
      await page.locator('#hbePass').press('Enter');
      expect(await firstDecrypt).toBe('manual');
      await expect(page.locator('body')).toContainText(SECRET);

      // Reload — with autoSave OFF (default), the user MUST be re-prompted.
      // No 'hexo-blog-decrypt' event should fire on its own.
      await page.addInitScript(() => {
        window.__hbeDecryptCount = 0;
        window.addEventListener('hexo-blog-decrypt', () => {
          window.__hbeDecryptCount += 1;
        });
      });

      await page.reload();

      // Password input is back, secret is gone.
      await expect(page.locator('#hbePass')).toBeVisible();
      await expect(page.locator('#hexo-blog-encrypt'))
        .not.toHaveClass(/hbe-decrypted-content/);
      await expect(page.locator('body')).not.toContainText(SECRET);

      // localStorage stayed empty across the reload.
      const cacheCount = await page.evaluate(() =>
        Object.keys(localStorage)
          .filter((k) => k.startsWith('hbe.v4.'))
          .length
      );
      expect(cacheCount, 'autoSave default-off: nothing in localStorage').toBe(0);

      // No auto-decrypt event fired.
      const fireCount = await page.evaluate(() => window.__hbeDecryptCount);
      expect(fireCount).toBe(0);
    });
  });
}

// ─── Single-theme global v4 specs ────────────────────────────────────────

test.describe('v4 UX (single-theme)', () => {
  test('button click decrypts (not just Enter key)', async ({ page }) => {
    await page.goto('/encrypted-default/');
    await expect(page.locator('#hbePass')).toBeVisible();

    const mode = listenForDecryptMode(page);

    await page.locator('#hbePass').fill(PASSWORD);
    // Click the visible Decrypt button — separate codepath from Enter.
    await page.locator('#hexo-blog-encrypt .hbe-button').click();

    expect(await mode).toBe('manual');
    await expect(page.locator('body')).toContainText(SECRET);
  });

  test('autoSave opt-in: reload auto-decrypts and emits mode="cached"', async ({ page }) => {
    await page.goto('/autosave-default/');

    // 1) First decrypt — should emit 'manual'.
    const firstMode = listenForDecryptMode(page);
    await page.locator('#hbePass').fill(PASSWORD);
    await page.locator('#hbePass').press('Enter');
    expect(await firstMode).toBe('manual');
    await expect(page.locator('body')).toContainText(SECRET);

    // localStorage entry must exist after a successful autoSave decrypt.
    await expect.poll(
      () => page.evaluate(() =>
        Object.keys(localStorage).some((k) => k.startsWith('hbe.v4.'))
      ),
      { timeout: 5000 }
    ).toBe(true);

    // 2) Install a window listener that survives navigation, then reload.
    await page.addInitScript(() => {
      window.__hbeAutoMode = null;
      window.addEventListener('hexo-blog-decrypt', (e) => {
        window.__hbeAutoMode = (e && e.detail && e.detail.mode) || 'legacy';
      });
    });

    await page.reload();

    // 3) No password interaction — auto-decrypt should fire with mode='cached'.
    await expect.poll(
      () => page.evaluate(() => window.__hbeAutoMode),
      { timeout: 3000 }
    ).toBe('cached');

    await expect(page.locator('body')).toContainText(SECRET);
    // Cleanup so this fixture's localStorage doesn't leak into other specs
    // that share the worker's storage state.
    await page.evaluate(() => {
      Object.keys(localStorage)
        .filter((k) => k.startsWith('hbe.v4.'))
        .forEach((k) => localStorage.removeItem(k));
    });
  });

  test('legacy event listener (no detail access) still fires', async ({ page }) => {
    await page.goto('/encrypted-default/');

    // v3-style listener: just counts fires, doesn't read detail.
    // Must continue to work under v4 to honour the documented public API.
    const fired = page.evaluate(() => new Promise((resolve) => {
      window.addEventListener('hexo-blog-decrypt', function legacyHandler() {
        resolve(true);
      }, { once: true });
    }));

    await page.locator('#hbePass').fill(PASSWORD);
    await page.locator('#hbePass').press('Enter');

    expect(await fired).toBe(true);
    await expect(page.locator('body')).toContainText(SECRET);
  });

  test('stale decryptor (data-hbe-format mismatch) shows friendly abort', async ({ page }) => {
    // Simulate the "newer-server / older-bundle" scenario by serving an
    // otherwise-valid v4 page mutated to advertise format 3. The bundle
    // checks SUPPORTED_FORMAT and renders a clear upgrade-needed message
    // INLINE (no alert(), no exception thrown to the console).
    await page.route('**/encrypted-default/', async (route) => {
      const response = await route.fetch();
      const body = await response.text();
      const mutated = body.replace(
        /data-hbe-format="4"/,
        'data-hbe-format="3"'
      );
      await route.fulfill({ response, body: mutated });
    });

    page.on('dialog', (dialog) => {
      throw new Error(
        `v4 stale-format must not call alert(); got "${dialog.message()}"`
      );
    });

    await page.goto('/encrypted-default/');
    await expect(
      page.locator('#hexo-blog-encrypt [role="alert"]')
    ).toContainText(/incompatible plugin version|Rebuild the site/i);

    // Secret never appears; submit handler still NOT wired (or wired but
    // a no-op since bootstrap returned early).
    await expect(page.locator('body')).not.toContainText(SECRET);
  });

  test('tampered ciphertext fails closed with the wrong-password message', async ({ page }) => {
    // GCM authentication failure is — by design — indistinguishable from
    // a wrong password. Mutating one hex digit of the ciphertext must
    // surface the SAME inline `wrong_pass_message`, never expose plaintext,
    // never throw to the console.
    const consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('dialog', (dialog) => {
      throw new Error(
        `v4 tampered-ciphertext must not call alert(); got "${dialog.message()}"`
      );
    });

    await page.route('**/encrypted-default/', async (route) => {
      const response = await route.fetch();
      const body = await response.text();
      // Flip the FIRST hex digit of the ciphertext block. The script tag
      // is `<script id="hbeData" type="hbeData">…hex…</script>`.
      const re = /(<script id="hbeData"[^>]*>\s*)([0-9a-f])/i;
      expect(re.test(body), 'expected hbeData script in served HTML').toBe(true);
      const mutated = body.replace(re, (_m, prefix, first) => {
        const flipped = first === '0' ? '1' : '0';
        return prefix + flipped;
      });
      await route.fulfill({ response, body: mutated });
    });

    await page.goto('/encrypted-default/');
    await page.locator('#hbePass').fill(PASSWORD);
    await page.locator('#hbePass').press('Enter');

    await expect(
      page.locator('#hexo-blog-encrypt [role="alert"]')
    ).toHaveText(WRONG_PASS_MESSAGE);
    await expect(page.locator('body')).not.toContainText(SECRET);

    expect(
      consoleErrors,
      `Console errors during tampered-ciphertext decrypt attempt:\n${consoleErrors.join('\n')}`
    ).toEqual([]);
  });

  // ─────────────────────────────────────────────────────────────────────
  // Tag-encryption regression: the post has NO front-matter `password:`.
  // Encryption is driven by `_config.yml.encrypt.tags` matching the
  // post's `tags:` (`TagOnly` → `tagsecret`). v3 used `data.tags.forEach`
  // which works on Hexo's Warehouse Query; an earlier Wave-7 attempt used
  // `Array.isArray(data.tags)` which was FALSE for real Hexo posts and
  // SILENTLY skipped encryption — publishing the post in plaintext.
  // This pair of assertions (static-HTML guard + browser-decrypt) keeps
  // that bug from regressing.
  // ─────────────────────────────────────────────────────────────────────
  test('tag-only encryption: static HTML never contains plaintext (server-side regression)', async () => {
    const fixturePublic = path.join(
      __dirname, '..', 'fixtures', 'hexo-site', 'public',
      'tag-only-encrypted', 'index.html'
    );
    expect(fs.existsSync(fixturePublic),
      `tag-only post must be generated at ${fixturePublic}`).toBe(true);
    const html = fs.readFileSync(fixturePublic, 'utf8');
    expect(html, 'tag-only-encrypted post must NOT leak plaintext')
      .not.toContain('OPEN-SESAME-TAG-ONLY');
    expect(html, 'tag-only-encrypted post MUST be wrapped in hbeData')
      .toContain('id="hbeData"');
    expect(html).toContain('data-hbe-format="4"');
  });

  test('tag-only encryption: decrypts in browser with the tag password', async ({ page }) => {
    await page.goto('/tag-only-encrypted/');
    await expect(page.locator('#hbePass')).toBeVisible();

    const mode = listenForDecryptMode(page);
    await page.locator('#hbePass').fill('tagsecret');
    await page.locator('#hbePass').press('Enter');

    expect(await mode).toBe('manual');
    await expect(page.locator('body')).toContainText('OPEN-SESAME-TAG-ONLY');
  });

  // ─────────────────────────────────────────────────────────────────────
  // Public callback regression: an inline `<script>` inside the
  // encrypted body wires up a `hexo-blog-decrypt` window listener that
  // calls `window.alert(...)`. v4 must execute that script after
  // decryption (via `dom.js#convertHTMLToElement` re-creating script
  // nodes as live elements) AND must dispatch the event AFTER the DOM
  // swap, so the listener catches it. Regression for the public hook
  // documented in both READMEs.
  // ─────────────────────────────────────────────────────────────────────
  test('decryption callback: inline <script> sees hexo-blog-decrypt event and fires alert()', async ({ page }) => {
    const consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    let dialogMessage = null;
    page.on('dialog', async (dialog) => {
      dialogMessage = dialog.message();
      await dialog.dismiss();
    });

    await page.goto('/callback-fixture/');
    await expect(page.locator('#hbePass')).toBeVisible();

    await page.locator('#hbePass').fill(PASSWORD);
    await page.locator('#hbePass').press('Enter');

    // The decrypted content must reveal — proves the alert() did NOT
    // block the reveal flow (alert is async-handled in Playwright).
    await expect(page.locator('body')).toContainText('CALLBACK-FIRED-7F2A');

    // Poll because dialog handlers fire on a microtask after the
    // alert() call inside the listener.
    await expect.poll(() => dialogMessage, { timeout: 2000 })
      .toMatch(/Decryption callback fired! mode = manual/);

    expect(
      consoleErrors,
      `Console errors during callback decrypt:\n${consoleErrors.join('\n')}`
    ).toEqual([]);
  });
});
