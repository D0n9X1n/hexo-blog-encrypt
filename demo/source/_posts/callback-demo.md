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

```js
window.addEventListener('hexo-blog-decrypt', (e) => {
  console.log('[demo] decryption succeeded — mode:', e.detail && e.detail.mode);
  // e.g. hljs.highlightAll();
  // e.g. mermaid.init();
  // e.g. mathjax.typesetPromise();
});
```

> The secret phrase is **the eagle has landed**.

This is the same hook documented in the README under [How to make some plugins work](https://github.com/D0n9X1n/hexo-blog-encrypt#how-to-make-some-plugins-work-after-decryption).
