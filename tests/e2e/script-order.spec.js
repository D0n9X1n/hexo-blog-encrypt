'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { test, expect } = require('./fixtures');
const { encrypt } = require('../../src/server/crypto');

const PASSWORD = 'hello';

// Keep the real generated page and decryptor. Only replace its encrypted payload,
// so each case exercises the production password/cache/reveal paths.
async function serveEncrypted(page, plaintext, autoSave = false, headers = {}) {
  const wire = encrypt(plaintext, PASSWORD);
  await page.route('**/encrypted-default/', async (route) => {
    const response = await route.fetch();
    const body = (await response.text())
      .replace(/data-salt="[^"]*"/, `data-salt="${wire.salt.toString('hex')}"`)
      .replace(/data-nonce="[^"]*"/, `data-nonce="${wire.nonce.toString('hex')}"`)
      .replace(/data-auto-save="[^"]*"/, `data-auto-save="${autoSave}"`)
      .replace(/(<script id="hbeData"[^>]*>)[\s\S]*?(<\/script>)/,
        `$1${wire.ciphertext.toString('hex')}$2`);
    await route.fulfill({ response, body, headers: { ...response.headers(), ...headers } });
  });
  await page.addInitScript(() => {
    window.scriptOrder = [];
    window.decryptEvents = [];
    window.addEventListener('hexo-blog-decrypt', (event) => {
      window.decryptEvents.push({ mode: event.detail.mode, order: window.scriptOrder.slice() });
    });
  });
}

async function submitPassword(page) {
  await page.locator('#hbePass').fill(PASSWORD);
  await page.locator('#hbePass').press('Enter');
}

// Hold a real network request until the test releases it. No timing sleeps or CDN.
async function holdScript(page, url, body) {
  let resolveRequest;
  let release;
  const requested = new Promise((resolve) => { resolveRequest = resolve; });
  const ready = new Promise((resolve) => { release = resolve; });
  await page.route(url, async (route) => {
    resolveRequest();
    await ready;
    await route.fulfill({ contentType: 'application/javascript', body });
  });
  return { requested, release };
}

for (const mode of ['manual', 'cached']) {
  test(`script order: delayed dependency and callback (${mode})`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await serveEncrypted(page, `
      <div id="script-result">Waiting for the dependency</div>
      <script src="/order-library.js" onload="window.scriptOrder.push('load-handler')"></script>
      <script>
        window.orderLibrary();
        window.addEventListener('hexo-blog-decrypt', function () {
          document.getElementById('script-result').textContent = 'Callback ready';
        }, { once: true });
      </script>
    `, mode === 'cached');
    const library = `
      window.scriptOrder.push('library');
      window.orderLibrary = function () { window.scriptOrder.push('initializer'); };
    `;
    if (mode === 'cached') {
      await page.route('**/order-library.js', (route) => route.fulfill({
        contentType: 'application/javascript', body: library,
      }));
      await page.goto('/encrypted-default/', { waitUntil: 'domcontentloaded' });
      await submitPassword(page);
      await expect.poll(() => page.evaluate(() =>
        Object.keys(localStorage).some((key) => key.startsWith('hbe.v4.'))
      )).toBe(true);
      // Let the first reveal finish before changing the route for the reload.
      await expect.poll(() => page.evaluate(() => window.scriptOrder.includes('library'))).toBe(true);
      await page.unroute('**/order-library.js');
      errors.length = 0;
    }
    const held = await holdScript(page, '**/order-library.js', library);
    try {
      await page.goto('/encrypted-default/', { waitUntil: 'domcontentloaded' });
      if (mode === 'manual') await submitPassword(page);
      await held.requested;
      await expect(page.locator('#script-result')).toBeVisible();
      expect(await page.evaluate(() => window.scriptOrder)).toEqual([]);
      expect(await page.evaluate(() => window.decryptEvents)).toEqual([]);
      held.release();
      await expect(page.locator('#script-result')).toHaveText('Callback ready');
      expect(await page.evaluate(() => window.decryptEvents)).toEqual([{
        mode, order: ['library', 'load-handler', 'initializer'],
      }]);
      expect(errors).toEqual([]);
    } finally {
      held.release();
    }
  });
}

test('script order: multiple external and inline dependencies retain document order', async ({ page }) => {
  await serveEncrypted(page, `
    <script>window.scriptOrder.push('first-inline');</script>
    <script src="/first.js"></script>
    <script>window.scriptOrder.push(window.firstDependency + '-inline');</script>
    <script src="/second.js"></script>
    <script>window.scriptOrder.push(window.secondDependency + '-inline');</script>
  `);
  const first = await holdScript(page, '**/first.js', `
    window.firstDependency = 'first'; window.scriptOrder.push('first-external');
  `);
  let secondRequested = false;
  await page.route('**/second.js', (route) => {
    secondRequested = true;
    return route.fulfill({ contentType: 'application/javascript', body: `
      window.secondDependency = window.firstDependency + '-second';
      window.scriptOrder.push('second-external');
    ` });
  });
  try {
    await page.goto('/encrypted-default/', { waitUntil: 'domcontentloaded' });
    await submitPassword(page);
    await first.requested;
    expect(await page.evaluate(() => window.scriptOrder)).toEqual(['first-inline']);
    expect(secondRequested).toBe(false);
    first.release();
    await expect.poll(() => page.evaluate(() => window.decryptEvents)).toEqual([{
      mode: 'manual',
      order: ['first-inline', 'first-external', 'first-inline', 'second-external', 'first-second-inline'],
    }]);
  } finally {
    first.release();
  }
});

test('script order: external failures preserve handlers and do not stall reveal', async ({ page }) => {
  await serveEncrypted(page, `
    <script src="/missing.js" onerror="window.scriptOrder.push('error-handler')"></script>
    <script>window.scriptOrder.push('after-error');</script>
  `);
  await page.route('**/missing.js', (route) => route.abort('failed'));
  await page.goto('/encrypted-default/', { waitUntil: 'domcontentloaded' });
  await submitPassword(page);
  await expect.poll(() => page.evaluate(() => window.decryptEvents)).toEqual([{
    mode: 'manual', order: ['error-handler', 'after-error'],
  }]);
});

test('script order: explicit async loads independently but the callback waits', async ({ page }) => {
  await serveEncrypted(page, `
    <script async src="/async-library.js"></script>
    <script>window.scriptOrder.push('independent-inline');</script>
  `);
  const held = await holdScript(page, '**/async-library.js', "window.scriptOrder.push('async-library');");
  try {
    await page.goto('/encrypted-default/', { waitUntil: 'domcontentloaded' });
    await submitPassword(page);
    await held.requested;
    expect(await page.evaluate(() => window.scriptOrder)).toEqual(['independent-inline']);
    expect(await page.evaluate(() => window.decryptEvents)).toEqual([]);
    held.release();
    await expect.poll(() => page.evaluate(() => window.decryptEvents)).toEqual([{
      mode: 'manual', order: ['independent-inline', 'async-library'],
    }]);
  } finally {
    held.release();
  }
});

test('script order: data blocks and skipped nomodule scripts never block the queue', async ({ page }) => {
  const requests = [];
  page.on('request', (request) => {
    if (/never-load/.test(request.url())) requests.push(request.url());
  });
  await serveEncrypted(page, `
    <script id="embedded-data" type="application/json" src="/never-load-data.js">{"ok":true}</script>
    <script nomodule src="/never-load-legacy.js"></script>
    <script type="text/javascript; charset=utf-8" src="/never-load-type.js"></script>
    <script>window.scriptOrder.push(JSON.parse(document.getElementById('embedded-data').textContent).ok);</script>
  `);
  await page.goto('/encrypted-default/', { waitUntil: 'domcontentloaded' });
  await submitPassword(page);
  await expect.poll(() => page.evaluate(() => window.decryptEvents)).toEqual([{
    mode: 'manual', order: [true],
  }]);
  expect(requests).toEqual([]);
});

test('script order: external modules finish loading before dependent scripts', async ({ page }) => {
  await serveEncrypted(page, `
    <script type="module" src="/module.js"></script>
    <script>window.scriptOrder.push('after-external-module');</script>
  `);
  const held = await holdScript(page, '**/module.js', "window.scriptOrder.push('external-module');");
  try {
    await page.goto('/encrypted-default/', { waitUntil: 'domcontentloaded' });
    await submitPassword(page);
    await held.requested;
    expect(await page.evaluate(() => window.scriptOrder)).toEqual([]);
    expect(await page.evaluate(() => window.decryptEvents)).toEqual([]);
    held.release();
    await expect.poll(() => page.evaluate(() => window.decryptEvents)).toEqual([{
      mode: 'manual', order: ['external-module', 'after-external-module'],
    }]);
  } finally {
    held.release();
  }
});

test('script order: a stalled load has a bounded wait and only one decrypt event', async ({ page }) => {
  await serveEncrypted(page, `
    <p id="readable">The decrypted content remains readable.</p>
    <script src="/stalled.js"></script>
    <script>window.scriptOrder.push('after-timeout');</script>
  `);
  // Accelerate only the loader's deadline, leaving native page/test timers alone.
  await page.addInitScript(() => {
    const nativeSetTimeout = window.setTimeout;
    window.setTimeout = function (callback, delay, ...args) {
      return nativeSetTimeout(callback, delay === 15000 ? 100 : delay, ...args);
    };
  });
  const held = await holdScript(page, '**/stalled.js', "window.scriptOrder.push('late-library');");
  try {
    await page.goto('/encrypted-default/', { waitUntil: 'domcontentloaded' });
    await submitPassword(page);
    await held.requested;
    await expect(page.locator('#readable')).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.decryptEvents)).toEqual([{
      mode: 'manual', order: ['after-timeout'],
    }]);
    held.release();
    await expect.poll(() => page.evaluate(() => window.scriptOrder)).toContain('late-library');
    expect(await page.evaluate(() => window.decryptEvents.length)).toBe(1);
  } finally {
    held.release();
  }
});

test('script order: inline modules keep native async execution without a false load timeout', async ({ page }) => {
  const warnings = [];
  page.on('console', (message) => {
    if (message.type() === 'warning') warnings.push(message.text());
  });
  await serveEncrypted(page, `
    <script type="module">window.scriptOrder.push('inline-module');</script>
    <script>window.scriptOrder.push('classic-inline');</script>
  `);
  await page.goto('/encrypted-default/', { waitUntil: 'domcontentloaded' });
  await submitPassword(page);
  await expect.poll(() => page.evaluate(() => window.decryptEvents.length), { timeout: 2000 }).toBe(1);
  await expect.poll(() => page.evaluate(() => window.scriptOrder)).toContain('inline-module');
  expect(await page.evaluate(() => window.scriptOrder)).toContain('classic-inline');
  expect(warnings).toEqual([]);
});

test('script order demo: shipped content initializes after its dependency and supports cached reload', async ({ page }) => {
  const demoRoot = path.resolve(__dirname, '../../demo/source');
  const post = fs.readFileSync(path.join(demoRoot, '_posts/script-order-demo.md'), 'utf8');
  const markup = post.match(/{% raw %}([\s\S]*?){% endraw %}/);
  expect(markup, 'demo must expose its real interactive markup').not.toBeNull();
  const library = fs.readFileSync(path.join(demoRoot, 'assets/script-order-widget.js'), 'utf8');
  await serveEncrypted(page, markup[1], true);
  const held = await holdScript(page, '**/assets/script-order-widget.js', library);
  try {
    await page.goto('/encrypted-default/', { waitUntil: 'domcontentloaded' });
    await submitPassword(page);
    await held.requested;
    await expect(page.locator('#hbe-demo-status')).toHaveText('Waiting for the library.');
    expect(await page.evaluate(() => window.decryptEvents)).toEqual([]);
    held.release();
    await expect(page.locator('#hbe-demo-status')).toHaveText('Ready. Decrypted with a password.');
    await expect(page.locator('#hbe-script-demo [data-complete="true"]')).toHaveCount(3);
    await page.getByRole('button', { name: 'Try the widget' }).click();
    await expect(page.locator('#hbe-demo-output')).toHaveText('The widget works: its library loaded before initialization.');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('#hbe-demo-status')).toHaveText('Ready. Decrypted with the saved key.');
    await expect(page.locator('#hbe-script-demo [data-complete="true"]')).toHaveCount(3);
  } finally {
    held.release();
  }
});

test('script order: import maps are activated before dependent modules', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await serveEncrypted(page, `
    <script type="importmap">{"imports":{"hbe-dependency":"/mapped-dependency.js"}}</script>
    <script type="module" src="/uses-import-map.js"></script>
    <script>window.scriptOrder.push('initializer');</script>
  `);
  await page.route('**/mapped-dependency.js', (route) => route.fulfill({
    contentType: 'application/javascript', body: "export const step = 'mapped-module';",
  }));
  await page.route('**/uses-import-map.js', (route) => route.fulfill({
    contentType: 'application/javascript',
    body: "import { step } from 'hbe-dependency'; window.scriptOrder.push(step);",
  }));
  await page.goto('/encrypted-default/', { waitUntil: 'domcontentloaded' });
  await submitPassword(page);
  await expect.poll(() => page.evaluate(() => window.decryptEvents)).toEqual([{
    mode: 'manual', order: ['mapped-module', 'initializer'],
  }]);
  expect(errors).toEqual([]);
});

test('script order: preserves script nonces under a header-delivered CSP', async ({ page }) => {
  await serveEncrypted(page, `
    <script nonce="hbe-demo">window.scriptOrder.push('nonce-initializer');</script>
  `, false, { 'content-security-policy': "script-src 'self' 'nonce-hbe-demo'" });
  await page.addInitScript(() => {
    window.cspViolations = [];
    document.addEventListener('securitypolicyviolation', (event) => {
      if (event.violatedDirective === 'script-src-elem') {
        window.cspViolations.push(event.blockedURI);
      }
    });
  });
  await page.goto('/encrypted-default/', { waitUntil: 'domcontentloaded' });
  await submitPassword(page);
  await expect.poll(() => page.evaluate(() => window.decryptEvents)).toEqual([{
    mode: 'manual', order: ['nonce-initializer'],
  }]);
  expect(await page.evaluate(() => window.cspViolations)).toEqual([]);
  expect(await page.locator('.hbe-decrypted-content script').evaluate((script) => script.nonce))
    .toBe('hbe-demo');
});
