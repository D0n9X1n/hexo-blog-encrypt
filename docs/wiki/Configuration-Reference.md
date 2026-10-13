# Configuration Reference

Every option, default, type, and where it can be set.

## Where to set options

There are three places, in increasing precedence:

1. **Built-in defaults** (in `src/server/config.js#DEFAULTS`)
2. **Site config**: `_config.yml` → `encrypt:` block — applies to every encrypted post
3. **Post front matter** — overrides site config for that one post

The merge is **deep** for nested objects (`kdf`, `decryptButton`) and **replacement** for arrays (notably `encrypt.tags`).

## All options

### Required

| Key | Type | Where | Notes |
|---|---|---|---|
| `password` | string | post front matter, or `tags[].password` in `_config.yml` | The password that unlocks the post. Must be non-empty. Setting `password: ""` in front matter **disables** encryption for a post that would otherwise inherit a tag-based password. |

### Display

| Key | Type | Default | Notes |
|---|---|---|---|
| `abstract` | string | `Here's something encrypted, password is required to continue reading.` | Shown above the password field. |
| `message` | string | `Hey, password is required here.` | Shown next to the password field. |
| `theme` | string | `default` | One of: `default`, `blink`, `flip`, `shrink`, `surge`, `up`, `wave`, `xray`. See [Themes](Themes). |
| `wrong_pass_message` | string | `Oh, this is an invalid password. Check and try again, please.` | Inline error shown when decryption fails (wrong password OR tampered ciphertext — v4 unifies both via GCM auth-tag failure). |

### Decrypt button (v4)

```yaml
decryptButton:
  show: true        # boolean
  text: 'Decrypt'   # string
```

| Key | Type | Default | Notes |
|---|---|---|---|
| `decryptButton.show` | boolean | `true` | Render a clickable Decrypt button next to the password field. Set `false` to keep only Enter-to-submit. |
| `decryptButton.text` | string | `'Decrypt'` | Button label. Set to your localized term. |

Themes that already include their own button via `<%- decrypt_button %>` template slot ignore this option.

### autoSave (v4)

```yaml
autoSave: false     # boolean
```

| Key | Type | Default | Notes |
|---|---|---|---|
| `autoSave` | boolean | `false` | When `true`, the **derived key** (not the password, not the plaintext) is cached in `localStorage` keyed by the post's URL. A subsequent reload of the same page auto-decrypts. Off by default — opt in per post or globally. See [Security Model](Security-Model) for what this leaks. |

### stableSalt (v4.0.2+)

```yaml
stableSalt: false   # boolean
```

| Key | Type | Default | Notes |
|---|---|---|---|
| `stableSalt` | boolean | `false` | When `true`, the per-post PBKDF2 salt is derived **deterministically from the post permalink** instead of being random, so it stays identical across clean static rebuilds. Pairs with `autoSave`: on platforms that regenerate HTML from a clean environment every deploy (Cloudflare Pages, Vercel, Netlify, GitHub Actions), a key cached from a previous build keeps working because the salt — and therefore the derived key — is unchanged. **Only the salt is stable; the AES-GCM nonce is still random for every encryption**, so no nonce reuse. If the permalink changes, the stable salt changes and that page's existing `localStorage` cache is invalidated. Off by default — opt in per post or globally. Read the deterministic-salt tradeoff in [Security Model](Security-Model) before enabling. |

### KDF (v4)

```yaml
kdf:
  iterations: 250000   # integer
```

| Key | Type | Default | Notes |
|---|---|---|---|
| `kdf.iterations` | integer | `250000` | PBKDF2-SHA256 iteration count. **Floor: 100 000** (build aborts below). **Recommended: ≥ 600 000** (OWASP 2023 for PBKDF2-SHA256) — values below `600_000` log a warning at build time. Higher = slower brute force, slower decrypt. The cost is paid once per password attempt in the reader's browser; on a 2024 laptop, 250 000 iterations is ≈ 30 ms. |

### Logging

| Key | Type | Default | Notes |
|---|---|---|---|
| `silent` | boolean | `false` | Suppress build-time `INFO`/`WARN` logs from this plugin. Errors still propagate. |

### Tag registry

```yaml
tags:
  - { name: diary, password: 'diary-secret' }
  - { name: drafts, password: 'draft-secret' }
```

| Key | Type | Default | Notes |
|---|---|---|---|
| `tags` | array of `{name, password}` | `[]` | Site-config-only. Posts whose `tags:` include any registry name are encrypted with that registry password — no need to set `password:` in front matter. See [Tag-Based Encryption](Tag-Based-Encryption). |

### Deprecated

| Key | Status | Notes |
|---|---|---|
| `wrong_hash_message` | **Deprecated in v4, removed in v5.** | Was the v3 message for "ciphertext was tampered with." Under AES-GCM, wrong-password and tampered-ciphertext failures are cryptographically indistinguishable, so this is now an alias for `wrong_pass_message`. Setting it logs a warning. Set `wrong_pass_message` instead. |
| `template` | **Deprecated since v3, removed in v5.** | Old name for `theme`. |

## Worked examples

### Minimal (site-wide defaults, per-post passwords)

```yaml
# _config.yml
encrypt:
  theme: default
```

```markdown
---
title: Locked
date: 2024-01-01
password: hello
---
```

### Localized + custom button + slow KDF

```yaml
# _config.yml
encrypt:
  abstract: 'この投稿は暗号化されています。'
  message: 'パスワードを入力してください。'
  wrong_pass_message: 'パスワードが間違っています。'
  theme: wave
  decryptButton:
    show: true
    text: '復号'
  kdf:
    iterations: 1000000   # ~120 ms decrypt cost on a 2024 laptop
```

### Per-post override of one site default

```markdown
---
title: This One Uses xray
date: 2024-01-01
password: hello
theme: xray
decryptButton:
  show: false
---
```

The site uses `theme: default` everywhere, this post uses `theme: xray` and hides the button.

### autoSave only on certain posts

```yaml
# _config.yml — autoSave OFF site-wide
encrypt:
  theme: default
```

```markdown
---
title: Long Reading List (autosaved so reloads stay decrypted)
date: 2024-01-01
password: hello
autoSave: true
---
```

## Resolution rules in detail

For each post the plugin computes:

```
DEFAULTS
  ⇣ deep-merge with selected keys from _config.yml#encrypt
  ⇣ deep-merge with selected keys from post front matter
= effective config for this post
```

Selected keys (the allow-list) are: `password`, `abstract`, `message`, `theme`, `template`, `wrong_pass_message`, `wrong_hash_message`, `silent`, `autoSave`, `decryptButton`, `kdf`, plus `tags` from the site config only.

Anything else in front matter is **ignored** by this plugin (Hexo's other filters still see it).

## Source of truth

The defaults above mirror `src/server/config.js#DEFAULTS`. If they ever drift, that file wins — please file an issue.
