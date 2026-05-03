---
title: Callback Demo Post
slug: callback-fixture
date: 2024-01-03 00:00:00
encrypt: true
password: hello
theme: default
tags:
  - callback-fixture
---
This post is the e2e regression for the `hexo-blog-decrypt` window
CustomEvent. The inline `<script>` below is part of the encrypted
body — under v4 the browser bundle re-creates `<script>` tags as
live nodes (see `src/browser/dom.js#convertHTMLToElement`), so the
listener registers AFTER the DOM swap but BEFORE
`dispatchDecryptEvent` is called, and `alert()` fires once.

<!-- more -->

The secret phrase is **CALLBACK-FIRED-7F2A**.

<script>
  window.addEventListener('hexo-blog-decrypt', function (e) {
    var mode = (e && e.detail && e.detail.mode) || 'unknown';
    window.alert('Decryption callback fired! mode = ' + mode);
  });
</script>
