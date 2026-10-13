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

test.describe('retry UX (#255)', () => {
  for (const via of ['keyboard', 'click']) {
    test(`wrong then right password via ${via}: typing replaces the selected attempt`, async ({ page }) => {
      await page.goto('/encrypted-default/');
      const input = page.locator('#hbePass');
      const submit = () => (via === 'keyboard'
        ? input.press('Enter')
        : page.locator('#hexo-blog-encrypt .hbe-button').click());

      await input.fill('wrongpw');
      await submit();
      await expect(page.locator('#hexo-blog-encrypt [role="alert"]')).toHaveText(WRONG_PASS_MESSAGE);
      await expect(input).toBeFocused();

      // No re-click needed: typing overwrites the selected wrong value.
      await page.keyboard.type('hello');
      await expect(input).toHaveValue('hello');
      await submit();
      await expect(page.locator('body')).toContainText('THE SECRET IS BUTTERFLY');
    });
  }
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

const savedKeys = (page) => page.evaluate(() => Object.keys(localStorage).sort());

async function unlock(page, input, password) {
  await input.fill(password);
  await input.press('Enter');
}

test.describe('saved keys (#248)', () => {
  test.afterEach(async ({ page }) => {
    await page.evaluate(() => localStorage.clear()).catch(() => {});
  });

  test('removes v3 leftovers and this post\'s entry when autoSave is off; keeps everything else', async ({ page }) => {
    await page.goto('/encrypted-default/');
    await page.evaluate(() => {
      const entry = JSON.stringify({ version: 4, dk: 'AAAA', salt: 'aa', nonce: 'bb' });
      localStorage.setItem('hexo-blog-encrypt:#/encrypted-default/', 'v3-key');
      localStorage.setItem('hexo-blog-encrypt:#/some-other-post/', 'v3-key');
      localStorage.setItem('hbe.v4./encrypted-default/', entry); // this post, autoSave off
      localStorage.setItem('hbe.v4./multi-posts/', entry); // another post
      localStorage.setItem('hexo-blog-encrypt-settings', 'keep'); // similar, not the v3 prefix
      localStorage.setItem('other-app:token', 'keep');
    });
    await page.reload();
    await expect(page.locator('#hbePass')).toBeVisible();
    await expect.poll(() => savedKeys(page)).toEqual([
      'hbe.v4./multi-posts/',
      'hexo-blog-encrypt-settings',
      'other-app:token',
    ]);
  });

  test('turning autoSave off forgets a key saved earlier', async ({ page }) => {
    await page.goto('/autosave-default/');
    await unlock(page, page.locator('#hbePass'), 'hello');
    await expect(page.locator('body')).toContainText('THE SECRET IS BUTTERFLY');
    await expect.poll(() => savedKeys(page)).toEqual(['hbe.v4./autosave-default/']);

    // Rebuild with autoSave: false.
    await page.route('**/autosave-default/', async (route) => {
      const response = await route.fetch();
      const body = (await response.text()).replace('data-auto-save="true"', 'data-auto-save="false"');
      await route.fulfill({ response, body });
    });
    await page.reload();
    await expect(page.locator('#hbePass')).toBeVisible();
    await expect(page.locator('body')).not.toContainText('THE SECRET IS BUTTERFLY');
    await expect.poll(() => savedKeys(page)).toEqual([]);
  });

  test('"Forget saved key" appears after a cached decrypt and clears the entry', async ({ page }) => {
    await page.goto('/autosave-default/');
    await unlock(page, page.locator('#hbePass'), 'hello');
    await expect(page.locator('body')).toContainText('THE SECRET IS BUTTERFLY');
    const forget = page.getByRole('button', { name: 'Forget saved key' });
    // Not offered after typing the password.
    await expect(forget).toHaveCount(0);

    await page.reload();
    await expect(page.locator('body')).toContainText('THE SECRET IS BUTTERFLY');
    await expect(forget).toBeVisible();
    await forget.focus();
    await page.keyboard.press('Enter');

    await expect(forget).toHaveCount(0);
    const status = page.locator('.hbe-forget [role="status"]');
    await expect(status).toHaveText('Saved key forgotten.');
    await expect(status).toBeFocused();
    expect(await savedKeys(page)).toEqual([]);

    await page.reload();
    await expect(page.locator('#hbePass')).toBeVisible();
    await expect(page.locator('body')).not.toContainText('THE SECRET IS BUTTERFLY');
  });

  test('forgetting one post on a multi-post page keeps the other post\'s key', async ({ page }) => {
    await page.goto(MULTI);
    await unlock(page, post(page, ALPHA.slug).locator('input[type="password"]'), ALPHA.password);
    await unlock(page, post(page, BRAVO.slug).locator('input[type="password"]'), BRAVO.password);
    await expect(post(page, BRAVO.slug)).toContainText(BRAVO.secret);
    await expect.poll(async () => (await savedKeys(page)).length).toBe(2);

    await page.reload();
    await expect(post(page, ALPHA.slug)).toContainText(ALPHA.secret);
    await expect(post(page, BRAVO.slug)).toContainText(BRAVO.secret);
    const bravoKey = (await savedKeys(page)).find((k) => k.endsWith('#1'));
    await post(page, ALPHA.slug).getByRole('button', { name: 'Forget saved key' }).click();
    await expect.poll(() => savedKeys(page)).toEqual([bravoKey]);

    await page.reload();
    await expect(post(page, ALPHA.slug).locator('input[type="password"]')).toBeVisible();
    await expect(post(page, BRAVO.slug)).toContainText(BRAVO.secret);
  });
});
