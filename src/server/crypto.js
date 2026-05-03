'use strict';

const crypto = require('node:crypto');

const DEFAULT_ITERATIONS = 250000;
const SALT_BYTES = 32;
const NONCE_BYTES = 12;
const KEY_BYTES = 32;
const TAG_BYTES = 16;
const HASH = 'sha256';
const CIPHER = 'aes-256-gcm';

function deriveKey(password, salt, iterations) {
  const passwordBuf = typeof password === 'string'
    ? Buffer.from(password, 'utf8')
    : Buffer.from(String(password), 'utf8');
  return crypto.pbkdf2Sync(passwordBuf, salt, iterations, KEY_BYTES, HASH);
}

function encrypt(plaintext, password, opts) {
  const iterations = (opts && Number.isInteger(opts.iterations) && opts.iterations > 0)
    ? opts.iterations
    : DEFAULT_ITERATIONS;
  const salt = crypto.randomBytes(SALT_BYTES);
  const nonce = crypto.randomBytes(NONCE_BYTES);
  const dk = deriveKey(password, salt, iterations);
  const cipher = crypto.createCipheriv(CIPHER, dk, nonce);
  const enc = Buffer.concat([
    cipher.update(Buffer.from(String(plaintext), 'utf8')),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  const ciphertext = Buffer.concat([enc, tag]);
  return { salt, nonce, ciphertext };
}

function decrypt(salt, nonce, ciphertext, password, opts) {
  const iterations = (opts && Number.isInteger(opts.iterations) && opts.iterations > 0)
    ? opts.iterations
    : DEFAULT_ITERATIONS;
  if (!Buffer.isBuffer(salt) || salt.length !== SALT_BYTES) {
    throw new Error('salt must be a 32-byte Buffer');
  }
  if (!Buffer.isBuffer(nonce) || nonce.length !== NONCE_BYTES) {
    throw new Error('nonce must be a 12-byte Buffer');
  }
  if (!Buffer.isBuffer(ciphertext) || ciphertext.length < TAG_BYTES) {
    throw new Error('ciphertext must be a Buffer of length ≥ 16');
  }
  const dk = deriveKey(password, salt, iterations);
  const enc = ciphertext.slice(0, ciphertext.length - TAG_BYTES);
  const tag = ciphertext.slice(ciphertext.length - TAG_BYTES);
  const decipher = crypto.createDecipheriv(CIPHER, dk, nonce);
  decipher.setAuthTag(tag);
  const out = Buffer.concat([decipher.update(enc), decipher.final()]);
  return out.toString('utf8');
}

module.exports = {
  encrypt,
  decrypt,
  DEFAULT_ITERATIONS,
  SALT_BYTES,
  NONCE_BYTES,
  KEY_BYTES,
  TAG_BYTES,
};
