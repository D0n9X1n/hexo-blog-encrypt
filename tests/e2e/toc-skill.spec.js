'use strict';

// Browser regression for the hbe-toc.js builder embedded in
// skills/hexo-encrypt-toc/SKILL.md (Appendix A). Uses static markup that
// mimics the plugin's decrypted DOM, so it needs no site.

const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');

const SKILL = fs.readFileSync(path.resolve(__dirname, '..', '..', 'skills', 'hexo-encrypt-toc', 'SKILL.md'), 'utf8');
const BUILDER = /^## Appendix A: hbe-toc\.js\n[\s\S]*?^````js\n([\s\S]*?)^````$/m.exec(SKILL)[1];

const LOCKED = `
  <aside><div id="toc" style="display:none"></div></aside>
  <div id="hexo-blog-encrypt" class="hbe hbe-container">locked</div>`;

const DECRYPTED = `
  <h1 id="intro">Intro</h1>
  <h2 id="setup">Setup &amp; <em>install</em></h2>
  <h3>No id <b>&lt;img src=x&gt;</b></h3>
  <h2 id="usage">Usage</h2>
  <h1 id="faq">FAQ</h1>`;

async function decrypt(page) {
  await page.evaluate((html) => {
    const el = document.getElementById('hexo-blog-encrypt');
    el.innerHTML = html;
    el.classList.add('hbe-decrypted-content');
    window.dispatchEvent(new Event('hexo-blog-decrypt'));
  }, DECRYPTED);
}

test.describe('hexo-encrypt-toc builder', () => {
  test('builds a nested Hexo-style TOC after the decrypt event', async ({ page }) => {
    await page.setContent(LOCKED);
    await page.evaluate(() => { window.HBE_TOC = { onRender: () => { window.__rendered = (window.__rendered || 0) + 1; } }; });
    await page.addScriptTag({ content: BUILDER });

    await expect(page.locator('#toc li')).toHaveCount(0);
    await decrypt(page);

    const toc = page.locator('#toc');
    await expect(toc).toBeVisible();
    await expect(toc.locator(':scope > ol.toc > li.toc-item.toc-level-1')).toHaveCount(2);
    await expect(toc.locator('li.toc-level-2')).toHaveCount(2);
    await expect(toc.locator('li.toc-level-2').first().locator('ol.toc-child > li.toc-level-3')).toHaveCount(1);
    await expect(toc.locator('a.toc-link').nth(1)).toHaveAttribute('href', '#setup');
    await expect(toc.locator('span.toc-text').nth(1)).toHaveText('Setup & install');

    const generatedId = await page.locator('#hexo-blog-encrypt h3').getAttribute('id');
    expect(generatedId).toBe('no-id-img-srcx');
    await expect(toc.locator('a.toc-link').nth(2)).toHaveAttribute('href', '#no-id-img-srcx');
    // Heading markup is copied as text only: the escaped tag stays literal and
    // no element from the heading (here <b>) is cloned into the TOC.
    await expect(toc.locator('span.toc-text').nth(2)).toHaveText('No id <img src=x>');
    expect(await toc.locator('b, img').count()).toBe(0);
    expect(await page.evaluate(() => window.__rendered)).toBe(1);
  });

  test('renders immediately when the post decrypted before the script loaded (autoSave)', async ({ page }) => {
    await page.setContent(LOCKED);
    await decrypt(page);
    await page.evaluate(() => { window.HBE_TOC = { className: 'nav', listNumber: true }; });
    await page.addScriptTag({ content: BUILDER });

    await expect(page.locator('#toc > ol.nav > li.nav-item')).toHaveCount(2);
    await expect(page.locator('#toc span.nav-number').first()).toHaveText('1.');
    await expect(page.locator('#toc span.nav-number').nth(2)).toHaveText('1.1.1.');
  });

  test('does nothing while the post is still locked', async ({ page }) => {
    await page.setContent(LOCKED);
    await page.addScriptTag({ content: BUILDER });
    await expect(page.locator('#toc')).toBeHidden();
    await expect(page.locator('#toc *')).toHaveCount(0);
  });
});
