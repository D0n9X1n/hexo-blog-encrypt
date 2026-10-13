'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { encrypt, decrypt } = require('../../src/server/crypto');

const PLAINTEXT = '<p>Top secret content with <em>HTML</em> &amp; entities.</p>';
const PASSWORD = 'correct horse battery staple';

test('encrypt() returns {salt:Buffer(32), nonce:Buffer(12), ciphertext:Buffer}', async () => {
  const out = await encrypt(PLAINTEXT, PASSWORD);
  assert.ok(Buffer.isBuffer(out.salt), 'salt must be a Buffer');
  assert.equal(out.salt.length, 32, 'salt must be 32 bytes');
  assert.ok(Buffer.isBuffer(out.nonce), 'nonce must be a Buffer');
  assert.equal(out.nonce.length, 12, 'nonce must be 12 bytes');
  assert.ok(Buffer.isBuffer(out.ciphertext), 'ciphertext must be a Buffer');
});

test('encrypt() salt is fresh per call (two same-input calls → different salts)', async () => {
  const a = await encrypt(PLAINTEXT, PASSWORD);
  const b = await encrypt(PLAINTEXT, PASSWORD);
  assert.notEqual(a.salt.toString('hex'), b.salt.toString('hex'), 'salts must differ');
});

test('encrypt() nonce is fresh per call (two same-input calls → different nonces)', async () => {
  const a = await encrypt(PLAINTEXT, PASSWORD);
  const b = await encrypt(PLAINTEXT, PASSWORD);
  assert.notEqual(a.nonce.toString('hex'), b.nonce.toString('hex'), 'nonces must differ');
});

test('encrypt() accepts a supplied 32-byte salt while keeping nonce fresh', async () => {
  const suppliedSalt = crypto.createHash('sha256').update('stable-permalink').digest();
  const a = await encrypt(PLAINTEXT, PASSWORD, { salt: suppliedSalt });
  const b = await encrypt(PLAINTEXT, PASSWORD, { salt: suppliedSalt });
  assert.equal(a.salt.toString('hex'), suppliedSalt.toString('hex'));
  assert.equal(b.salt.toString('hex'), suppliedSalt.toString('hex'));
  assert.notEqual(a.nonce.toString('hex'), b.nonce.toString('hex'), 'nonces must remain random');
  assert.equal(await decrypt(a.salt, a.nonce, a.ciphertext, PASSWORD), PLAINTEXT);
});

test('encrypt() rejects supplied salt that is not a 32-byte Buffer', async () => {
  await assert.rejects(
    () => encrypt(PLAINTEXT, PASSWORD, { salt: 'not-a-buffer' }),
    /salt must be a 32-byte Buffer/
  );
  await assert.rejects(
    () => encrypt(PLAINTEXT, PASSWORD, { salt: Buffer.alloc(31) }),
    /salt must be a 32-byte Buffer/
  );
});

test('encrypt() ciphertext length = plaintext bytes + 16 (GCM tag)', async () => {
  const out = await encrypt(PLAINTEXT, PASSWORD);
  const ptBytes = Buffer.byteLength(PLAINTEXT, 'utf8');
  assert.equal(out.ciphertext.length, ptBytes + 16, 'ciphertext = plaintext + 16-byte auth tag');
});

test('round-trip: decrypt(salt, nonce, ciphertext, password) === plaintext', async () => {
  const { salt, nonce, ciphertext } = await encrypt(PLAINTEXT, PASSWORD);
  const recovered = await decrypt(salt, nonce, ciphertext, PASSWORD);
  assert.equal(recovered, PLAINTEXT, 'round-trip must yield original plaintext');
});

test('decrypt() with wrong password throws (GCM auth-tag fail)', async () => {
  const { salt, nonce, ciphertext } = await encrypt(PLAINTEXT, PASSWORD);
  await assert.rejects(
    () => decrypt(salt, nonce, ciphertext, 'wrong-password'),
    'wrong password must throw'
  );
});

test('encrypt() opts.iterations is honoured (interop with manual derivation)', async () => {
  const customIters = 600000;
  const { salt, nonce, ciphertext } = await encrypt(PLAINTEXT, PASSWORD, { iterations: customIters });

  // Manually derive with the same iters and decrypt to prove the option flowed.
  const dk = crypto.pbkdf2Sync(PASSWORD, salt, customIters, 32, 'sha256');
  const tag = ciphertext.slice(ciphertext.length - 16);
  const enc = ciphertext.slice(0, ciphertext.length - 16);
  const decipher = crypto.createDecipheriv('aes-256-gcm', dk, nonce);
  decipher.setAuthTag(tag);
  const recovered = Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
  assert.equal(recovered, PLAINTEXT, 'custom-iters ciphertext must decrypt with same iters');

  // And a default-iters decrypt of this ciphertext must FAIL (proves iters is not hard-coded).
  await assert.rejects(
    () => decrypt(salt, nonce, ciphertext, PASSWORD),
    'default-iter decrypt of custom-iter ciphertext must fail'
  );
});

test('decrypt() rejects salt that is not a 32-byte Buffer', async () => {
  const { nonce, ciphertext } = await encrypt(PLAINTEXT, PASSWORD);
  await assert.rejects(
    () => decrypt('not-a-buffer', nonce, ciphertext, PASSWORD),
    /salt must be a 32-byte Buffer/
  );
  await assert.rejects(
    () => decrypt(Buffer.alloc(31), nonce, ciphertext, PASSWORD),
    /salt must be a 32-byte Buffer/
  );
});

test('decrypt() rejects nonce that is not a 12-byte Buffer', async () => {
  const { salt, ciphertext } = await encrypt(PLAINTEXT, PASSWORD);
  await assert.rejects(
    () => decrypt(salt, 'not-a-buffer', ciphertext, PASSWORD),
    /nonce must be a 12-byte Buffer/
  );
  await assert.rejects(
    () => decrypt(salt, Buffer.alloc(13), ciphertext, PASSWORD),
    /nonce must be a 12-byte Buffer/
  );
});

test('decrypt() rejects ciphertext shorter than the 16-byte auth tag', async () => {
  const { salt, nonce } = await encrypt(PLAINTEXT, PASSWORD);
  await assert.rejects(
    () => decrypt(salt, nonce, 'not-a-buffer', PASSWORD),
    /ciphertext must be a Buffer of length/
  );
  await assert.rejects(
    () => decrypt(salt, nonce, Buffer.alloc(15), PASSWORD),
    /ciphertext must be a Buffer of length/
  );
});

test('encrypt() accepts a numeric password (coerces via String())', async () => {
  const out = await encrypt(PLAINTEXT, 12345);
  const recovered = await decrypt(out.salt, out.nonce, out.ciphertext, '12345');
  assert.equal(recovered, PLAINTEXT);
});

test('decrypt() honours opts.iterations (truthy branch of iters ternary)', async () => {
  const customIters = 300000;
  const out = await encrypt(PLAINTEXT, PASSWORD, { iterations: customIters });
  const recovered = await decrypt(out.salt, out.nonce, out.ciphertext, PASSWORD, { iterations: customIters });
  assert.equal(recovered, PLAINTEXT);
});

test('decrypt() ignores invalid opts.iterations (falls back to default)', async () => {
  // Encrypt with default iters; decrypt with falsy opts.iterations forms
  // (negative, non-integer, non-numeric) should still succeed via DEFAULT.
  const out = await encrypt(PLAINTEXT, PASSWORD);
  assert.equal(await decrypt(out.salt, out.nonce, out.ciphertext, PASSWORD, { iterations: -5 }), PLAINTEXT);
  assert.equal(await decrypt(out.salt, out.nonce, out.ciphertext, PASSWORD, { iterations: 'bogus' }), PLAINTEXT);
  assert.equal(await decrypt(out.salt, out.nonce, out.ciphertext, PASSWORD, {}), PLAINTEXT);
});

// ---------------------------------------------------------------------------
// #252 — PBKDF2 runs on the libuv thread pool, not the event loop.
// ---------------------------------------------------------------------------
test('#252: encrypt() and decrypt() return Promises', async () => {
  const p = encrypt(PLAINTEXT, PASSWORD);
  assert.ok(p instanceof Promise, 'encrypt must return a Promise');
  const out = await p;
  const d = decrypt(out.salt, out.nonce, out.ciphertext, PASSWORD);
  assert.ok(d instanceof Promise, 'decrypt must return a Promise');
  assert.equal(await d, PLAINTEXT);
});

test('#252: invalid salt rejects instead of throwing synchronously', () => {
  const p = encrypt(PLAINTEXT, PASSWORD, { salt: 'bad' });
  assert.ok(p instanceof Promise);
  return assert.rejects(p, /salt must be a 32-byte Buffer/);
});

test('#252: event loop stays responsive while the key is derived', async () => {
  let timerFired = false;
  setTimeout(() => { timerFired = true; }, 0);
  let timerFiredBeforeKdf;
  // 2M iterations takes well over one timer tick; a synchronous KDF would
  // block the timer until derivation completes.
  await encrypt(PLAINTEXT, PASSWORD, { iterations: 2000000 }).then((out) => {
    timerFiredBeforeKdf = timerFired;
    return out;
  });
  assert.equal(timerFiredBeforeKdf, true, 'setTimeout(0) must fire before PBKDF2 finishes');
});

test('#252: ciphertext semantics unchanged (independent pbkdf2Sync derivation decrypts it)', async () => {
  const { salt, nonce, ciphertext } = await encrypt(PLAINTEXT, PASSWORD);
  const dk = crypto.pbkdf2Sync(PASSWORD, salt, 250000, 32, 'sha256');
  const decipher = crypto.createDecipheriv('aes-256-gcm', dk, nonce);
  decipher.setAuthTag(ciphertext.subarray(ciphertext.length - 16));
  const pt = Buffer.concat([decipher.update(ciphertext.subarray(0, ciphertext.length - 16)), decipher.final()]);
  assert.equal(pt.toString('utf8'), PLAINTEXT);
});

test('browser KDF fallback equals the single server default (#260)', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const { DEFAULT_ITERATIONS } = require('../../src/server/crypto');
  const src = fs.readFileSync(path.join(__dirname, '../../src/browser/main.js'), 'utf8');
  const match = src.match(/const FALLBACK_KDF_ITERATIONS = (\d+);/);
  assert.ok(match, 'src/browser/main.js must declare FALLBACK_KDF_ITERATIONS');
  assert.equal(Number(match[1]), DEFAULT_ITERATIONS);
  // The literal appears only in that declaration.
  assert.equal(src.split(String(DEFAULT_ITERATIONS)).length - 1, 1);
});
