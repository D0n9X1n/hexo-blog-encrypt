'use strict';

// Browser-side AES-256-GCM decryption with PBKDF2-SHA256 key derivation.
// Mirrors the server-side parameters in `src/server/crypto.js`:
//   - PBKDF2: SHA-256, configurable iterations (read from data-kdf-iterations)
//   - AES: 256-bit key, GCM mode, 12-byte nonce, 16-byte auth tag
//
// Unified failure path: ANY thrown value (DOMException OperationError,
// TypeError, etc.) collapses to {ok: false}. Wrong-password and
// tampered-ciphertext are indistinguishable under GCM by design.

const KEY_BITS = 256;
const TAG_BITS = 128;
const TAG_BYTES = TAG_BITS / 8;
const TEXT_DECODER = new TextDecoder('utf-8', { fatal: true });
const TEXT_ENCODER = new TextEncoder();

function hexToBytes(hex) {
  const len = hex.length;
  if (len % 2 !== 0) {
    throw new Error('hexo-blog-encrypt: hex string has odd length');
  }
  const out = new Uint8Array(len / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return out;
}

async function deriveKey(password, salt, iterations) {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    TEXT_ENCODER.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: KEY_BITS },
    true, // extractable=true so storage.js can persist the raw key bytes when autoSave is on
    ['decrypt']
  );
}

async function decryptWithKey(key, nonce, ciphertextWithTag) {
  // Web Crypto AES-GCM expects ciphertext||tag as a single buffer (same as Node's
  // `decipher.update + setAuthTag(tag); decipher.final()` flow when concatenated).
  const plainBuf = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: nonce, tagLength: TAG_BITS },
    key,
    ciphertextWithTag
  );
  return TEXT_DECODER.decode(plainBuf);
}

// High-level: derive a key from the password + decrypt in one shot.
// Returns {ok: true, plaintext, key} or {ok: false}.
async function tryDecryptWithPassword({ password, saltHex, nonceHex, ciphertextHex, iterations }) {
  try {
    const salt = hexToBytes(saltHex);
    const nonce = hexToBytes(nonceHex);
    const ciphertext = hexToBytes(ciphertextHex);
    if (ciphertext.length < TAG_BYTES) return { ok: false };
    const key = await deriveKey(password, salt, iterations);
    const plaintext = await decryptWithKey(key, nonce, ciphertext);
    return { ok: true, plaintext, key };
  } catch (_e) {
    return { ok: false };
  }
}

// Same shape, but reuses an already-derived key (autosave fast path).
async function tryDecryptWithKey({ key, nonceHex, ciphertextHex }) {
  try {
    const nonce = hexToBytes(nonceHex);
    const ciphertext = hexToBytes(ciphertextHex);
    if (ciphertext.length < TAG_BYTES) return { ok: false };
    const plaintext = await decryptWithKey(key, nonce, ciphertext);
    return { ok: true, plaintext };
  } catch (_e) {
    return { ok: false };
  }
}

module.exports = {
  tryDecryptWithPassword,
  tryDecryptWithKey,
  deriveKey,
  decryptWithKey,
  hexToBytes,
};
