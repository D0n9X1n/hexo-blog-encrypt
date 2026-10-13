'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const { generateSite } = require('../helpers/generateSite');
const { serveSite } = require('../helpers/serveSite');
const { discoverThemes } = require('../helpers/buildSite');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const E2E_DIR = __dirname;

// The generator rewrites (or strips) the bundle's trailing sourceMappingURL so
// it points at the emitted hashed map (#262). Everything before it must match.
const SOURCEMAP_COMMENT_RE = /\n?\/\/# sourceMappingURL=\S+\s*$/;

function sha256(filePath, { ignoreSourcemapComment = false } = {}) {
  let bytes = fs.readFileSync(filePath);
  if (ignoreSourcemapComment) bytes = Buffer.from(bytes.toString('utf8').replace(SOURCEMAP_COMMENT_RE, ''));
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

/**
 * Playwright globalSetup using the return-teardown pattern (Playwright
 * 1.27+): the function returns an async teardown closure that runs after
 * all tests complete. The HTTP server handle stays inside the same
 * closure that started it, avoiding any non-serializable cross-file
 * handle hand-off.
 *
 * NO separate `global-teardown.js` file is needed (and `playwright.config.js`
 * does NOT set a `globalTeardown` key).
 */
module.exports = async () => {
  // Wave 7+: the browser bundle is built on demand (it's gitignored). Run
  // `npm run build` BEFORE generateSite so the bundle exists when the Hexo
  // generator emits the hashed asset, and the artifact-identity preflight
  // below has something to checksum.
  execSync('npm run build', { cwd: REPO_ROOT, stdio: 'inherit' });

  const { publicDir } = await generateSite();

  // Criterion 14 — artifact-identity preflight.
  //
  // The whole point of the E2E suite is to load the REAL bundle in a real
  // browser and exercise the real ciphertext that the server produced. If the
  // served copy of the bundle (or `lib/hbe.style.css`) ever diverges from
  // the source — e.g. a stale build artifact, a copy-paste regression, a
  // registered generator that rewrites the file — we want to fail HERE, loud,
  // with both digests printed, not in some downstream "Cannot read property
  // of undefined" stack.
  //
  // The bundle is now emitted at `lib/hbe.<hex10>.js` (content-hashed) — pick
  // the single matching file out of `publicDir/lib/`.
  const sourceBundle = path.join(REPO_ROOT, 'lib', 'hbe.bundle.js');
  assert.ok(
    fs.existsSync(sourceBundle),
    `Source bundle missing at ${sourceBundle} after npm run build — investigate build/build.js`
  );

  const servedLibDir = path.join(publicDir, 'lib');
  const servedBundleMatches = fs.existsSync(servedLibDir)
    ? fs.readdirSync(servedLibDir).filter((f) => /^hbe\.[0-9a-f]{10}\.js$/.test(f))
    : [];
  assert.strictEqual(
    servedBundleMatches.length,
    1,
    `Expected exactly one served bundle matching lib/hbe.<hex10>.js; got: ${JSON.stringify(servedBundleMatches)}`
  );

  const checks = [
    {
      label: 'browser bundle',
      src: sourceBundle,
      served: path.join(servedLibDir, servedBundleMatches[0]),
      ignoreSourcemapComment: true,
    },
    {
      label: 'lib/hbe.style.css',
      src: path.join(REPO_ROOT, 'lib', 'hbe.style.css'),
      served: path.join(publicDir, 'css', 'hbe.style.css'),
    },
  ];
  for (const { label, src, served, ignoreSourcemapComment } of checks) {
    const sd = sha256(src, { ignoreSourcemapComment });
    const xd = sha256(served, { ignoreSourcemapComment });
    assert.strictEqual(
      sd,
      xd,
      [
        `Artifact identity mismatch (server↔browser drift) for ${label}:`,
        `  source : ${src}`,
        `           sha256=${sd}`,
        `  served : ${served}`,
        `           sha256=${xd}`,
      ].join('\n')
    );
  }

  // #262: a sourceMappingURL in the served bundle must resolve to a generated file.
  const servedJs = fs.readFileSync(path.join(servedLibDir, servedBundleMatches[0]), 'utf8');
  const mapUrl = (servedJs.match(/\/\/# sourceMappingURL=(\S+)\s*$/) || [])[1];
  if (mapUrl) {
    const mapFile = path.join(servedLibDir, mapUrl);
    assert.ok(fs.existsSync(mapFile), `sourceMappingURL=${mapUrl} does not resolve to a generated file`);
  }

  const server = await serveSite({ root: publicDir });

  // Workers are spawned AFTER globalSetup; they inherit this env var.
  process.env.E2E_BASE_URL = server.url;

  // Debug aids only — NOT used for teardown (the server handle lives in
  // the closure returned below).
  fs.writeFileSync(
    path.join(E2E_DIR, '.runtime.json'),
    JSON.stringify({ baseURL: server.url, publicDir }, null, 2),
    'utf8'
  );
  fs.writeFileSync(
    path.join(E2E_DIR, '.themes.json'),
    JSON.stringify(discoverThemes(), null, 2),
    'utf8'
  );

  return async () => {
    try {
      await server.close();
    } catch (_e) {
      // Best-effort: don't mask the real test failure with a teardown error.
    }
  };
};
