'use strict';

// `npm install` lifecycle hook — runs:
//   • after `npm install` of this package from a git URL (devDeps installed)
//   • during `npm publish` (before `prepack`)
//   • on a regular `npm install` of this repo for development
//
// Does NOT run when this package is installed from the published npm
// tarball, because `package.json#files` excludes `build/`.
//
// Goal: ensure `lib/hbe.bundle.js` exists before `index.js` is loaded by
// Hexo. Without this hook, source/git-URL installs would fail at runtime
// with `ENOENT: lib/hbe.bundle.js`.
//
// We only build when:
//   1) `build/build.js` is present (i.e., we're not in a published
//      tarball install where this script could not have shipped anyway).
//   2) `lib/hbe.bundle.js` is MISSING or older than the newest source
//      file under `src/browser/` (skip the rebuild on no-op installs).
//
// Failures are surfaced loudly: a half-built install is worse than a
// failed one.

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
const BUILD_SCRIPT = path.join(REPO_ROOT, 'build', 'build.js');
const BUNDLE = path.join(REPO_ROOT, 'lib', 'hbe.bundle.js');
const SRC_DIR = path.join(REPO_ROOT, 'src', 'browser');

function newestMtime(dir) {
  let newest = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const stat = entry.isDirectory()
      ? newestMtime(full)
      : fs.statSync(full).mtimeMs;
    if (stat > newest) newest = stat;
  }
  return newest;
}

function shouldBuild() {
  if (!fs.existsSync(BUILD_SCRIPT)) return false;
  if (!fs.existsSync(BUNDLE)) return true;
  if (!fs.existsSync(SRC_DIR)) return false;
  return newestMtime(SRC_DIR) > fs.statSync(BUNDLE).mtimeMs;
}

if (shouldBuild()) {
  const r = spawnSync(process.execPath, [BUILD_SCRIPT],
    { stdio: 'inherit', cwd: REPO_ROOT });
  if (r.status !== 0) process.exit(r.status || 1);
}
