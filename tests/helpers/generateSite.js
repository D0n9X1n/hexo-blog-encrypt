'use strict';

const fs = require('fs');
const path = require('path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const execFileP = promisify(execFile);

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_FIXTURE = path.join(REPO_ROOT, 'tests', 'fixtures', 'hexo-site');

const { buildSite: _unused, discoverThemes, materializePosts } = require('./buildSite');
void _unused;

/**
 * @typedef {object} GenerateSiteOptions
 * @property {string} [cwd] - Hexo site root. Defaults to the bundled fixture
 *   at `tests/fixtures/hexo-site/`.
 */

/**
 * @typedef {object} GenerateSiteResult
 * @property {string} publicDir - absolute path to the generated `public/`
 *   directory of the fixture site.
 */

/**
 * Run `npm install --no-audit --no-fund` in the fixture directory if its
 * `node_modules/` is not yet present. This matches the behavior of the
 * `test:e2e` script in the root `package.json` and lets the test-kit be
 * used straight from a fresh clone.
 *
 * @param {string} fixtureDir - absolute path to the Hexo fixture site
 * @returns {Promise<void>}
 */
async function ensureFixtureInstalled(fixtureDir) {
  const nm = path.join(fixtureDir, 'node_modules');
  if (fs.existsSync(nm)) return;
  await execFileP('npm', ['install', '--no-audit', '--no-fund'], {
    cwd: fixtureDir,
    env: process.env,
  });
}

/**
 * Run `hexo clean && hexo generate` against the fixture site, returning
 * the path to the resulting `public/` directory.
 *
 * The fixture's local `hexo` binary is invoked via `process.execPath`
 * (`require.resolve('hexo/bin/hexo', { paths: [fixtureDir] })`) to avoid
 * PATH lookups and shebang surprises. `node_modules/` is lazy-installed
 * on first call and reused on subsequent calls.
 *
 * Posts are materialized into `source/_posts/` from the template before
 * generation so `generateSite()` is self-sufficient and does not require
 * a prior `buildSite()` call.
 *
 * @param {GenerateSiteOptions} [opts]
 * @returns {Promise<GenerateSiteResult>}
 */
async function generateSite(opts) {
  const fixtureDir = (opts && opts.cwd) || DEFAULT_FIXTURE;

  await ensureFixtureInstalled(fixtureDir);
  materializePosts(fixtureDir, discoverThemes());

  const hexoBin = require.resolve('hexo/bin/hexo', { paths: [fixtureDir] });

  await runHexo(hexoBin, ['clean'], fixtureDir);
  await runHexo(hexoBin, ['generate'], fixtureDir);

  return { publicDir: path.join(fixtureDir, 'public') };
}

/**
 * Spawn the fixture's `hexo` binary with the given args, surfacing
 * stderr in the thrown error on non-zero exit.
 *
 * @param {string} hexoBin - absolute path to `hexo/bin/hexo`
 * @param {string[]} args - CLI arguments to pass to hexo
 * @param {string} cwd - working directory for the spawned process
 * @returns {Promise<void>}
 */
async function runHexo(hexoBin, args, cwd) {
  try {
    await execFileP(process.execPath, [hexoBin, ...args], {
      cwd,
      env: process.env,
      maxBuffer: 50 * 1024 * 1024,
    });
  } catch (err) {
    const stderr = err && err.stderr ? String(err.stderr) : '';
    const stdout = err && err.stdout ? String(err.stdout) : '';
    const detail = [stderr, stdout].filter(Boolean).join('\n').trim();
    const wrapped = new Error(
      `hexo ${args.join(' ')} failed in ${cwd}: ${err.message}` +
        (detail ? `\n--- output ---\n${detail}` : '')
    );
    wrapped.cause = err;
    throw wrapped;
  }
}

module.exports = {
  generateSite,
  ensureFixtureInstalled,
};
