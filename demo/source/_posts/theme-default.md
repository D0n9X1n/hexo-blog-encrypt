---
title: Theme Demo — default
date: 2024-01-01 00:00:00
permalink: /demo/theme/default/
encrypt: true
password: hello
theme: default
tags:
  - theme-demo
---

This is the public preview text for the **default** theme. The encrypted body is below the cut.

<!-- more -->

# Encrypted body — theme: default

The password for this post is `hello` — type it in to decrypt.

This text was encrypted at build time with **AES-256-CBC**. The browser derives the AES key from your password using **PBKDF2-SHA256** (1024 iterations for the key, 512 iterations for the IV), then performs the decryption client-side via the Web Crypto API.

```js
// What the wrapper template injects on each encrypted post:
<script data-pjax src="/hexo-blog-encrypt/lib/hbe.js"></script>
<link href="/hexo-blog-encrypt/css/hbe.style.css" rel="stylesheet" type="text/css">
```

> The secret phrase is **the eagle has landed**.

If you can read this, the `default` theme works correctly with this build of `hexo-blog-encrypt`.
