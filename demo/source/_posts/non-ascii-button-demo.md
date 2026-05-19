---
title: Non-ASCII Button Text Demo
date: 2024-01-02 00:00:00
permalink: /demo/non-ascii-button/
encrypt: true
password: hello
theme: default
decryptButton:
  text: 🔓解密復号복호화فكالتشفيرРасшифроватьДлинноеСловоБезПробелов · 解密 · 復号 · 복호화 · فك التشفير
tags:
  - theme-demo
  - button-demo
---

This post exercises the decrypt-button layout fix from PR #232 with a long,
mixed-script button label: emoji, CJK (Simplified + Traditional + Japanese +
Korean), RTL Arabic, and Cyrillic in one string.

What to look for:

- The button renders **below** the password input on its own line.
- The button is **horizontally centered** under the input, regardless of
  viewport width.
- The label **wraps** instead of overflowing the form when the viewport is
  narrow.
- Bidi (RTL Arabic) text inside the button doesn't shove the rest of the
  label off-center.
- Click submits AND Enter-key still submits.

<!-- more -->

# Encrypted body

Password: `hello`

The secret is **the eagle has landed**.

If you can read this, your decrypt button rendered correctly with the
multi-script label above.
