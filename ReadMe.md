# hexo-blog-encrypt

> Password-protect individual Hexo posts. Content is encrypted at build time
> with AES-256-GCM and decrypted in the reader's browser with the Web Crypto
> API. No server, no plaintext in the generated HTML.

**[▶ Live demo](https://d0n9x1n.github.io/hexo-blog-encrypt/)**: every demo password is `hello`.

[![GitHub release](https://img.shields.io/github/v/release/D0n9X1n/hexo-blog-encrypt?include_prereleases&logo=github&label=release&color=brightgreen)](https://github.com/D0n9X1n/hexo-blog-encrypt/releases)
[![npm](https://img.shields.io/npm/v/hexo-blog-encrypt?logo=npm&color=brightgreen)](https://www.npmjs.com/package/hexo-blog-encrypt)
[![npm downloads](https://img.shields.io/npm/dm/hexo-blog-encrypt?logo=npm&label=downloads)](https://www.npmjs.com/package/hexo-blog-encrypt)
[![License](https://img.shields.io/npm/l/hexo-blog-encrypt?color=brightgreen)](./LICENSE)
[![Tests](https://github.com/D0n9X1n/hexo-blog-encrypt/actions/workflows/test.yml/badge.svg?branch=master)](https://github.com/D0n9X1n/hexo-blog-encrypt/actions/workflows/test.yml)
[![Coverage](https://img.shields.io/badge/server%20coverage-100%25-brightgreen)](./docs/DEVELOPMENT.md)
[![Live Demo](https://img.shields.io/badge/demo-online-brightgreen?logo=github)](https://d0n9x1n.github.io/hexo-blog-encrypt/)
[![Node](https://img.shields.io/node/v/hexo-blog-encrypt?logo=node.js&color=brightgreen)](./package.json)
[![Hexo](https://img.shields.io/npm/dependency-version/hexo-blog-encrypt/peer/hexo?logo=hexo&label=hexo)](https://hexo.io/)
[![Dependencies](https://img.shields.io/badge/runtime%20dependencies-0-brightgreen)](./package.json)
[![npm provenance](https://img.shields.io/badge/npm-provenance-blue?logo=npm)](https://www.npmjs.com/package/hexo-blog-encrypt#provenance)
[![GitHub stars](https://img.shields.io/github/stars/D0n9X1n/hexo-blog-encrypt?style=flat&logo=github)](https://github.com/D0n9X1n/hexo-blog-encrypt/stargazers)

English · [中文说明](./ReadMe.zh.md) · [Wiki](https://github.com/D0n9X1n/hexo-blog-encrypt/wiki) · [Releases](https://github.com/D0n9X1n/hexo-blog-encrypt/releases)

## Contents

- [Highlights](#highlights)
- [Live demo](#live-demo)
- [Install](#install)
- [Quick start](#quick-start)
- [Configuration](#configuration)
- [Theme integration](#theme-integration)
- [Browser support](#browser-support)
- [Why upgrade from v3?](#why-upgrade-from-v3)
- [Upgrading from v3](#upgrading-from-v3)
- [Contributing](#contributing)
- [License](#license)

## Highlights

| | |
| --- | --- |
| **Authenticated encryption** | [PBKDF2](https://www.rfc-editor.org/rfc/rfc8018)-SHA256 key derivation and [AES-256-GCM](https://csrc.nist.gov/pubs/sp/800/38/d/final). The GCM tag rejects wrong passwords and tampered ciphertext. |
| **Native crypto only** | Node.js [`crypto`](https://nodejs.org/api/crypto.html) at build time, the browser [Web Crypto API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API) at read time. No runtime dependencies. |
| **Per-post keys** | Each post has its own 32-byte salt and 12-byte nonce, so one cracked post does not speed up attacks on the others. |
| **Front-matter or tag passwords** | Set `password:` on a post, or map tags to passwords in `_config.yml`. |
| **Eight themes** | `default`, `blink`, `flip`, `shrink`, `surge`, `up`, `wave`, `xray`. Add your own by dropping in one HTML file. |
| **Scripts keep working** | Scripts inside a decrypted post run in document order. A `hexo-blog-decrypt` event fires when the post is revealed. |
| **Privacy by default** | Passwords and keys are not stored unless you opt in with `autoSave`. |
| **Tested** | 100% server line, branch and function coverage, plus Playwright end-to-end tests across every theme. |

## Live demo

Open the **[demo site](https://d0n9x1n.github.io/hexo-blog-encrypt/)**. All passwords are `hello`.

- [Theme gallery](https://d0n9x1n.github.io/hexo-blog-encrypt/tags/theme-demo/)
- [Decrypt callback](https://d0n9x1n.github.io/hexo-blog-encrypt/demo/callback/)
- [Script loading order and cached keys](https://d0n9x1n.github.io/hexo-blog-encrypt/demo/script-order/)

## Install

```bash
npm install --save hexo-blog-encrypt
```

Requires Node.js 18 or later and Hexo 5 or later. The package is published to
npm with [provenance](https://docs.npmjs.com/generating-provenance-statements)
and mirrored to GitHub Packages as `@d0n9x1n/hexo-blog-encrypt`.

## Quick start

Add a `password` to a post's front matter:

```markdown
---
title: Hello World
date: 2016-03-30 21:18:02
password: hello
---
```

Then rebuild and preview:

```bash
hexo clean && hexo generate && hexo server
```

The post body is replaced by a password form. Index pages show the `abstract`
text instead of the content.

## Configuration

Settings are resolved in this order:

**post front matter > `_config.yml` `encrypt:` block > built-in defaults**

A front-matter `password` takes precedence over a tag password.

### Front matter

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
theme: xray
---
```

### Site-wide `_config.yml`

```yaml
encrypt: # hexo-blog-encrypt
  abstract: Here's something encrypted, password is required to continue reading.
  message: Hey, password is required here.
  wrong_pass_message: Oh, this is an invalid password. Check and try again, please.
  theme: default
  silent: false

  # Encrypt every post that carries one of these tags.
  tags:
  - {name: encryptAsDiary, password: passwordA}
  - {name: encryptAsTips, password: passwordB}

  # Show a visible "Decrypt" button next to the password field.
  # Default: true.
  decryptButton:
    show: true
    text: Decrypt

  # Cache the derived AES key in localStorage so reloads skip the password
  # prompt. Default: false. Enable globally here or per post in front matter.
  # Entries are stored under `hbe.v4.<page path>`.
  autoSave: false

  # Keep the PBKDF2 salt stable across clean builds for the same post
  # permalink. Default: false. Useful with autoSave on Cloudflare Pages,
  # Vercel, Netlify, GitHub Actions, and other platforms that rebuild
  # generated HTML from a clean environment on every deploy.
  #
  # Only the salt is stable. The AES-GCM nonce stays random for every
  # encryption to avoid nonce reuse. If the post permalink changes, the
  # stable salt changes too, and the page's existing localStorage cache is
  # invalidated.
  stableSalt: false

  # PBKDF2 iteration count. Floor: 100_000. Recommended: 600_000 or more
  # (OWASP 2023 for PBKDF2-SHA256). Values below the recommendation log a
  # build warning. Default: 250_000.
  kdf:
    iterations: 250000
```

When `autoSave` reads a cached key, it compares the cached salt with the
current page salt. A nonce change alone does not delete the cache up front;
the browser tries the cached key with the current page nonce and ciphertext.
If AES-GCM authentication fails, the cache entry is cleared and the visitor is
asked for the password again.

### Option reference

| Option | Default | Description |
| --- | --- | --- |
| `password` | none | Encrypts the post. `""` disables encryption, including tag encryption. A matching tag entry without a password fails the build. |
| `password: { env: NAME }` | none | Reads the password from environment variable `NAME` at build time (front matter, `encrypt.password` or `encrypt.tags[].password`). A missing or empty variable fails the build; the value is never logged or rendered. This keeps passwords out of config files, not out of plaintext Markdown you commit publicly. |
| `abstract` | `Here's something encrypted…` | Excerpt shown on index and archive pages. |
| `message` | `Hey, password is required here.` | Label of the password field. |
| `wrong_pass_message` | `Oh, this is an invalid password…` | Inline error after a failed attempt. |
| `theme` | `default` | One of the eight bundled themes. Unknown names fall back to `default` with a warning. |
| `tags` | `[]` | `_config.yml` only. `{name, password}` pairs for tag encryption. |
| `decryptButton.show` / `.text` | `true` / `Decrypt` | Visible submit button and its label. |
| `autoSave` | `false` | Cache the derived key in `localStorage`. |
| `stableSalt` | `false` | Derive the salt from the permalink so cached keys survive clean rebuilds. |
| `kdf.iterations` | `250000` | PBKDF2 iterations. Must be an integer of at least 100,000. |
| `silent` | `false` | Suppress build-time info logs. Warnings and errors still print. |
| `wrong_hash_message` | `wrong_pass_message` | Deprecated alias. AES-GCM reports wrong passwords and tampering the same way. |
| `template` | none | Deprecated alias of `theme`. |

Boolean options (`autoSave`, `stableSalt`, `silent`, `decryptButton.show`) must be `true` or `false`. Quoted `"true"`/`"false"` are accepted with a warning; any other value fails the build.

The default `abstract`, `message`, `wrong_pass_message` and `decryptButton.text` follow the post's `lang`/`language`, else the site `language`. `zh`, `zh-CN` and `zh-Hans` use Simplified Chinese; everything else uses English. Explicit values always win.

### Disable tag encryption for one post

Set an empty password in that post's front matter:

```markdown
---
title: Public post with an encrypted tag
tags:
    - A Tag should be encrypted
password: ""
---
```

## Theme integration

### After-decrypt event

The plugin dispatches `hexo-blog-decrypt` once on `window` after a post is
revealed. `event.detail.mode` is `manual` (password entered) or `cached`
(saved key). Listen for it to re-run anything that scans the post body:

```js
window.addEventListener('hexo-blog-decrypt', function (event) {
  // Reinitialize your theme's table of contents, syntax highlighting, etc.
  console.log('Decrypted:', event.detail.mode);
});
```

### Scripts inside encrypted posts

Scripts in a post run after it is decrypted. Since **4.0.3**, ordinary external
scripts load in document order before later inline scripts run, so
library-dependent code such as DPlayer initializes correctly. The decrypt event
waits until restored external scripts load, fail, or reach a **15-second
per-script deadline**. A timeout does not cancel a script; it can still execute
later. Existing `onload` and `onerror` handlers are preserved. Explicit `async`
scripts still load independently, and restored `defer` scripts do not recreate a
document parsing phase. Inline `type="module"` scripts and asynchronous work
inside scripts keep native scheduling and may finish after the decrypt event.

```markdown
<script>
  // Runs after this post is decrypted.
  console.log('Hello from an encrypted post');
</script>
```

### Table of contents

**Never render an encrypted post's `post.origin` into generated HTML.** It
holds plaintext for legacy Hexo integrations. A TOC hidden with
`display:none` still publishes its headings. Search, feed and sitemap
integrations must also exclude plaintext fields from encrypted posts.

Render a server-side TOC only for unencrypted posts:

```ejs
<% if (post.toc === true && !post.encrypt) { %>
  <div class="toc-article"><%- toc(post.content, {list_number: true}) %></div>
<% } %>
<%- post.content %>
```

For encrypted posts, build the TOC in the browser inside the
`hexo-blog-decrypt` handler from the revealed `#hexo-blog-encrypt` content.

### Encryption themes

Pick a theme per post with `theme:` in front matter, or for the whole site in
`_config.yml`. Preview each one:

[default](https://d0n9x1n.github.io/hexo-blog-encrypt/demo/theme/default/) ·
[blink](https://d0n9x1n.github.io/hexo-blog-encrypt/demo/theme/blink/) ·
[flip](https://d0n9x1n.github.io/hexo-blog-encrypt/demo/theme/flip/) ·
[shrink](https://d0n9x1n.github.io/hexo-blog-encrypt/demo/theme/shrink/) ·
[surge](https://d0n9x1n.github.io/hexo-blog-encrypt/demo/theme/surge/) ·
[up](https://d0n9x1n.github.io/hexo-blog-encrypt/demo/theme/up/) ·
[wave](https://d0n9x1n.github.io/hexo-blog-encrypt/demo/theme/wave/) ·
[xray](https://d0n9x1n.github.io/hexo-blog-encrypt/demo/theme/xray/)

To add a theme, see [docs/THEMES.md](./docs/THEMES.md).

## Browser support

Decryption uses Web Crypto (`crypto.subtle`), which requires a **secure
context**: HTTPS or `http://localhost`.

| Browser | Minimum | Tested |
| --- | --- | --- |
| Chromium / Edge | 92+ | Automated: Playwright Chromium in CI, Hexo 7 and 8 |
| Firefox | 90+ | Automated: Playwright Firefox in CI |
| Safari (macOS) | 14+ | Automated: Playwright WebKit in CI (WebKit engine, not Safari itself) |
| Safari (iOS) | 14+ | Manual only |

Minimum versions come from Web Crypto and language feature support; CI runs
the current Playwright builds, not these minimums.

On plain HTTP from a non-localhost host, `crypto.subtle` is `undefined` and
decryption fails. Always serve production sites over HTTPS.

## Why upgrade from v3?

v4 closes real security gaps and fixes v3's UX problems:

- **Stronger crypto.** **AES-256-GCM** with a built-in authentication tag
  replaces v3's AES-CBC plus a separate HMAC: one primitive, one
  authentication path, and no CBC padding-oracle or HMAC-comparison bugs.
- **Per-post salt and nonce.** v3 used the same salt for every post, so one
  password derived the same key everywhere. v4 derives an independent key per
  post, so an attacker cannot reuse PBKDF2 work across posts that share a
  password.
- **Stronger KDF defaults.** v3 used **1,024** PBKDF2-SHA256 iterations. v4
  defaults to **250,000** (about 240 times more work per guess) and recommends
  600,000 or more (OWASP 2023). Tune it per post with `kdf.iterations`.
- **Privacy by default.** v3 always cached decrypted posts in `localStorage`,
  so anyone with later access to the device could read them again. v4 defaults
  to `autoSave: false`; you opt in per post or globally.
- **Inline errors.** v3 showed a `window.alert()` dialog on a wrong password.
  v4 shows the error next to the field (`role="alert"`).
- **Optional decrypt button** for readers who don't know Enter submits the form.
- **Smaller bundle.** CryptoJS is gone; the browser bundle is about 6 KB
  minified.
- **Tested.** 100% server coverage plus Playwright tests across all eight
  themes, on every push.

The rationale for each change is on the wiki:
[Migration v3 → v4](https://github.com/D0n9X1n/hexo-blog-encrypt/wiki/Migration-v3-to-v4).

## Upgrading from v3

v4 changed the encrypted format (AES-GCM, per-post salt and nonce). v4 cannot
read v3 output and v3 cannot read v4 output.

1. Upgrade the plugin: `npm install --save hexo-blog-encrypt@^4`.
2. Rebuild from source: `hexo clean && hexo generate`.
3. Purge your CDN if you use one. Post HTML changes on every build because each
   encryption uses a fresh nonce. The runtime asset `lib/hbe.<hash>.js` is
   content-hashed and changes only when the bundle changes.
4. Optional: remove `wrong_hash_message` from your config and front matter. It
   is deprecated in v4 and will be removed in v5.

Your source `.md` files are not touched. See the
[v4.0.0 release notes](https://github.com/D0n9X1n/hexo-blog-encrypt/releases/tag/v4.0.0)
and [Releases](https://github.com/D0n9X1n/hexo-blog-encrypt/releases) for the
full list of breaking changes.

## Contributing

Issues and pull requests are welcome. Please read
[CONTRIBUTING.md](./.github/CONTRIBUTING.md) and include reproduction steps,
logs and your configuration when reporting a bug.

- [Architecture](./docs/ARCHITECTURE.md)
- [Development](./docs/DEVELOPMENT.md)
- [Releasing](./docs/RELEASING.md)
- [Themes](./docs/THEMES.md)

## License

[MIT](./LICENSE)

## Thanks

Collaborator: [xiazeyu](https://github.com/xiazeyu)
