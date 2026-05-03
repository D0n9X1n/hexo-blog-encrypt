'use strict';

const fs = require('fs');
const path = require('path');
const { ensureFixtureInstalled } = require('./ensureFixtureInstalled');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_FIXTURE = path.join(REPO_ROOT, 'tests', 'fixtures', 'hexo-site');
const TEMPLATE_REL = path.join('templates', 'encrypted-post.md');
const POSTS_REL = path.join('source', '_posts');

/**
 * @typedef {object} BuildSiteOptions
 * @property {string} [cwd] - Hexo site root. Defaults to the bundled fixture
 *   at `tests/fixtures/hexo-site/`.
 */

/**
 * Discover the list of theme names shipped by this plugin by listing
 * `lib/` and matching `hbe.<theme>.html`. Uses `fs.readdirSync` (universal
 * since Node 0.x), so the test-kit runs on any Node version the project
 * supports.
 *
 * @returns {string[]} sorted list of theme names
 */
function discoverThemes() {
  const libDir = path.join(REPO_ROOT, 'lib');
  const entries = fs.readdirSync(libDir);
  const themes = entries
    .filter((name) => /^hbe\..+\.html$/.test(name))
    .map((name) => name.replace(/^hbe\./, '').replace(/\.html$/, ''))
    .filter((name) => name && name !== 'js' && name !== 'style');
  return Array.from(new Set(themes)).sort();
}

/**
 * Materialize one post per theme into the fixture's `source/_posts/`
 * directory. Each post is rendered from `templates/encrypted-post.md`
 * with the `__THEME__` placeholder replaced by the theme name.
 *
 * Idempotent: existing files are overwritten.
 *
 * @param {string} fixtureDir - absolute path to the Hexo fixture site
 * @param {string[]} themes - theme names to materialize
 * @returns {string[]} absolute paths of the materialized post files
 */
function materializePosts(fixtureDir, themes) {
  const templatePath = path.join(fixtureDir, TEMPLATE_REL);
  const template = fs.readFileSync(templatePath, 'utf8');
  const postsDir = path.join(fixtureDir, POSTS_REL);
  fs.mkdirSync(postsDir, { recursive: true });

  const written = [];
  for (const theme of themes) {
    const body = template.split('__THEME__').join(theme);
    const dest = path.join(postsDir, `encrypted-${theme}.md`);
    fs.writeFileSync(dest, body, 'utf8');
    written.push(dest);
  }
  return written;
}

/**
 * Boot a Hexo instance against a fixture site, with this plugin loaded.
 *
 * Before booting Hexo, materializes one post per discovered theme into
 * `source/_posts/encrypted-<theme>.md` so that downstream tests have
 * deterministic content to operate on.
 *
 * Loads `hexo` from the fixture's own `node_modules/` (via
 * `require.resolve('hexo', { paths: [fixtureDir] })`) so test boot mirrors
 * what real plugin users exercise. The fixture's dependencies are
 * lazy-installed on first call (no-op when `node_modules/` already
 * exists), so this function works from a fresh clone with no setup.
 *
 * @param {BuildSiteOptions} [opts]
 * @returns {Promise<import('hexo')>} an initialized + loaded Hexo instance
 *   with this plugin's filter and generators registered.
 */
async function buildSite(opts) {
  const fixtureDir = (opts && opts.cwd) || DEFAULT_FIXTURE;
  await ensureFixtureInstalled(fixtureDir);
  const themes = discoverThemes();
  materializePosts(fixtureDir, themes);

  const hexoPath = require.resolve('hexo', { paths: [fixtureDir] });
  const Hexo = require(hexoPath);
  const hexo = new Hexo(fixtureDir, { silent: true });
  await hexo.init();
  await hexo.load();
  return hexo;
}

module.exports = {
  buildSite,
  discoverThemes,
  materializePosts,
};
