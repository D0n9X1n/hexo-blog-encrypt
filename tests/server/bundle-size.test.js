'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const BUNDLE_PATH = path.resolve(__dirname, '../../lib/hbe.bundle.js');
// 10 KiB minified (~4 KiB gzipped). Raised from 8 KiB in v4.1.0: the bundle
// now handles several posts per page, PJAX re-init, a Web Crypto capability
// check, filled-state/retry UX, saved-key cleanup with a "forget" control,
// and en/zh browser messages (#246 #248 #253 #254 #255 #259).
const MAX_BYTES = 10240;

if (!fs.existsSync(BUNDLE_PATH)) {
  test.skip('lib/hbe.bundle.js missing — run `npm run build` first');
} else {
  test(`browser bundle is ≤ ${MAX_BYTES} bytes (current budget)`, () => {
    const bytes = fs.statSync(BUNDLE_PATH).size;
    assert.ok(
      bytes <= MAX_BYTES,
      `lib/hbe.bundle.js is ${bytes} bytes, over the ${MAX_BYTES}-byte budget. ` +
      'Either trim the bundle or raise MAX_BYTES with explicit justification.'
    );
  });

  test('browser bundle is non-empty', () => {
    const bytes = fs.statSync(BUNDLE_PATH).size;
    assert.ok(bytes > 0, 'lib/hbe.bundle.js exists but is 0 bytes');
  });

  test('browser bundle sourcemap exists alongside the bundle', () => {
    assert.ok(
      fs.existsSync(BUNDLE_PATH + '.map'),
      'lib/hbe.bundle.js.map should be emitted alongside the bundle'
    );
  });
}
