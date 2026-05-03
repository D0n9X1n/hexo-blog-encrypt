'use strict';

// Verify that the npm tarball contents are exactly what we intend to ship.
// Used by `.github/workflows/release.yml` (and runnable locally with
// `npm pack --dry-run --json > pack.json && node build/verify-pack.js pack.json`).
//
// Hard requirements:
//   * `index.js`, `lib/hbe.bundle.js[.map]`, `lib/hbe.style.css`,
//     `package.json` all present.
//   * One `lib/hbe.<theme>.html` per known theme.
//   * NO `tests/`, `demo/`, `feature-crew/`, `.github/`, `build/`,
//     `.eslintrc.js` paths.
//
// Exits non-zero on any violation; prints the offending paths to stderr.

const fs = require('node:fs');

const packJsonPath = process.argv[2] || 'pack.json';
const raw = fs.readFileSync(packJsonPath, 'utf8');
const pack = JSON.parse(raw)[0];
const files = pack.files.map((f) => f.path).sort();

const REQUIRED = [
  'index.js',
  'lib/hbe.bundle.js',
  'lib/hbe.bundle.js.map',
  'lib/hbe.style.css',
  'package.json',
];

const THEMES = ['default', 'blink', 'flip', 'shrink', 'surge', 'up', 'wave', 'xray'];

const missing = [
  ...REQUIRED,
  ...THEMES.map((t) => `lib/hbe.${t}.html`),
].filter((f) => !files.includes(f));

const forbidden = files.filter((f) =>
  f.startsWith('tests/') ||
  f.startsWith('demo/') ||
  f.startsWith('feature-crew/') ||
  f.startsWith('.github/') ||
  f.startsWith('build/') ||
  f.endsWith('.eslintrc.js')
);

if (missing.length > 0 || forbidden.length > 0) {
  if (missing.length > 0) {
    console.error('Missing required files:');
    missing.forEach((f) => console.error('  - ' + f));
  }
  if (forbidden.length > 0) {
    console.error('Forbidden files in tarball:');
    forbidden.forEach((f) => console.error('  - ' + f));
  }
  process.exit(1);
}

console.log(`Tarball OK: ${files.length} files, ${pack.size} bytes packed.`);
