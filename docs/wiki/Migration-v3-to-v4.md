# Migration v3 → v4

v4 is a major version bump. The change is **not backward compatible at the wire level** but **is** mostly backward compatible at the config level.

## TL;DR

```bash
npm install --save hexo-blog-encrypt@^4
hexo clean && hexo generate
# Done. Purge your CDN if you use one.
```

That's the full migration for most sites. Skim the breaking changes below and you're done.

## What changed

### Wire format (BREAKING)

| | v3 | v4 |
|---|---|---|
| **Cipher** | AES-256-CBC + separate HMAC | **AES-256-GCM** (auth tag built in) |
| **KDF** | PBKDF2-SHA256, 1024 iter, fixed salt | **PBKDF2-SHA256, 250 000 iter (default)**, **per-post 32-byte salt** |
| **Nonce** | n/a (CBC IV) | **per-post 12-byte nonce** |
| **Wire-format marker** | n/a (implicit) | `data-hbe-format="4"` |

**Implication:** existing v3 ciphertext on disk is unreadable by v4 and vice-versa. You **must** regenerate (`hexo clean && hexo generate`) after upgrading. No source `.md` file is touched — only the build output.

If you serve from a CDN: purge after the rebuild. The post HTML changes byte-for-byte every build by design (fresh nonce per encryption), so CDN cache hits would otherwise serve stale ciphertext that no v4 client can decrypt.

### Configuration (mostly compatible)

| v3 key | v4 status | Action |
|---|---|---|
| `password` | unchanged | none |
| `abstract`, `message`, `theme`, `wrong_pass_message`, `silent`, `tags[]` | unchanged | none |
| `wrong_hash_message` | **deprecated**, alias of `wrong_pass_message` | optional cleanup; setting it now logs a warning |
| `template` (legacy alias for `theme`) | **deprecated** since v3 | rename to `theme:` |
| `decryptButton` | **new** | optional; default `{ show: true, text: 'Decrypt' }` |
| `autoSave` | **new** | optional; default `false` |
| `kdf.iterations` | **new** | optional; default `250000` |

See [Configuration Reference](Configuration-Reference) for the full schema.

### Behavior

| Behavior | v3 | v4 |
|---|---|---|
| Wrong-password feedback | `alert()` dialog | **inline `[role="alert"]`** in the prompt |
| Tampered-ciphertext feedback | distinct `wrong_hash_message` | **same as wrong-password** (GCM unifies them; cryptographically indistinguishable) |
| Browser key persistence | localStorage cache, always on | **off by default**; opt-in via `autoSave: true` |
| Cache key namespace | `hexo-blog-encrypt:#<url>` | `hbe.v4.<url-hash>` (v3 keys are purged on read) |
| Decryption event | `Event('hexo-blog-decrypt')` | `CustomEvent('hexo-blog-decrypt', { detail: { mode } })` — v3 listeners that ignore `detail` keep working |
| Browser asset URL | `/css/hbe.style.css`, `/js/hbe.js` | `/lib/hbe.style.css`, `/lib/hbe.bundle.<hash>.js` (content-hashed for cache-busting) |

## Why these changes

### Why GCM over CBC + HMAC?
- **Single primitive, single auth path.** The CBC + HMAC combo had two failure modes (wrong key, tampered ciphertext) that you had to handle separately and that — done wrong — leaked information about which one occurred. GCM unifies them: the auth tag fails and you can't tell why.
- **Modern, audited, fast.** Web Crypto's `AES-GCM` is hardware-accelerated on every relevant CPU.

### Why per-post salt + nonce?
- v3's fixed salt meant the same password always derived the same key. An attacker with two encrypted posts using the same password could exploit reuse.
- A fresh salt per post makes the derived keys independent. A fresh nonce per encryption is required for GCM safety regardless.

### Why bump KDF iterations from 1024 → 250 000?
- 1024 is **trivial** to brute-force on a modern GPU. PBKDF2-SHA256 is GPU-friendly.
- OWASP 2023 recommends ≥ 600 000 for PBKDF2-SHA256. 250 000 is a compromise that runs in ≈ 30 ms on a 2024 laptop while raising the brute-force cost meaningfully.
- You can raise it further: `kdf: { iterations: 1000000 }` is a reasonable choice if your readers are patient.

### Why default `autoSave: false`?
- v3 always cached. Anyone with shared device access — kid borrows the laptop, password autofill on a second person's browser, etc. — saw decrypted content.
- Off-by-default makes the privacy story **explicit**: the password isn't remembered. Users who want the convenience opt in per post.

## Compatibility checklist

After upgrading, verify:

- [ ] `npm ls hexo-blog-encrypt` shows `4.x`
- [ ] `hexo clean && hexo generate` completes with no errors
- [ ] An encrypted post's HTML contains `data-hbe-format="4"`
- [ ] An encrypted post's HTML does **not** contain your plaintext (`grep` for a known secret)
- [ ] Browser decryption works — open the page, type the right password, see the content
- [ ] If you have a `hexo-blog-decrypt` listener, it still fires (test by adding a `console.log`)

## Going back to v3

```bash
npm install --save hexo-blog-encrypt@^3
hexo clean && hexo generate
```

Same drill in reverse. v3 ciphertext is regenerated from your source.

## Full release notes

See the [v4.0.0 release notes](https://github.com/D0n9X1n/hexo-blog-encrypt/releases/tag/v4.0.0) for the complete list of changes.
