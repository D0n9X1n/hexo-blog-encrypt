# hexo-blog-encrypt

[简体中文](Home-zh-CN)

> Encrypt individual Hexo blog posts at build time. Readers enter a password and decrypt client-side via the Web Crypto API. Zero server. Zero plaintext on disk after the build.

[**🔗 Live demo**](https://d0n9x1n.github.io/hexo-blog-encrypt/) · [**📦 npm**](https://www.npmjs.com/package/hexo-blog-encrypt) · [**📝 Source**](https://github.com/D0n9X1n/hexo-blog-encrypt) · [**📋 Releases**](https://github.com/D0n9X1n/hexo-blog-encrypt/releases)

---

## What you get in v4

| | |
|---|---|
| **Crypto** | PBKDF2-SHA256 key derivation + **AES-256-GCM** authenticated encryption (Node.js `crypto` server-side, Web Crypto in the browser). The GCM auth tag detects ciphertext tampering — no separate HMAC needed. |
| **Per-post salt + nonce** | Every encrypted post gets a fresh 32-byte salt and 12-byte nonce. Two posts with identical content + password produce different ciphertexts. |
| **8 themes** | `default`, `blink`, `flip`, `shrink`, `surge`, `up`, `wave`, `xray` — see the [Themes gallery](Themes). |
| **Optional Decrypt button** | Visible click-to-decrypt button alongside the password field. Configurable label. |
| **Optional `autoSave`** | Off by default. Opt in to cache the derived key in `localStorage` so reloads skip the prompt. |
| **Optional `stableSalt`** | Off by default. Derives the salt from the post permalink so it stays stable across clean rebuilds — keeps `autoSave` caches valid on Cloudflare Pages / Vercel / Netlify / GitHub Actions. Nonce stays random. See [Security Model](Security-Model#deterministic-salt-stablesalt-opt-in). |
| **Tag-based encryption** | Define a `{name, password}` registry in `_config.yml`; matching post tags get encrypted with the registry password. |
| **Decryption callback** | `window.addEventListener('hexo-blog-decrypt', fn)` — re-init MathJax / hljs / TOC / etc. after the post reveals. |
| **Claude Code skill** | [`hexo-encrypt-toc`](https://github.com/D0n9X1n/hexo-blog-encrypt/blob/master/skills/hexo-encrypt-toc/SKILL.md) lets Claude Code fix any theme's table of contents for encrypted posts without leaking headings. See [Encrypted TOC](Encrypted-TOC). |
| **Tested** | 100 % server coverage on Node 18–26 and Hexo 7/8, plus Playwright end-to-end tests on Chromium, Firefox and WebKit across all 8 themes. |

---

## Pick your path

**New here?** → [Getting Started](Getting-Started) — install + first encrypted post in 60 seconds.

**Upgrading from v3?** → [Migration v3 → v4](Migration-v3-to-v4) — what changed and why.

**Need a config option?** → [Configuration Reference](Configuration-Reference) — every key, every default.

**Want a custom look?** → [Themes](Themes) — 8 built-in themes + how to roll your own.

**Embedding JS / MathJax / hljs?** → [Callbacks & MathJax](Callbacks-and-MathJax) — the `hexo-blog-decrypt` event with worked examples.

**Encrypting by tag instead of per-post?** → [Tag-Based Encryption](Tag-Based-Encryption).

**How safe is this, really?** → [Security Model](Security-Model) — what is and isn't protected.

**Decryption silently fails?** → [Browser Support](Browser-Support) and [Troubleshooting](Troubleshooting).

**Have a question?** → [FAQ](FAQ).

**TOC empty or leaking on encrypted posts?** → [Encrypted TOC](Encrypted-TOC), or let Claude Code fix your theme with the `hexo-encrypt-toc` skill.

## Maintainers

- [Architecture](Architecture) — modules, wire format, key files.
- [Development](Development) — setup, test commands, workflow rules.
- [Theme Authoring](Theme-Authoring) — the one-file theme contract.
- [Release Process](Release-Process) — tag-driven npm and GitHub Packages release.
- [Wiki Publication](Wiki-Publication) — how this wiki is written, checked and published.

---

## 60-second taste

```yaml
# _config.yml
encrypt:
  abstract: 'This post is locked.'
  message: 'Password required.'
  theme: default
```

```markdown
---
title: My Diary
date: 2024-01-01
password: hello
---

Only the holder of the password "hello" can read this.

<!-- more -->

The secret is...
```

```bash
hexo clean && hexo generate
```

Open the post → prompt appears → type `hello` → click **Decrypt** → content reveals.

---

## License

MIT. See [LICENSE](https://github.com/D0n9X1n/hexo-blog-encrypt/blob/master/LICENSE).
