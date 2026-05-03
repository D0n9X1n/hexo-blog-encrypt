'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { encrypt, decrypt } = require('../../src/server/crypto');

const PLAINTEXT = '<p>Top secret content with <em>HTML</em> &amp; entities.</p>';
const PASSWORD = 'correct horse battery staple';

test('encrypt() returns {salt:Buffer(32), nonce:Buffer(12), ciphertext:Buffer}', () => {
  const out = encrypt(PLAINTEXT, PASSWORD);
  assert.ok(Buffer.isBuffer(out.salt), 'salt must be a Buffer');
  assert.equal(out.salt.length, 32, 'salt must be 32 bytes');
  assert.ok(Buffer.isBuffer(out.nonce), 'nonce must be a Buffer');
  assert.equal(out.nonce.length, 12, 'nonce must be 12 bytes');
  assert.ok(Buffer.isBuffer(out.ciphertext), 'ciphertext must be a Buffer');
});

test('encrypt() salt is fresh per call (two same-input calls → different salts)', () => {
  const a = encrypt(PLAINTEXT, PASSWORD);
  const b = encrypt(PLAINTEXT, PASSWORD);
  assert.notEqual(a.salt.toString('hex'), b.salt.toString('hex'), 'salts must differ');
});

test('encrypt() nonce is fresh per call (two same-input calls → different nonces)', () => {
  const a = encrypt(PLAINTEXT, PASSWORD);
  const b = encrypt(PLAINTEXT, PASSWORD);
  assert.notEqual(a.nonce.toString('hex'), b.nonce.toString('hex'), 'nonces must differ');
});

test('encrypt() ciphertext length = plaintext bytes + 16 (GCM tag)', () => {
  const out = encrypt(PLAINTEXT, PASSWORD);
  const ptBytes = Buffer.byteLength(PLAINTEXT, 'utf8');
  assert.equal(out.ciphertext.length, ptBytes + 16, 'ciphertext = plaintext + 16-byte auth tag');
});

test('round-trip: decrypt(salt, nonce, ciphertext, password) === plaintext', () => {
  const { salt, nonce, ciphertext } = encrypt(PLAINTEXT, PASSWORD);
  const recovered = decrypt(salt, nonce, ciphertext, PASSWORD);
  assert.equal(recovered, PLAINTEXT, 'round-trip must yield original plaintext');
});

test('decrypt() with wrong password throws (GCM auth-tag fail)', () => {
  const { salt, nonce, ciphertext } = encrypt(PLAINTEXT, PASSWORD);
  assert.throws(
    () => decrypt(salt, nonce, ciphertext, 'wrong-password'),
    'wrong password must throw'
  );
});

test('encrypt() opts.iterations is honoured (interop with manual derivation)', () => {
  const customIters = 600000;
  const { salt, nonce, ciphertext } = encrypt(PLAINTEXT, PASSWORD, { iterations: customIters });

  // Manually derive with the same iters and decrypt to prove the option flowed.
  const dk = crypto.pbkdf2Sync(PASSWORD, salt, customIters, 32, 'sha256');
  const tag = ciphertext.slice(ciphertext.length - 16);
  const enc = ciphertext.slice(0, ciphertext.length - 16);
  const decipher = crypto.createDecipheriv('aes-256-gcm', dk, nonce);
  decipher.setAuthTag(tag);
  const recovered = Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
  assert.equal(recovered, PLAINTEXT, 'custom-iters ciphertext must decrypt with same iters');

  // And a default-iters decrypt of this ciphertext must FAIL (proves iters is not hard-coded).
  assert.throws(
    () => decrypt(salt, nonce, ciphertext, PASSWORD),
    'default-iter decrypt of custom-iter ciphertext must fail'
  );
});

test('decrypt() rejects salt that is not a 32-byte Buffer', () => {
  const { nonce, ciphertext } = encrypt(PLAINTEXT, PASSWORD);
  assert.throws(
    () => decrypt('not-a-buffer', nonce, ciphertext, PASSWORD),
    /salt must be a 32-byte Buffer/
  );
  assert.throws(
    () => decrypt(Buffer.alloc(31), nonce, ciphertext, PASSWORD),
    /salt must be a 32-byte Buffer/
  );
});

test('decrypt() rejects nonce that is not a 12-byte Buffer', () => {
  const { salt, ciphertext } = encrypt(PLAINTEXT, PASSWORD);
  assert.throws(
    () => decrypt(salt, 'not-a-buffer', ciphertext, PASSWORD),
    /nonce must be a 12-byte Buffer/
  );
  assert.throws(
    () => decrypt(salt, Buffer.alloc(13), ciphertext, PASSWORD),
    /nonce must be a 12-byte Buffer/
  );
});

test('decrypt() rejects ciphertext shorter than the 16-byte auth tag', () => {
  const { salt, nonce } = encrypt(PLAINTEXT, PASSWORD);
  assert.throws(
    () => decrypt(salt, nonce, 'not-a-buffer', PASSWORD),
    /ciphertext must be a Buffer of length/
  );
  assert.throws(
    () => decrypt(salt, nonce, Buffer.alloc(15), PASSWORD),
    /ciphertext must be a Buffer of length/
  );
});

test('encrypt() accepts a numeric password (coerces via String())', () => {
  const out = encrypt(PLAINTEXT, 12345);
  const recovered = decrypt(out.salt, out.nonce, out.ciphertext, '12345');
  assert.equal(recovered, PLAINTEXT);
});

test('decrypt() honours opts.iterations (truthy branch of iters ternary)', () => {
  const customIters = 300000;
  const out = encrypt(PLAINTEXT, PASSWORD, { iterations: customIters });
  const recovered = decrypt(out.salt, out.nonce, out.ciphertext, PASSWORD, { iterations: customIters });
  assert.equal(recovered, PLAINTEXT);
});

test('decrypt() ignores invalid opts.iterations (falls back to default)', () => {
  // Encrypt with default iters; decrypt with falsy opts.iterations forms
  // (negative, non-integer, non-numeric) should still succeed via DEFAULT.
  const out = encrypt(PLAINTEXT, PASSWORD);
  assert.equal(decrypt(out.salt, out.nonce, out.ciphertext, PASSWORD, { iterations: -5 }), PLAINTEXT);
  assert.equal(decrypt(out.salt, out.nonce, out.ciphertext, PASSWORD, { iterations: 'bogus' }), PLAINTEXT);
  assert.equal(decrypt(out.salt, out.nonce, out.ciphertext, PASSWORD, {}), PLAINTEXT);
});
