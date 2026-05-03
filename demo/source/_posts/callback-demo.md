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

The browser-side `hbe.js` dispatches a `hexo-blog-decrypt` event on `window` after a successful decryption. Listen for it from your theme to re-initialize syntax highlighting, refresh a Table of Contents, lazy-load images, etc.

```js
window.addEventListener('hexo-blog-decrypt', () => {
  console.log('[demo] decryption succeeded — rerunning post-render hooks');
  // e.g. hljs.highlightAll();
  // e.g. mermaid.init();
  // e.g. mathjax.typesetPromise();
});
```

> The secret phrase is **the eagle has landed**.

This is the same hook documented in the README under [How to make some plugins work](https://github.com/D0n9X1n/hexo-blog-encrypt#how-to-make-some-plugins-work-after-decryption).
