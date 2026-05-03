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
//   • `build/build.js` is present (i.e., we're not in a published
//     tarball install where this script could not have shipped anyway).
// We rebuild unconditionally — mtime-based skips proved unreliable across
// filesystems and git checkouts.
//
// Failures are surfaced loudly: a half-built install is worse than a
// failed one.

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
const BUILD_SCRIPT = path.join(REPO_ROOT, 'build', 'build.js');

function shouldBuild() {
  // Always rebuild when the build script is present (i.e., this is a dev /
  // git install, not a published-tarball install). mtime-based skips proved
  // unreliable across filesystems with coarse-grained timestamps and across
  // git checkouts that normalize file mtimes; release safety beats the few
  // wasted seconds of a redundant build.
  return fs.existsSync(BUILD_SCRIPT);
}

if (shouldBuild()) {
  const r = spawnSync(process.execPath, [BUILD_SCRIPT],
    { stdio: 'inherit', cwd: REPO_ROOT });
  if (r.status !== 0) process.exit(r.status || 1);
}
