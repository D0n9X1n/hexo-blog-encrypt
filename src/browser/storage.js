'use strict';

// Per-post localStorage entry storing the derived AES key + the salt/nonce that
// produced the corresponding ciphertext. On reload we re-import the key and
// attempt decryption silently; the user is never re-prompted.
//
// Schema (v4):
//   {
//     version: 4,
//     dk:      base64(rawKeyBytes),  // 32 bytes
//     salt:    <hex64>,              // matches data-salt
//     nonce:   <hex24>,              // matches data-nonce
//   }
//
// IMPORTANT: when `autoSave` is false, save() is a no-op. When reading, any
// entry with a non-4 version (or v3 leftovers like `hmk`/`hmacDigest`) is
// purged + ignored.

const STORAGE_KEY_PREFIX = 'hbe.v4.';
const SCHEMA_VERSION = 4;

function storageKey(pageKey) {
  return STORAGE_KEY_PREFIX + pageKey;
}

function bytesToBase64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function base64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function save({ pageKey, key, saltHex, nonceHex, autoSave }) {
  if (!autoSave) return;
  try {
    const raw = await crypto.subtle.exportKey('raw', key);
    const entry = {
      version: SCHEMA_VERSION,
      dk: bytesToBase64(new Uint8Array(raw)),
      salt: saltHex,
      nonce: nonceHex,
    };
    localStorage.setItem(storageKey(pageKey), JSON.stringify(entry));
  } catch (_e) {
    // localStorage.setItem can throw QuotaExceededError or SecurityError
    // (private mode, disabled storage). Silently ignore — autoSave is
    // best-effort UX.
  }
}

async function load({ pageKey, expectedSaltHex, expectedNonceHex }) {
  let entry;
  try {
    const raw = localStorage.getItem(storageKey(pageKey));
    if (!raw) return null;
    entry = JSON.parse(raw);
  } catch (_e) {
    return null;
  }

  // Purge stale or v3 entries.
  if (
    !entry
    || entry.version !== SCHEMA_VERSION
    || typeof entry.dk !== 'string'
    || typeof entry.salt !== 'string'
    || typeof entry.nonce !== 'string'
    || 'hmk' in entry
    || 'hmacDigest' in entry
  ) {
    try { localStorage.removeItem(storageKey(pageKey)); } catch (_e) { /* ignore */ }
    return null;
  }

  // If the encrypted page's salt/nonce changed (rebuild minted fresh ones),
  // the cached key is stale. Drop it.
  if (entry.salt !== expectedSaltHex || entry.nonce !== expectedNonceHex) {
    try { localStorage.removeItem(storageKey(pageKey)); } catch (_e) { /* ignore */ }
    return null;
  }

  try {
    const rawBytes = base64ToBytes(entry.dk);
    const key = await crypto.subtle.importKey(
      'raw',
      rawBytes,
      { name: 'AES-GCM' },
      true,
      ['decrypt']
    );
    return key;
  } catch (_e) {
    try { localStorage.removeItem(storageKey(pageKey)); } catch (_e2) { /* ignore */ }
    return null;
  }
}

function clear(pageKey) {
  try { localStorage.removeItem(storageKey(pageKey)); } catch (_e) { /* ignore */ }
}

module.exports = {
  save,
  load,
  clear,
  STORAGE_KEY_PREFIX,
  SCHEMA_VERSION,
};
