# hexo-blog-encrypt

[![GitHub release](https://img.shields.io/github/v/release/D0n9X1n/hexo-blog-encrypt?include_prereleases&logo=github&label=release&color=brightgreen)](https://github.com/D0n9X1n/hexo-blog-encrypt/releases)
[![npm](https://img.shields.io/npm/v/hexo-blog-encrypt?logo=npm&color=brightgreen)](https://www.npmjs.com/package/hexo-blog-encrypt)
[![npm downloads](https://img.shields.io/npm/dm/hexo-blog-encrypt?logo=npm&label=downloads)](https://www.npmjs.com/package/hexo-blog-encrypt)
[![License](https://img.shields.io/npm/l/hexo-blog-encrypt?color=brightgreen)](./LICENSE)
[![Tests](https://github.com/D0n9X1n/hexo-blog-encrypt/actions/workflows/test.yml/badge.svg?branch=master)](https://github.com/D0n9X1n/hexo-blog-encrypt/actions/workflows/test.yml)
[![Live Demo](https://img.shields.io/badge/demo-online-brightgreen?logo=github)](https://d0n9x1n.github.io/hexo-blog-encrypt/)

[中文说明](./ReadMe.zh.md)

## What's this

- ~~First of all, the **BEST** post encryption plugin in the universe for hexo.(But what about the other plugins?)~~

- It is for those who write a post, but don't want everyone to read it. Thus, password is required in certain pages to access these encrypted posts.

- Encryption is simple on wordpress, emlog or other blog systems, except hexo. :(

- So it's "hexo-blog-encrypt"'s time.

## Features

- Once you enter the correct password, the encrypted post is decrypted client-side. By default the password is **not** persisted; opt in with `autoSave: true` (per-post or in `_config.yml`) to have a derived key cached in `localStorage` so a subsequent reload of the same page auto-decrypts. If there are scripts in the post, they will be executed once the post is decrypted.

- Support preset tag-specified password.

- All functions are provided by the native APIs. We use [Crypto](https://nodejs.org/dist/latest-v12.x/docs/api/crypto.html) in Node.js, and use [Web Crypto API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API) in Browsers.

- [PBKDF2](https://tools.ietf.org/html/rfc2898) with [SHA-256](https://nvlpubs.nist.gov/nistpubs/FIPS/NIST.FIPS.180-4.pdf) is used to derive keys, and we use [AES-256-GCM](https://csrc.nist.gov/publications/detail/sp/800-38d/final) for both encryption and authenticated decryption — the GCM auth tag detects any modification of the ciphertext (replacing the v3 separate HMAC step).

- Promise is widely used to make sure our main procedures are asynchronous, so that there is little chance for the process to be blocked, and the experience will be more fluent.

- Template theme supported, you can use [`default`, `blink`, `flip`, `shrink`, `surge`, `up`, `wave`, `xray`] to set up your template theme, and [CHECK ONLINE](https://d0n9x1n.github.io/hexo-blog-encrypt/tags/theme-demo/).

- Outdated browsers may not work well. In such case, please upgrade your browser.

## Online demo

- See [Demo Page](https://d0n9x1n.github.io/hexo-blog-encrypt/), **all passwords are `hello`**.

## Browser support

The runtime uses Web Crypto (`crypto.subtle`), which requires a **secure
context** (HTTPS or `http://localhost`). Verified:

| Browser | Minimum | Notes |
| --- | --- | --- |
| Chromium / Edge | 92+ | Tested in CI via Playwright |
| Firefox | 90+ | |
| Safari (macOS / iOS) | 14+ | Manual smoke at release time |

If your site is served over plain HTTP from a non-localhost host,
decryption will silently fail (`crypto.subtle` is `undefined`). Always
use HTTPS in production.

## Why upgrade from v3?

v4 isn't a cosmetic refresh — it closes real security gaps and fixes UX
problems v3 had. The headline reasons:

- **Stronger crypto.** **AES-256-GCM** with a built-in authentication
  tag replaces v3's AES-CBC + separate HMAC. One primitive, one auth
  path, hardware-accelerated, and immune to a class of CBC
  padding-oracle and HMAC-comparison bugs.
- **Per-post salt + nonce.** v3 used the same salt for every post, so
  the same password derived the same key everywhere. v4 derives an
  independent key per post — an attacker can't amortize one password's
  PBKDF2 work across other posts that share the password.
- **Stronger KDF defaults.** v3 used **1,024** PBKDF2-SHA256 iterations
  — far below current recommendations and easily amortized across many
  guesses on modern hardware. v4 defaults to **250,000** (≈ 240× more
  work per guess) and recommends 600,000+ (OWASP 2023). Tunable per
  post via `kdf.iterations`.
- **Privacy by default.** v3 always cached decrypted posts in
  `localStorage`, so anyone with subsequent device access could
  re-read them. v4 defaults to `autoSave: false`; you opt in per post
  or globally.
- **Inline error messages.** v3 fired a `window.alert()` dialog on a
  wrong password — disruptive, especially on mobile. v4 shows the
  error inline next to the password field (`role="alert"`).
- **Optional click-to-decrypt button.** Discoverable for visitors who
  don't realise Enter submits the form. Label is configurable.
- **Smaller bundle.** Drops the bundled CryptoJS dependency in
  favour of the browser's native Web Crypto API. The shipped browser
  bundle is ≈ 6 KB minified.
- **Tested.** Server suite at 100 % line / branch / function coverage
  + Playwright e2e across all 8 themes. v3 had effectively zero
  automated tests; v4 is regression-guarded on every push.

If you care about offline password guessing against your generated
HTML, or about shared-device exposure of cached keys — upgrade.

The deeper rationale per change lives on the wiki:
[Migration v3 → v4](https://github.com/D0n9X1n/hexo-blog-encrypt/wiki/Migration-v3-to-v4).

## Upgrading from v3

v4 changed the wire format (AES-GCM, per-post salt + nonce). Existing
encrypted output cannot be read by v4 and vice versa, so:

1. Upgrade the plugin: `npm install --save hexo-blog-encrypt@^4`.
2. Rebuild from source: `hexo clean && hexo generate`.
3. Purge your CDN if you use one (the post HTML changes byte-for-byte
   on every build by design — fresh nonce per encryption — but the
   runtime asset URL `lib/hbe.<hash>.js` is content-hashed and only
   changes when the bundle changes).
4. Optional: drop `wrong_hash_message` from your config and front-matter
   (deprecated in v4, removed in v5).

No source `.md` files are touched. See [CHANGELOG.md](./CHANGELOG.md)
for the full breaking-changes list and the new `decryptButton` /
`autoSave` / `kdf.iterations` options.

## Install

- `npm install --save hexo-blog-encrypt`

- or `yarn add hexo-blog-encrypt` (require [Yarn](https://yarnpkg.com/en/))

## Quick start

- Add the "password" value to your post's front matter like:

```markdown

---
title: Hello World
date: 2016-03-30 21:18:02
password: hello
---

```

- Then use `hexo clean && hexo g && hexo s` to see your encrypted post locally.

## Password Priority

post's front matter > encrypt tags

## Advanced settings

### in post's front matter

```markdown

---
title: Hello World
tags:
- encryptAsDiary
date: 2016-03-30 21:12:21
password: mikemessi
abstract: Here's something encrypted, password is required to continue reading.
message: Hey, password is required here.
wrong_pass_message: Oh, this is an invalid password. Check and try again, please.
# Deprecated under v4 — AES-GCM unifies wrong-password and tampered-ciphertext
# failures, so this option is now an alias of `wrong_pass_message`. Set
# `wrong_pass_message` instead.
wrong_hash_message: Oh, these decrypted content cannot be verified, but you can still have a look.
---

```

### In `_config.yml`

#### Example

```yaml
# Security
encrypt: # hexo-blog-encrypt
  abstract: Here's something encrypted, password is required to continue reading.
  message: Hey, password is required here.
  tags:
  - {name: encryptAsDiary, password: passwordA}
  - {name: encryptAsTips, password: passwordB}
  wrong_pass_message: Oh, this is an invalid password. Check and try again, please.
  # Deprecated under v4 (alias of `wrong_pass_message`). See note above.
  wrong_hash_message: Oh, these decrypted content cannot be verified, but you can still have a look.

  # ── v4 keys (all optional, safe defaults) ────────────────────────────
  # Render a visible "Decrypt" button next to the password field.
  # Themes that already include a button via `<%- decrypt_button %>`
  # ignore this option. Default: true.
  decryptButton:
    show: true
    text: Decrypt

  # Cache the decrypted plaintext in localStorage so reloads skip the
  # password prompt. OFF by default — opt in per post via front-matter
  # `autoSave: true`, or globally here. Cache key is namespaced under
  # `hbe.v4.<post-permalink-hash>`.
  autoSave: false

  # PBKDF2 iteration count. Floor: 100_000. Recommended ≥ 600_000
  # (OWASP 2023 for PBKDF2-SHA256). Lower-than-recommended values log a
  # warning at build time. Default: 250_000.
  kdf:
    iterations: 250000

```

#### To disable tag encryption

Just set the `password` property in front matter to `""`.

Example:

```
---
title: Callback Test
date: 2019-12-21 11:54:07
tags:
    - A Tag should be encrypted
password: ""
---

Use a "" to disable tag encryption.
```

### Config priority

post's front matter > `_config.yml` (in the root directory) > default

### About Callback
In some blogs, some elements may not be displayed normally after decryption. This is a known issue. The current solution is to check the code in your blog to learn which functions are called when the onload event occurs.
Then write these code at the end of your post. For example:

```
---
title: Callback Test
date: 2019-12-21 11:54:07
tags:
    - Encrypted
---

This is a blog to test Callback functions. You just need to add code at the end of your post as follows:

It will be called after the blog is decrypted.

<script>
    // add script tag and code at the end of your post
    alert("Hello World");
</script>
```

Demo: [Callback Example](https://d0n9x1n.github.io/hexo-blog-encrypt/demo/callback/).

### After Decrypt Event
Thanks to @[f-dong](https://github.com/f-dong), we now will trigger a event named `hexo-blog-decrypt`, so you can add a call back to listen to that event.

```
// trigger event
var event = new Event('hexo-blog-decrypt');
window.dispatchEvent(event);
```

### Encrypt TOC

If you has a post with TOC, you should change the code of your template. Take the default theme 'landscape' as an example:

+ You should find the `article.ejs` file located at `hexo/themes/landscape/layout/_partial/article.ejs`.
+ Find the code like <% post.content %>, which is usually at line 30.
+ Replace the <% post.content %> with the following code block:

```
<% if(post.toc == true){ %>
  <div id="toc-div" class="toc-article" <% if (post.encrypt == true) { %>style="display:none" <% } %>>
    <strong class="toc-title">Index</strong>
      <% if (post.encrypt == true) { %>
        <%- toc(post.origin, {list_number: true}) %>
      <% } else { %>
        <%- toc(post.content, {list_number: true}) %>
      <% } %>
  </div>
<% } %>
<%- post.content %>
```

### Disable logging
If you want to disable the logging, you can add a silent property in `_config.yml` and set it to true.

```yaml
# Security
encrypt: # hexo-blog-encrypt
  silent: true
```

This would disable the logging like `INFO  hexo-blog-encrypt: encrypting "{Blog Name}" based on Tag: "EncryptedTag".`.

### Encrypt Theme
Previously, we use `template` to let users modify their own themes. Turn out that it's not a simple way. So, we are introducing this feature here.

You can simply use `theme` in `_config.yml` or in header like:

#### In post's front matter

```markdown
---
title: Theme test
date: 2019-12-21 11:54:07
tags:
    - A Tag should be encrypted
theme: xray
password: "hello"
---
```

#### In `_config.yml`

This would be a default one.

```yaml
# Security
encrypt: # hexo-blog-encrypt
  abstract: Here's something encrypted, password is required to continue reading.
  message: Hey, password is required here.
  tags:
  - {name: encryptAsDiary, password: passwordA}
  - {name: encryptAsTips, password: passwordB}
  theme: xray
  wrong_pass_message: Oh, this is an invalid password. Check and try again, please.
  # Deprecated under v4 (alias of `wrong_pass_message`); see "Advanced settings".
  wrong_hash_message: Oh, these decrypted content cannot be verified, but you can still have a look.

```

Check them online, and PICK one:

+ [default](https://d0n9x1n.github.io/hexo-blog-encrypt/demo/theme/default/)
+ [blink](https://d0n9x1n.github.io/hexo-blog-encrypt/demo/theme/blink/)
+ [shrink](https://d0n9x1n.github.io/hexo-blog-encrypt/demo/theme/shrink/)
+ [flip](https://d0n9x1n.github.io/hexo-blog-encrypt/demo/theme/flip/)
+ [up](https://d0n9x1n.github.io/hexo-blog-encrypt/demo/theme/up/)
+ [surge](https://d0n9x1n.github.io/hexo-blog-encrypt/demo/theme/surge/)
+ [wave](https://d0n9x1n.github.io/hexo-blog-encrypt/demo/theme/wave/)
+ [xray](https://d0n9x1n.github.io/hexo-blog-encrypt/demo/theme/xray/)


## License

See [LICENSE](./LICENSE) file.

## Thanks

Collaborator - [xiazeyu](https://github.com/xiazeyu)
