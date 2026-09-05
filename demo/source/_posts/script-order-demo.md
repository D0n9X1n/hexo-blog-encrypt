---
title: Script Loading After Decryption
date: 2026-09-04 00:00:00
permalink: /demo/script-order/
password: hello
theme: default
autoSave: true
stableSalt: true
abstract: 'An external library, an inline initializer, and a decrypt callback. Password: hello.'
message: 'Password is "hello" — unlock the script-loading demo.'
tags:
  - feature-demo
---

This encrypted post demonstrates the dependency order behind the DPlayer fix in
**4.0.3**. The password is **hello**. It uses a tiny local widget library instead of
a video service, so the example needs no CDN or external media.

<!-- more -->

## A library must load before its initializer

The three steps below run inside the decrypted post. The inline initializer depends
on an external JavaScript file; the callback is registered only after initialization.
On older versions the initializer could run too early, leaving the widget inactive.

{% raw %}
<style>
#hbe-script-demo {
  --demo-ink: #173747;
  --demo-blue: #0d597a;
  --demo-line: #b4cfdb;
  --demo-success: #235b42;
  box-sizing: border-box;
  max-width: 100%;
  margin: 1.5em 0;
  padding: clamp(1em, 4vw, 2em);
  color: var(--demo-ink);
  background: #f5fafc;
  border-left: 4px solid var(--demo-blue);
  line-height: 1.6;
}
#hbe-script-demo h3 { margin-top: 0; color: inherit; }
#hbe-script-demo ol { padding-left: 1.5em; }
#hbe-script-demo li { margin: .5em 0; }
#hbe-script-demo [data-complete="true"] { color: var(--demo-success); font-weight: 600; }
#hbe-script-demo .demo-actions { display: flex; gap: .75em; flex-wrap: wrap; margin-top: 1.25em; }
#hbe-script-demo button {
  min-height: 44px;
  padding: .6em 1em;
  border: 1px solid var(--demo-blue);
  border-radius: 4px;
  background: var(--demo-blue);
  color: #fff;
  font: inherit;
  cursor: pointer;
}
#hbe-script-demo button.secondary { color: var(--demo-blue); background: transparent; }
#hbe-script-demo button:focus-visible { outline: 3px solid var(--demo-blue); outline-offset: 3px; }
#hbe-demo-output { border-top: 1px solid var(--demo-line); padding-top: 1em; }
</style>
<section id="hbe-script-demo" aria-labelledby="hbe-demo-title">
  <h3 id="hbe-demo-title">Watch the dependency order</h3>
  <p id="hbe-demo-status" role="status" aria-live="polite">Waiting for the library.</p>
  <ol aria-label="Script execution steps">
    <li id="hbe-demo-library">External library: waiting</li>
    <li id="hbe-demo-init">Inline initializer: waiting</li>
    <li id="hbe-demo-callback">Decrypt callback: waiting</li>
  </ol>
  <div class="demo-actions">
    <button type="button" id="hbe-demo-try">Try the widget</button>
    <button type="button" id="hbe-demo-reset" class="secondary">Forget saved key and reload</button>
  </div>
  <p id="hbe-demo-output" aria-live="polite">Once ready, try the widget to confirm its handler is connected.</p>
</section>
<script src="../../assets/script-order-widget.js" onerror="document.getElementById('hbe-demo-status').textContent = 'Could not load the library. Reload this page to retry.';"></script>
<script>
window.HbeScriptOrderDemo.mount(document.getElementById('hbe-script-demo'));
window.addEventListener('hexo-blog-decrypt', function (event) {
  var callback = document.getElementById('hbe-demo-callback');
  callback.textContent = 'Decrypt callback: received after initialization';
  callback.dataset.complete = 'true';
  document.getElementById('hbe-demo-status').textContent = event.detail.mode === 'cached'
    ? 'Ready. Decrypted with the saved key.'
    : 'Ready. Decrypted with a password.';
}, { once: true });
</script>
{% endraw %}

### Try a slow connection

Open your browser's Network tools, disable the cache, and select a slow connection.
Choose **Forget saved key and reload**, then enter **hello** again. The decrypted
content becomes visible while its external library loads; initialization and the
callback follow in that order. Automated browser tests hold this exact library
request open to reproduce the slow-network case deterministically.

### Try a cached reload

This page opts in to `autoSave: true` and `stableSalt: true`. Reload to decrypt with
the saved key and see the cached result. Only the derived key is saved in your
browser, not your password or plaintext. Use the reset button on a shared device.

### What this proves

An ordinary external script finishes loading before the following inline script
uses it. The `hexo-blog-decrypt` event arrives after restored external scripts load,
fail, or reach their 15-second load deadline. An explicit `async` script remains
independent; `defer` is not a second document-parse phase. Inline `type="module"`
scripts and asynchronous work inside scripts retain native scheduling, so use their
own readiness signals when you depend on them. This is not a DPlayer playback test.
