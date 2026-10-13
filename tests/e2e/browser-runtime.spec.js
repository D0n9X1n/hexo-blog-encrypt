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
