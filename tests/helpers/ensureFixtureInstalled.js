'use strict';

const fs = require('fs');
const path = require('path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const execFileP = promisify(execFile);

/**
 * Run `npm install --no-audit --no-fund` in the given Hexo fixture
 * directory if its `node_modules/` is not yet present. This lets the
 * test-kit be used straight from a fresh clone — every entry point
 * (`buildSite()` and `generateSite()`) calls through here before
 * resolving the fixture's local `hexo` install.
 *
 * Idempotent: a no-op when `node_modules/` already exists.
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

module.exports = { ensureFixtureInstalled };
