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

This text was encrypted at build time with **AES-256-GCM**. The browser derives the AES key from your password via **PBKDF2-SHA256** (250,000 iterations by default; configurable per-post via `kdf.iterations`), then performs the decryption client-side via the Web Crypto API. The GCM auth tag means a tampered ciphertext fails closed with the same wrong-password message — no plaintext leak, no separate HMAC step.

The plugin auto-injects a `<script>` referencing the content-hashed browser bundle (e.g. `lib/hbe.<hash>.js`) and the stylesheet, so encrypted posts work without any theme edits.

> The secret phrase is **the eagle has landed**.

If you can read this, the `default` theme works correctly with this build of `hexo-blog-encrypt`.
