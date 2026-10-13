# Browser Support

[简体中文](Browser-Support-zh-CN)

The browser-side decryption uses the **Web Crypto API** (`crypto.subtle`), which has two hard requirements:

1. A modern browser
2. A **secure context** — HTTPS, or `http://localhost` for local dev

## Supported browsers

| Browser | Minimum | How we test |
|---|---|---|
| Chromium / Chrome / Edge | **92+** | Playwright Chromium runs every PR's full e2e suite |
| Firefox | **90+** | Spot-checked manually at release; same Web Crypto API |
| Safari (macOS) | **14+** | Manual smoke test at release |
| Safari (iOS) | **14+** | Manual smoke test at release |

Older browsers will silently fail to decrypt — `crypto.subtle` is `undefined` and the bundle short-circuits with an inline error message. The page itself loads fine; only the decryption is unavailable.

## The HTTPS requirement

Web Crypto is **only** available in a [secure context](https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts):

- ✅ `https://your-site.example.com/...`
- ✅ `http://localhost:4000/...` (any port)
- ✅ `http://127.0.0.1:4000/...`
- ❌ `http://your-site.example.com/...`
- ❌ `http://192.168.1.10:4000/...` (LAN IP, not localhost)
- ❌ `file:///Users/you/site/index.html`

If your readers see "decryption failed" universally, **check the page URL is `https://`**. This is the single most common cause of "it works on my localhost but not on the deployed site."

## What about service workers / extensions?

The bundle is plain client-side JS — no service worker, no extension manifest, no special permissions. It runs inside the browser's main JS context like any other script.

## Mobile browsers

Modern mobile browsers (iOS Safari ≥ 14, Chrome on Android ≥ 92, Firefox on Android ≥ 90) work without changes. Touch keyboards, password autofill, and biometric autofill (Touch ID / Face ID picking the right entry from the system password manager) all work — the password field is a standard HTML `<input type="password">`.

## Old IE / very old browsers

There is **no fallback** for browsers without Web Crypto. v3 used CryptoJS (a pure-JS implementation) which worked in IE11. v4 dropped CryptoJS in favor of native Web Crypto for security and performance reasons:

- Native Web Crypto runs the AES round in C/assembly with hardware acceleration where available
- CryptoJS runs in JS, leaks key material into the JS heap, and was last meaningfully updated years ago

If you absolutely need IE11 support, pin v3.x and avoid the v4 features.

## Verifying support locally

In your browser's JS console:

```js
typeof crypto.subtle           // "object" — good
crypto.subtle.encrypt          // function — good
window.isSecureContext         // true — good
```

If any of these returns `undefined` / `false`, decryption will fail.

## CI / automation testing

Headless Chromium via Playwright is what our CI exercises (`tests/e2e/`). It runs in a secure context (Playwright sets up the test server on localhost) and supports the full Web Crypto API. If you're integrating this plugin into your own CI, the same setup works.
