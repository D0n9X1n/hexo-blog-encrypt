---
title: MathJax After Decryption
date: 2024-01-10 00:00:00
permalink: /demo/mathjax/
encrypt: true
password: hello
theme: default
tags:
  - feature-demo
---

This post demonstrates running [MathJax](https://www.mathjax.org/) on **encrypted** content. The password is `hello`. MathJax itself is loaded from a CDN inside the encrypted body, so nothing about the math is fetched (or revealed) until you decrypt.

<!-- more -->

## The math (encrypted)

Inline: $E = mc^2$ and $\sigma = \sqrt{\frac{1}{N}\sum_{i=1}^{N}(x_i - \mu)^2}$.

Display:

$$
\int_{-\infty}^{\infty} e^{-x^2}\,dx = \sqrt{\pi}
$$

$$
i\hbar\frac{\partial}{\partial t}\Psi(x,t) = \hat{H}\Psi(x,t)
$$

## Why this works

The browser bundle re-creates `<script>` tags inside the decrypted body as live nodes, and the `hexo-blog-decrypt` event fires *after* the DOM swap. So MathJax (loaded async from CDN inside the encrypted body) is configured BEFORE it loads, finds the math the moment it's ready, and typesets it.

```html
<!-- 1. Configure MathJax before it loads -->
<script>
  window.MathJax = {
    tex: { inlineMath: [['$', '$'], ['\\(', '\\)']] },
    startup: { typeset: true }
  };
</script>

<!-- 2. Load MathJax (async, from CDN) -->
<script src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-chtml.js" async></script>
```

<!--
  Live wiring. The two <script> tags below MUST stay byte-identical
  to the documented snippet above so what you see is what runs.
-->
<script>
  window.MathJax = {
    tex: { inlineMath: [['$', '$'], ['\\(', '\\)']] },
    startup: { typeset: true }
  };
</script>
<script src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-chtml.js" async></script>
