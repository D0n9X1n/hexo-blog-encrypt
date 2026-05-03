'use strict';

// Browser entry point. Reads the wire-format from the encrypted-post wrapper,
// drives the UI via `ui.js`, derives & decrypts via `crypto.js`, and persists
// the derived key (when autoSave is on) via `storage.js`.

const ui = require('./ui');
const cryptoMod = require('./crypto');
const dom = require('./dom');
const storage = require('./storage');

const SUPPORTED_FORMAT = '4';

function readWireFormat(mainElement) {
  const ds = mainElement.dataset;
  const ciphertextNode = mainElement.querySelector('script#hbeData');
  return {
    format: ds.hbeFormat,
    wpm: ds.wpm || 'Wrong password.',
    whm: ds.whm || ds.wpm || 'Wrong password.',
    saltHex: ds.salt,
    nonceHex: ds.nonce,
    iterations: parseInt(ds.kdfIterations, 10) || 250000,
    autoSave: ds.autoSave === 'true',
    ciphertextHex: ciphertextNode ? ciphertextNode.textContent.trim() : '',
  };
}

function dispatchDecryptEvent(mode) {
  // Fire on `window` for v3 back-compat — both READMEs document
  // `window.addEventListener('hexo-blog-decrypt', fn)` as the public API.
  // Old listeners that only access `e.type` continue to work; new listeners
  // can additionally read `e.detail.mode` ('manual' | 'cached').
  try {
    window.dispatchEvent(new CustomEvent('hexo-blog-decrypt', { detail: { mode } }));
  } catch (_e) {
    // CustomEvent constructor unavailable on very old browsers — fall back
    // to plain Event (no detail).
    try {
      window.dispatchEvent(new Event('hexo-blog-decrypt'));
    } catch (_e2) { /* ignore — no event API at all */ }
  }
}

function pageKey() {
  // Per-URL bucket so different encrypted posts don't collide in localStorage.
  return location.pathname + location.search;
}

async function reveal(mainElement, plaintext, mode) {
  dom.swapInDecryptedDOM(mainElement, plaintext);
  dispatchDecryptEvent(mode);
}

async function tryAutoDecrypt(mainElement, wire, guardedReveal) {
  if (!wire.autoSave) return false;
  const cachedKey = await storage.load({
    pageKey: pageKey(),
    expectedSaltHex: wire.saltHex,
    expectedNonceHex: wire.nonceHex,
  });
  if (!cachedKey) return false;
  const result = await cryptoMod.tryDecryptWithKey({
    key: cachedKey,
    nonceHex: wire.nonceHex,
    ciphertextHex: wire.ciphertextHex,
  });
  if (!result.ok) {
    storage.clear(pageKey());
    return false;
  }
  await guardedReveal(result.plaintext, 'cached');
  return true;
}

async function handleSubmit(mainElement, wire, form, guardedReveal) {
  ui.clearError(mainElement);
  ui.setBusy(form, true);
  const password = ui.readPassword(form);
  if (!password) {
    ui.setBusy(form, false);
    ui.showError(mainElement, wire.wpm);
    return;
  }
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
    ui.setBusy(form, false);
  }
  if (!result.ok) {
    ui.showError(mainElement, wire.wpm);
    return;
  }
  if (wire.autoSave) {
    await storage.save({
      pageKey: pageKey(),
      key: result.key,
      saltHex: wire.saltHex,
      nonceHex: wire.nonceHex,
      autoSave: true,
    });
  }
  await guardedReveal(result.plaintext, 'manual');
}

async function bootstrap() {
  const mainElement = document.getElementById('hexo-blog-encrypt');
  if (!mainElement) return;
  const wire = readWireFormat(mainElement);

  if (wire.format !== SUPPORTED_FORMAT) {
    ui.showError(
      mainElement,
      'hexo-blog-encrypt: this page was built with an incompatible plugin version. ' +
      'Rebuild the site after upgrading the plugin.'
    );
    return;
  }

  // Single-shot reveal guard: with autoSave on, `tryAutoDecrypt` runs in
  // parallel with the form submit handler. If the user types fast enough
  // to submit BEFORE auto-decrypt resolves, both paths can call `reveal`
  // on the same `mainElement` — the second `replaceChild` would throw
  // because the wrapper is already detached. The guard makes whoever
  // wins the race the sole DOM-mutator.
  let revealed = false;
  const guardedReveal = async (plaintext, mode) => {
    if (revealed) return;
    revealed = true;
    await reveal(mainElement, plaintext, mode);
  };

  const form = mainElement.querySelector('#hbeForm');
  ui.attachSubmit(form, () => handleSubmit(mainElement, wire, form, guardedReveal));

  const auto = await tryAutoDecrypt(mainElement, wire, guardedReveal);
  if (!auto && !revealed) {
    const input = mainElement.querySelector('#hbePass');
    if (input) input.focus();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}
