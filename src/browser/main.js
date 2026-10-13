'use strict';

// Browser entry point. Finds every encrypted-post wrapper on the page, drives
// the UI via `ui.js`, derives & decrypts via `crypto.js`, and persists the
// derived key (when autoSave is on) via `storage.js`.
//
// The bundle is injected once per encrypted post, so it may execute several
// times on one page (index/archive pages, PJAX). Every wrapper is therefore
// initialised exactly once, guarded by a flag on the element itself (shared by
// all bundle executions), and every lookup is scoped to its wrapper.

const ui = require('./ui');
const cryptoMod = require('./crypto');
const dom = require('./dom');
const storage = require('./storage');
const i18n = require('./i18n');

const SUPPORTED_FORMAT = '4';
// The iteration count always comes from `data-kdf-iterations`, which the
// server writes for every post from its single default
// (`DEFAULT_ITERATIONS` in src/server/crypto.js). This fallback only applies
// to a hand-written theme that omits the attribute; a server unit test keeps
// it equal to the server default.
const FALLBACK_KDF_ITERATIONS = 250000;
// Any element a theme may use as the wrapper. Decrypted containers keep
// id="hexo-blog-encrypt", so they also match: that keeps each post's
// position (and storage id) stable after earlier posts are revealed.
const WRAPPER = '[data-hbe-format],.hbe-container,#hexo-blog-encrypt';
const INIT_FLAG = '__hbeInit';

function webCryptoAvailable() {
  return !!(window.isSecureContext && window.crypto && window.crypto.subtle);
}

function readWireFormat(el) {
  const ds = el.dataset;
  const ciphertextNode = el.querySelector('script#hbeData,script[type="hbeData"]');
  return {
    format: ds.hbeFormat,
    wpm: ds.wpm || 'Wrong password.',
    whm: ds.whm || ds.wpm || 'Wrong password.',
    saltHex: ds.salt,
    nonceHex: ds.nonce,
    iterations: parseInt(ds.kdfIterations, 10) || FALLBACK_KDF_ITERATIONS,
    autoSave: ds.autoSave === 'true',
    ciphertextHex: ciphertextNode ? ciphertextNode.textContent.trim() : '',
  };
}

function dispatchDecryptEvent(mode, element) {
  // Fire on `window` for v3 back-compat — both READMEs document
  // `window.addEventListener('hexo-blog-decrypt', fn)` as the public API.
  // `detail.mode` is 'manual' | 'cached'; `detail.element` is the revealed
  // container, so pages with several encrypted posts can tell them apart.
  try {
    window.dispatchEvent(new CustomEvent('hexo-blog-decrypt', { detail: { mode, element } }));
  } catch (_e) {
    try {
      window.dispatchEvent(new Event('hexo-blog-decrypt'));
    } catch (_e2) { /* ignore — no event API at all */ }
  }
}

// Per-post storage id: the page URL, plus the post's position for the 2nd+
// post on a page. The first post keeps the bare URL, so keys saved before
// multi-post support keep working. The salt stored with each entry guards
// against a post moving position (mismatch => entry dropped, re-prompt).
function storageId(el) {
  const base = location.pathname + location.search;
  const index = Array.prototype.indexOf.call(document.querySelectorAll(WRAPPER), el);
  return index > 0 ? base + '#' + index : base;
}

function setup(el) {
  if (el[INIT_FLAG] || el.classList.contains('hbe-decrypted-content')) return;
  el[INIT_FLAG] = true;
  const wire = readWireFormat(el);
  const text = i18n.messages();

  if (wire.format !== SUPPORTED_FORMAT) {
    ui.showError(el, text.incompatible);
    return;
  }

  const form = ui.findForm(el);
  const input = ui.findInput(el);
  ui.ensureUniqueId(el, input);
  ui.trackFilled(input);
  const id = storageId(el);
  // autoSave turned off for this post (e.g. after a rebuild): forget any key
  // saved while it was on, so it stops unlocking on this device.
  if (!wire.autoSave) storage.clear(id);

  // Web Crypto only exists in secure contexts (HTTPS / localhost). Without
  // it every attempt would fail, so say why instead of "wrong password",
  // and never attempt a derivation.
  if (!webCryptoAvailable()) {
    ui.showError(el, text.noCrypto);
    ui.attachSubmit(form, () => ui.showError(el, text.noCrypto));
    return;
  }

  // Single-shot reveal guard: with autoSave on, the cached-key attempt runs
  // in parallel with the submit handler; whichever wins mutates the DOM.
  let revealed = false;
  const reveal = async (plaintext, mode) => {
    if (revealed) return;
    revealed = true;
    const decrypted = await dom.swapInDecryptedDOM(el, plaintext);
    if (mode === 'cached') {
      ui.addForgetButton(decrypted, text, () => storage.clear(id));
    }
    dispatchDecryptEvent(mode, decrypted);
  };

  ui.attachSubmit(form, async () => {
    ui.clearError(el);
    const password = input ? input.value : '';
    if (!password) {
      ui.showError(el, wire.wpm);
      ui.refocus(input);
      return;
    }
    ui.setBusy(form, input, true);
    let result;
    try {
      result = await cryptoMod.tryDecryptWithPassword({
        password,
        saltHex: wire.saltHex,
        nonceHex: wire.nonceHex,
        ciphertextHex: wire.ciphertextHex,
        iterations: wire.iterations,
      });
    } finally {
      ui.setBusy(form, input, false);
    }
    if (!result.ok) {
      ui.showError(el, wire.wpm);
      // Re-enabled by setBusy above, so focus/select work again.
      ui.refocus(input);
      return;
    }
    if (wire.autoSave) {
      await storage.save({ id, key: result.key, saltHex: wire.saltHex, nonceHex: wire.nonceHex, autoSave: true });
    }
    await reveal(result.plaintext, 'manual');
  });

  tryAutoDecrypt(wire, id, reveal).then((auto) => {
    // Focus the first locked post only; never steal focus from the reader.
    const active = document.activeElement;
    if (!auto && !revealed && input && (!active || active === document.body)) input.focus();
  });
}

async function tryAutoDecrypt(wire, id, reveal) {
  if (!wire.autoSave) return false;
  const cachedKey = await storage.load({ id, expectedSaltHex: wire.saltHex });
  if (!cachedKey) return false;
  const result = await cryptoMod.tryDecryptWithKey({
    key: cachedKey,
    nonceHex: wire.nonceHex,
    ciphertextHex: wire.ciphertextHex,
  });
  if (!result.ok) {
    storage.clear(id);
    return false;
  }
  await reveal(result.plaintext, 'cached');
  return true;
}

// Public, idempotent initializer: sets up every not-yet-initialized wrapper
// inside `root` (default: the whole document). Safe to call any number of
// times, e.g. from a PJAX/SPA theme after swapping page content.
function init(root) {
  root = root || document;
  const wrappers = Array.prototype.slice.call(root.querySelectorAll(WRAPPER));
  if (root.matches && root.matches(WRAPPER)) wrappers.unshift(root);
  for (let i = 0; i < wrappers.length; i++) setup(wrappers[i]);
}

// The bundle may execute once per post and again on every PJAX navigation.
// Only the first execution exposes the API and registers listeners; later
// ones just run init (wrappers are guarded per element).
if (!window.hexoBlogEncrypt) {
  window.hexoBlogEncrypt = { init };
  storage.purgeLegacy();
  const rerun = () => window.hexoBlogEncrypt.init();
  ['pjax:complete', 'pjax:success', 'swup:contentReplaced', 'turbo:load'].forEach((name) => {
    document.addEventListener(name, rerun);
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => init());
} else {
  init();
}
