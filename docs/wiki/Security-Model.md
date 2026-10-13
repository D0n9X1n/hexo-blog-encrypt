# Security Model

Plain English: what `hexo-blog-encrypt` is and isn't designed to protect against.

## TL;DR

| | |
|---|---|
| **Designed for** | Hiding the *content* of specific posts from passive readers of your public site. |
| **Not designed for** | Protecting against motivated attackers who can run code on the reader's device, MITM the connection, or coerce you. |
| **Crypto strength** | AES-256-GCM with a key derived via PBKDF2-SHA256 (≥ 100 000 iterations, 250 000 default, 600 000 recommended). The crypto itself is solid. The weakest link is your password choice and your hosting setup. |

## What is protected

### The post body
After `hexo generate`, the post's HTML on disk and on your CDN contains **only ciphertext + a salt + a nonce**. There is no plaintext stored anywhere. Anyone who can read your `public/` directory cannot read the locked post.

### Tampering
AES-GCM produces an **authentication tag** along with the ciphertext. The browser bundle verifies the tag during decryption. Any modification to the ciphertext — even a single bit — fails authentication and surfaces the same `wrong_pass_message` as a wrong-password attempt. An attacker who can edit your hosted HTML cannot substitute their own content under your password.

### Replay across posts
Per-post salt and nonce mean:
- Two posts encrypted with the same password produce **different** ciphertexts.
- Knowing the plaintext of post A doesn't help you decrypt post B even if both use the same password.

### Build-time secrets
Your `_config.yml` `tags[].password` values **never appear in the published HTML**. They're only used during `hexo generate` to derive keys.

## What is NOT protected

### Your password
This plugin doesn't help you choose, store, or transmit passwords. Picking `hello` is not secure regardless of how strong AES-GCM is.

### The page chrome
Title, date, tags, categories, `description`, `abstract` and the password prompt are plaintext in the published HTML. The whole rendered body is encrypted, including text above `<!-- more -->`; index pages show `abstract` instead. If the title is "My password to bank.example.com is hunter2", AES-GCM can't help.

### Other plugins that read the post
The plugin encrypts `post.content` and replaces `post.excerpt` / `post.more` with the abstract. Plaintext still exists on the post object while Hexo builds:

| Field | Holds | Who might publish it |
| --- | --- | --- |
| `post.origin` | rendered plaintext HTML | themes (TOC widgets), custom helpers |
| `post.raw`, `post._content` | Markdown source | search-index and JSON generators, some feed generators |
| `post.description` | front-matter description | `open_graph()` meta tags, feeds |

Any generator or theme helper that reads those fields publishes the post. Before deploying:

1. Configure search, feed and sitemap generators to use `content` or `excerpt`, never `raw`, `_content` or `origin`, or exclude encrypted posts (`encrypt: true`).
2. Don't put secrets in `description` or `abstract`.
3. Fix theme TOCs with [Encrypted TOC](Encrypted-TOC).
4. Run the leak checker after `hexo generate`; `--body` also checks every prose line:

   ```bash
   node check-toc-leak.js --source source/_posts --public public --body
   ```

   The checker is in the [`hexo-encrypt` Claude Code plugin](Encrypted-TOC#let-claude-code-do-it) and in this repo under `plugins/hexo-encrypt/skills/hexo-encrypt-toc/scripts/`.

### Reader-side attacks
- **Browser extensions, malware, screen scrapers** — once the reader decrypts, the plaintext lives in the DOM. Anything running in the reader's browser can read it.
- **Shared devices** — if you turn on `autoSave`, the **derived key** (not the password) is stored in `localStorage`. Anyone with subsequent access to that profile can re-decrypt the same post on reload. With `autoSave: false` (default) this risk is gone.
- **Memory dumps / DevTools** — the password is briefly in JS memory during decryption. A motivated reader (or attacker who controls the reader's machine) can extract it.

### Network attacks
- **HTTPS is required** — Web Crypto (`crypto.subtle`) is only available in a secure context (HTTPS or localhost). On plain HTTP from a non-localhost host, decryption silently fails and your reader sees nothing.
- **Without HTTPS**, an MITM could replace your encrypted page with their own JavaScript that steals the password as the reader types it. The plugin can't defend against this — TLS is your only protection.

### Forced disclosure
This plugin doesn't help if you're compelled (by law, by employer, by anyone with leverage over you) to reveal the password. There is no panic mode, no plausible deniability, no remote wipe. If you're in a threat model that includes coercion, you need a different tool.

### Search and crawlers
- Encrypted post content is invisible to search engines. That's the **point** but worth saying.
- The title, `description` and `abstract` are fully indexed. Don't put secrets there.
- Search-index plugins run at build time, not as crawlers. See [Other plugins that read the post](#other-plugins-that-read-the-post).

## Crypto details (for reviewers)

- **KDF:** PBKDF2-HMAC-SHA256, 250 000 iterations by default, 100 000 floor, 600 000+ recommended (OWASP 2023 for PBKDF2-SHA256). Salt is 32 random bytes per post, generated at build time via Node's `crypto.randomBytes` — unless `stableSalt` is enabled (see below).
- **Cipher:** AES-256-GCM. Key is the 32-byte PBKDF2 output. Nonce is 12 random bytes per post, generated at build time. Auth tag is 16 bytes, verified by the browser via Web Crypto's built-in GCM authentication.
- **Wire format:** version `4`. Browser refuses to decrypt other versions (so a v3 page won't be silently mis-handled by a v4 reader, and vice-versa).
- **No HMAC layer.** GCM provides authenticated encryption (AEAD), so a separate HMAC step is unnecessary and was removed in v4.

### Deterministic salt (`stableSalt`, opt-in)

By default every build mints a fresh random salt per post, so an attacker's
PBKDF2 precomputation against one build is worthless against the next. When
you enable [`stableSalt`](Configuration-Reference#stablesalt-v402), the salt
is instead derived from the post permalink and stays the **same across
rebuilds**. The tradeoff:

- The salt was already public (it ships in `data-salt` either way), so this
  discloses nothing new. What changes is that the salt — and therefore the
  derived key for a given password — is now **stable over time** rather than
  rotating each build. An attacker's offline dictionary work against a
  target post stays valid until you change the password or the permalink.
- The **nonce is still random per encryption**, so there is no AES-GCM nonce
  reuse regardless of this setting.
- It is **off by default**. Only enable it when you specifically want
  `autoSave` caches to survive clean rebuilds (Cloudflare Pages, Vercel,
  Netlify, GitHub Actions). Strong passwords and high `kdf.iterations` remain
  your real defense — the same as without `stableSalt`.

## Recommendations

- **Strong, unique passwords.** A passphrase of 4+ unrelated words is a reasonable starting point.
- **Serve over HTTPS.** Always.
- **Raise `kdf.iterations`** if your threat model includes offline brute-force attempts and your readers can tolerate ~120 ms of decrypt time: `kdf: { iterations: 1000000 }`.
- **Don't enable `autoSave` on a shared device.** Default-off is safer. Opt in only on private devices.
- **Don't put secrets above `<!-- more -->`.** That's the public preview text.
- **Audit your theme.** Some themes leak post content into structured data (`<meta>`, JSON-LD, RSS) **before** encryption runs. Check the rendered HTML.
- **Rotate passwords** if you suspect compromise. By default the salt and nonce change on every build, so old leaked HTML is irrelevant once you regenerate. **Note:** with `stableSalt` enabled the salt is intentionally stable across rebuilds, so rotating the password (or changing the permalink) — not merely rebuilding — is what invalidates an old derived key.

## Reporting issues

If you find a real vulnerability, please open a GitHub issue OR contact the maintainers via the contact info in the repository. Don't post exploit details publicly until a fix is released.
