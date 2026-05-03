---
title: Decryption Callback Demo
date: 2024-01-09 00:00:00
permalink: /demo/callback/
encrypt: true
password: hello
theme: default
tags:
  - feature-demo
---

This post demonstrates the `hexo-blog-decrypt` event hook. The password is `hello`.

<!-- more -->

# Hooking into the decryption event

The browser bundle dispatches a `hexo-blog-decrypt` event on `window` after a successful decryption. Listen for it from your theme to re-initialize syntax highlighting, refresh a Table of Contents, lazy-load images, etc. Under v4, the event is a `CustomEvent` whose `detail.mode` reads `'manual'` for a fresh password decrypt and `'cached'` when an opt-in `autoSave` reload auto-decrypts; v3-style listeners that ignore `detail` keep working.

This post wires up exactly the snippet below — that's why you saw a `window.alert()` pop up the moment you decrypted. Reload the page (with the wrong password or in a new tab) to see it again.

```js
window.addEventListener('hexo-blog-decrypt', function (e) {
  var mode = (e && e.detail && e.detail.mode) || 'unknown';
  console.log('[demo] hexo-blog-decrypt fired, mode:', mode);
  window.alert('Decryption callback fired! mode = ' + mode);
});
```

> The secret phrase is **the eagle has landed**.

This is the same hook documented in the README under [How to make some plugins work](https://github.com/D0n9X1n/hexo-blog-encrypt#how-to-make-some-plugins-work-after-decryption).

<!--
  Live wiring of the callback above. Inline `<script>` tags inside an
  encrypted post body get re-executed by the browser bundle's
  `convertHTMLToElement` helper (see src/browser/dom.js), so this
  listener is registered BEFORE the bundle dispatches
  `hexo-blog-decrypt` — meaning you'll see an `alert()` immediately
  after entering the right password. The block below MUST stay
  byte-identical to the documented snippet above.
-->
<script>
window.addEventListener('hexo-blog-decrypt', function (e) {
  var mode = (e && e.detail && e.detail.mode) || 'unknown';
  console.log('[demo] hexo-blog-decrypt fired, mode:', mode);
  window.alert('Decryption callback fired! mode = ' + mode);
});
</script>
