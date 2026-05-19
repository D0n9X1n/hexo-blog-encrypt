---
title: Hidden Decrypt Button Demo
date: 2024-01-02 01:00:00
permalink: /demo/hidden-button/
encrypt: true
password: hello
theme: default
decryptButton:
  show: false
tags:
  - theme-demo
  - button-demo
---

This post exercises the `decryptButton.show: false` fix from PR #232.

What to look for:

- **No visible decrypt button** under the password input (the button element
  carries the `hbe-button-hidden` class so it's removed from layout, not
  just blanked).
- The password input is still there.
- Typing the password and pressing **Enter** still decrypts — form
  submission via keyboard is preserved.

<!-- more -->

# Encrypted body

Password: `hello`

The secret is **the eagle has landed**.

If you can read this with no visible button on the prompt screen, the
hidden-button contract works.
