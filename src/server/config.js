'use strict';

const FLOOR = 100000;
const RECOMMENDED = 600000;

const DEFAULTS = Object.freeze({
  abstract: 'Here\'s something encrypted, password is required to continue reading.',
  message: 'Hey, password is required here.',
  theme: 'default',
  wrong_pass_message: 'Oh, this is an invalid password. Check and try again, please.',
  // wrong_hash_message intentionally omitted from DEFAULTS — it defaults to the
  // resolved wrong_pass_message in resolve() below (single source of truth under
  // unified GCM failure handling).
  silent: false,
  autoSave: false,
  decryptButton: Object.freeze({
    show: true,
    text: 'Decrypt',
  }),
  kdf: Object.freeze({
    iterations: 250000,
  }),
});

function clone(value) {
  if (value === null || typeof value !== 'object') return value;
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function deepMerge(base, overlay) {
  if (overlay === null || overlay === undefined) return clone(base);
  if (typeof base !== 'object' || base === null || Array.isArray(base)) return clone(overlay);
  if (typeof overlay !== 'object' || Array.isArray(overlay)) return clone(overlay);
  const out = {};
  const keys = new Set([...Object.keys(base), ...Object.keys(overlay)]);
  for (const key of keys) {
    if (key in overlay) {
      out[key] = deepMerge(base[key], overlay[key]);
    } else {
      out[key] = clone(base[key]);
    }
  }
  return out;
}

function shallowPickKnown(source, knownKeys) {
  const out = {};
  if (!source || typeof source !== 'object') return out;
  for (const key of knownKeys) {
    if (key in source) out[key] = source[key];
  }
  return out;
}

const KNOWN_KEYS = [
  'password',
  'abstract',
  'message',
  'theme',
  'template',
  'tags',
  'wrong_pass_message',
  'wrong_hash_message',
  'silent',
  'autoSave',
  'decryptButton',
  'kdf',
];

function resolve(hexoConfig, postData, logger) {
  const log = logger || { info: () => {}, warn: () => {}, debug: () => {} };

  const hexoEncrypt = (hexoConfig && hexoConfig.encrypt) ? hexoConfig.encrypt : {};
  const post = postData || {};

  // Layer 1: defaults → hexo encrypt block (for top-level shared keys, NOT password/theme overrides per-post).
  let merged = deepMerge(DEFAULTS, shallowPickKnown(hexoEncrypt, KNOWN_KEYS));

  // Layer 2: post front-matter wins.
  merged = deepMerge(merged, shallowPickKnown(post, KNOWN_KEYS));

  // Deprecation: template → theme.
  if (merged.template !== undefined && merged.template !== null) {
    log.warn(
      'hexo-blog-encrypt: "template" is deprecated, use "theme" instead. ' +
      'See https://github.com/D0n9X1n/hexo-blog-encrypt#encrypt-theme'
    );
    if (merged.theme === DEFAULTS.theme) {
      merged.theme = merged.template;
    }
    delete merged.template;
  }

  // Password: undefined or empty-string disables encryption (caller short-circuits).
  if (merged.password === undefined || merged.password === null) return null;
  merged.password = String(merged.password);
  if (merged.password === '') return null;

  // KDF iteration floor + warn band.
  if (!merged.kdf || typeof merged.kdf !== 'object') merged.kdf = { iterations: DEFAULTS.kdf.iterations };
  if (merged.kdf.iterations === undefined) merged.kdf.iterations = DEFAULTS.kdf.iterations;
  if (!Number.isInteger(merged.kdf.iterations) || merged.kdf.iterations < FLOOR) {
    throw new Error(
      `hexo-blog-encrypt: kdf.iterations must be an integer ≥ ${FLOOR.toLocaleString('en-US').replace(/,/g, '_')} ` +
      `(got ${merged.kdf.iterations}). 100_000 is the absolute floor; ${RECOMMENDED.toLocaleString('en-US').replace(/,/g, '_')}+ is recommended (OWASP 2023).`
    );
  }
  if (merged.kdf.iterations < RECOMMENDED) {
    log.warn(
      `hexo-blog-encrypt: kdf.iterations=${merged.kdf.iterations} is below the OWASP-recommended 600_000. ` +
      'Consider raising it for stronger brute-force resistance.'
    );
  }

  // wrong_hash_message handling under GCM:
  //   - User explicitly set it → keep it but warn (deprecated alias).
  //   - User did NOT set it → default to the resolved wrong_pass_message.
  const userSetWhm =
    (post.wrong_hash_message !== undefined) || (hexoEncrypt.wrong_hash_message !== undefined);
  if (userSetWhm) {
    log.warn(
      'hexo-blog-encrypt: "wrong_hash_message" is deprecated under v4 (AES-GCM unifies wrong-password ' +
      'and tampered-ciphertext failures). The value is now an alias of "wrong_pass_message". ' +
      'Set "wrong_pass_message" instead.'
    );
  } else {
    merged.wrong_hash_message = merged.wrong_pass_message;
  }

  return merged;
}

module.exports = {
  resolve,
  DEFAULTS,
  FLOOR,
  RECOMMENDED,
};
