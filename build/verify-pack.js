'use strict';

// Verify that the npm tarball contents are exactly what we intend to ship.
// Used by `.github/workflows/release.yml` (and runnable locally with
// `npm pack --dry-run --json > pack.json && node build/verify-pack.js pack.json`).
//
// Hard requirements:
//   * `index.js`, all server runtime modules (`src/server/*.js`),
//     `lib/hbe.bundle.js[.map]`, `lib/hbe.style.css`, `package.json`
//     all present.
//   * One `lib/hbe.<theme>.html` per known theme.
//   * Every shipped path matches a known allow-prefix (no surprise dirs).
//
// Exits non-zero on any violation; prints the offending paths to stderr.

const fs = require('node:fs');

const packJsonPath = process.argv[2] || 'pack.json';
const raw = fs.readFileSync(packJsonPath, 'utf8');

let parsed;
try {
  parsed = JSON.parse(raw);
} catch (err) {
  console.error('verify-pack: pack.json is not valid JSON:', err.message);
  process.exit(2);
}

if (!Array.isArray(parsed) || parsed.length === 0 || !parsed[0] ||
    !Array.isArray(parsed[0].files)) {
  console.error('verify-pack: unexpected pack.json shape:',
    raw.slice(0, 500));
  process.exit(2);
}

const pack = parsed[0];
const files = pack.files.map((f) => f.path).sort();

const REQUIRED = [
  'index.js',
  'src/server/config.js',
  'src/server/crypto.js',
  'src/server/generator.js',
  'src/server/index.js',
  'src/server/logger.js',
  'src/server/template.js',
  'lib/hbe.bundle.js',
  'lib/hbe.bundle.js.map',
  'lib/hbe.style.css',
  'package.json',
];

const THEMES = ['default', 'blink', 'flip', 'shrink', 'surge', 'up', 'wave', 'xray'];

// Allow-list: every shipped path MUST start with one of these prefixes
// OR exactly match one of these filenames. Anything else fails the check.
const ALLOWED_PREFIXES = ['lib/', 'src/server/'];
const ALLOWED_FILES = new Set([
  'index.js',
  'package.json',
  'LICENSE',
  'ReadMe.md',
  'ReadMe.zh.md',
]);

const missing = [
  ...REQUIRED,
  ...THEMES.map((t) => `lib/hbe.${t}.html`),
].filter((f) => !files.includes(f));

const forbidden = files.filter((f) => {
  if (ALLOWED_FILES.has(f)) return false;
  if (ALLOWED_PREFIXES.some((p) => f.startsWith(p))) return false;
  return true;
});

if (missing.length > 0 || forbidden.length > 0) {
  if (missing.length > 0) {
    console.error('Missing required files:');
    missing.forEach((f) => console.error('  - ' + f));
  }
  if (forbidden.length > 0) {
    console.error('Forbidden / unexpected files in tarball:');
    forbidden.forEach((f) => console.error('  - ' + f));
  }
  process.exit(1);
}

console.log(`Tarball OK: ${files.length} files, ${pack.size} bytes packed.`);
