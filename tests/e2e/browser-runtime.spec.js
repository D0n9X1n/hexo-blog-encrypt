'use strict';

// Browser-runtime regressions that are not tied to one theme: several
// encrypted posts on one page, PJAX re-initialisation, Web Crypto
// capability errors, retry UX, saved-key cleanup and localized strings.
//
// Listeners that must survive navigation are installed with
// `page.addInitScript`, so they exist before the bundle runs.

const { test, expect } = require('./fixtures');

const MULTI = '/multi-posts/';
const ALPHA = { slug: 'multi-post-alpha', password: 'alpha-pass', secret: 'ALPHA-SECRET-31C4' };
const BRAVO = { slug: 'multi-post-bravo', password: 'bravo-pass', secret: 'BRAVO-SECRET-8D2E' };
const WRONG_PASS_MESSAGE =
  'Oh, this is an invalid password. Check and try again, please.';

function post(page, slug) {
  return page.locator(`article[data-slug="${slug}"]`);
}

// Record every hexo-blog-decrypt event with the post it came from.
async function recordDecryptEvents(page) {
  await page.addInitScript(() => {
    window.__hbeEvents = [];
    window.addEventListener('hexo-blog-decrypt', (e) => {
      const el = e.detail && e.detail.element;
      const article = el && el.closest ? el.closest('article') : null;
      window.__hbeEvents.push({
        mode: e.detail && e.detail.mode,
        slug: article ? article.dataset.slug : null,
        connected: !!(el && el.isConnected),
      });
    });
  });
}

const events = (page) => page.evaluate(() => window.__hbeEvents);

test.describe('multiple encrypted posts on one page (#246)', () => {
  test.afterEach(async ({ page }) => {
    await page.evaluate(() => localStorage.clear()).catch(() => {});
  });

  test('each post unlocks independently even though the bundle runs once per post', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await recordDecryptEvents(page);
    await page.goto(MULTI);

    // The fixture really executes the bundle twice.
    await expect(page.locator('script[data-pjax][src*="/lib/hbe."]')).toHaveCount(2);

    const alpha = post(page, ALPHA.slug);
    const bravo = post(page, BRAVO.slug);
    const alphaInput = alpha.locator('input[type="password"]');
    const bravoInput = bravo.locator('input[type="password"]');
    await expect(alphaInput).toBeVisible();
    await expect(bravoInput).toBeVisible();

    // Each label still points at its own input.
    const ids = await page.locator('.hbe-container input[type="password"]')
      .evaluateAll((inputs) => inputs.map((i) => i.id));
    expect(new Set(ids).size, `password input ids must be unique: ${ids}`).toBe(2);
    for (const article of [alpha, bravo]) {
      const pair = await article.evaluate((a) => ({
        input: a.querySelector('input[type="password"]').id,
        label: a.querySelector('label').htmlFor,
      }));
      expect(pair.label).toBe(pair.input);
    }

    // A wrong password on the second post reports only there.
    await bravoInput.fill('nope');
    await bravoInput.press('Enter');
    await expect(bravo.locator('[role="alert"]')).toHaveText(WRONG_PASS_MESSAGE);
    await expect(alpha.locator('[role="alert"]')).toHaveText('');

    // Unlock the SECOND post first: the first one must stay locked.
    await bravoInput.fill(BRAVO.password);
    await bravo.locator('.hbe-button').click();
    await expect(bravo).toContainText(BRAVO.secret);
    await expect(alpha).not.toContainText(ALPHA.secret);
    await expect(alphaInput).toBeVisible();

    await alphaInput.fill(ALPHA.password);
    await alphaInput.press('Enter');
    await expect(alpha).toContainText(ALPHA.secret);

    // One event per reveal, each carrying its own decrypted element.
    await expect.poll(() => events(page)).toEqual([
      { mode: 'manual', slug: BRAVO.slug, connected: true },
      { mode: 'manual', slug: ALPHA.slug, connected: true },
    ]);
    await expect(page.locator('.hbe-decrypted-content#hexo-blog-encrypt')).toHaveCount(2);

    // autoSave is on for both: two independent cache entries.
    const saved = await page.evaluate(() => Object.keys(localStorage)
      .filter((k) => k.startsWith('hbe.v4.'))
      .map((k) => JSON.parse(localStorage.getItem(k)).salt));
    expect(saved).toHaveLength(2);
    expect(new Set(saved).size).toBe(2);

    // Reload: both posts auto-decrypt from their own cache entries.
    await page.reload();
    await expect(alpha).toContainText(ALPHA.secret);
    await expect(bravo).toContainText(BRAVO.secret);
    await expect.poll(async () => (await events(page)).map((e) => e.mode + ':' + e.slug).sort())
      .toEqual(['cached:' + ALPHA.slug, 'cached:' + BRAVO.slug]);
    expect(errors).toEqual([]);
  });

  test('a third execution of the bundle does not attach duplicate handlers', async ({ page }) => {
    await recordDecryptEvents(page);
    await page.goto(MULTI);
    await expect(post(page, ALPHA.slug).locator('input[type="password"]')).toBeVisible();

    // Execute the bundle once more, as a PJAX theme re-running data-pjax scripts would.
    await page.evaluate(() => new Promise((resolve) => {
      const s = document.createElement('script');
      s.src = document.querySelector('script[data-pjax][src*="/lib/hbe."]').src;
      s.onload = resolve;
      document.body.appendChild(s);
    }));

    const input = post(page, ALPHA.slug).locator('input[type="password"]');
    await input.fill(ALPHA.password);
    await input.press('Enter');
    await expect(post(page, ALPHA.slug)).toContainText(ALPHA.secret);
    await expect.poll(() => events(page)).toEqual([
      { mode: 'manual', slug: ALPHA.slug, connected: true },
    ]);
  });
});

// Simulate a PJAX theme: fetch the next page, swap <body> content without a
// reload, optionally re-execute `data-pjax` scripts (as Butterfly/NexT do),
// then fire the library's completion event(s) on `document`.
async function pjaxNavigate(page, url, { runScripts = false, events: names = ['pjax:complete'] } = {}) {
  await page.evaluate(async ({ url, runScripts, names }) => {
    const html = await (await fetch(url)).text();
    const next = new DOMParser().parseFromString(html, 'text/html');
    document.body.innerHTML = next.body.innerHTML;
    history.pushState(null, '', url);
    if (runScripts) {
      for (const old of document.body.querySelectorAll('script[data-pjax]')) {
        await new Promise((resolve) => {
          const s = document.createElement('script');
          s.src = old.src;
          s.onload = s.onerror = resolve;
          old.replaceWith(s);
        });
      }
    }
    for (const name of names) document.dispatchEvent(new Event(name));
  }, { url, runScripts, names });
}

test.describe('PJAX / SPA navigation (#253)', () => {
  test.afterEach(async ({ page }) => {
    await page.evaluate(() => localStorage.clear()).catch(() => {});
  });

  test('plain -> encrypted -> encrypted without reload: one init, one event per reveal', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await recordDecryptEvents(page);
    await page.goto('/plain-page/');
    await expect(page.locator('body')).toContainText('PLAIN-PAGE-NO-ENCRYPTION');
    expect(await page.evaluate(() => typeof window.hexoBlogEncrypt)).toBe('undefined');

    // 1) First encrypted page: the theme re-runs the bundle AND fires both events.
    await pjaxNavigate(page, '/encrypted-default/', {
      runScripts: true, events: ['pjax:send', 'pjax:complete', 'pjax:success'],
    });
    expect(await page.evaluate(() => typeof window.hexoBlogEncrypt.init)).toBe('function');
    await page.locator('#hbePass').fill('hello');
    await page.locator('#hbePass').press('Enter');
    await expect(page.locator('body')).toContainText('THE SECRET IS BUTTERFLY');
    await expect.poll(() => events(page)).toEqual([{ mode: 'manual', slug: null, connected: true }]);

    // 2) Second encrypted page (two posts): bundle re-run again + events.
    await pjaxNavigate(page, MULTI, { runScripts: true, events: ['pjax:complete', 'pjax:success'] });
    const input = post(page, BRAVO.slug).locator('input[type="password"]');
    await input.fill(BRAVO.password);
    await input.press('Enter');
    await expect(post(page, BRAVO.slug)).toContainText(BRAVO.secret);
    await expect(post(page, ALPHA.slug).locator('input[type="password"]')).toBeVisible();
    await expect.poll(async () => (await events(page)).length).toBe(2);
    expect((await events(page))[1]).toEqual({ mode: 'manual', slug: BRAVO.slug, connected: true });
    expect(errors).toEqual([]);
  });

  for (const name of ['pjax:complete', 'pjax:success', 'swup:contentReplaced', 'turbo:load']) {
    test(`'${name}' alone initializes swapped-in posts (scripts not re-run)`, async ({ page }) => {
      await recordDecryptEvents(page);
      await page.goto('/encrypted-default/');
      await page.locator('#hbePass').fill('hello');
      await page.locator('#hbePass').press('Enter');
      await expect(page.locator('body')).toContainText('THE SECRET IS BUTTERFLY');

      await pjaxNavigate(page, MULTI, { events: [name] });
      const input = post(page, ALPHA.slug).locator('input[type="password"]');
      await input.fill(ALPHA.password);
      await input.press('Enter');
      await expect(post(page, ALPHA.slug)).toContainText(ALPHA.secret);
      await expect.poll(async () => (await events(page)).length).toBe(2);
    });
  }

  test('hexoBlogEncrypt.init(root) is idempotent and scoped to root', async ({ page }) => {
    await recordDecryptEvents(page);
    await page.goto('/encrypted-default/');
    await expect(page.locator('#hbePass')).toBeVisible();
    // Inject another page's post and init only that subtree, repeatedly.
    await page.evaluate(async (url) => {
      const html = await (await fetch(url)).text();
      const box = document.createElement('section');
      box.id = 'injected';
      box.innerHTML = new DOMParser().parseFromString(html, 'text/html')
        .querySelector('article[data-slug="multi-post-alpha"]').outerHTML;
      document.body.appendChild(box);
      window.hexoBlogEncrypt.init(box);
      window.hexoBlogEncrypt.init(box);
      window.hexoBlogEncrypt.init();
    }, MULTI);
    const input = page.locator('#injected input[type="password"]');
    await input.fill(ALPHA.password);
    await input.press('Enter');
    await expect(page.locator('#injected')).toContainText(ALPHA.secret);
    await expect.poll(() => events(page)).toEqual([{ mode: 'manual', slug: ALPHA.slug, connected: true }]);
  });
});

test.describe('missing Web Crypto (#254)', () => {
  const NO_CRYPTO = /HTTPS/;

  test('crypto.subtle undefined: actionable message instead of "wrong password"', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window.crypto, 'subtle', { value: undefined, configurable: true });
    });
    await page.goto('/encrypted-default/');
    const alert = page.locator('#hexo-blog-encrypt [role="alert"]');
    // Shown up front, before the reader types anything.
    await expect(alert).toContainText(NO_CRYPTO);

    await page.locator('#hbePass').fill('hello');
    await page.locator('#hbePass').press('Enter');
    await expect(alert).toContainText(NO_CRYPTO);
    await expect(alert).not.toHaveText(WRONG_PASS_MESSAGE);
    await expect(page.locator('body')).not.toContainText('THE SECRET IS BUTTERFLY');
  });

  test('insecure context: message shown and no key derivation attempted', async ({ page }) => {
    await page.addInitScript(() => {
      window.__subtleCalls = 0;
      for (const name of ['importKey', 'deriveKey', 'decrypt']) {
        const original = SubtleCrypto.prototype[name];
        SubtleCrypto.prototype[name] = function (...args) {
          window.__subtleCalls += 1;
          return original.apply(this, args);
        };
      }
      Object.defineProperty(window, 'isSecureContext', { value: false, configurable: true });
    });
    await page.goto('/autosave-default/');
    const alert = page.locator('#hexo-blog-encrypt [role="alert"]');
    await expect(alert).toContainText(NO_CRYPTO);
    await page.locator('#hbePass').fill('hello');
    await page.locator('#hbePass').press('Enter');
    await expect(alert).toContainText(NO_CRYPTO);
    expect(await page.evaluate(() => window.__subtleCalls)).toBe(0);
    await expect(page.locator('body')).not.toContainText('THE SECRET IS BUTTERFLY');
  });
});
