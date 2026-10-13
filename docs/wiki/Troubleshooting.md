# Troubleshooting

If something's wrong, work through these in order. The first match usually pinpoints the cause.

## Symptom: "decryption failed" on every attempt, every browser

### Cause 1: Page is on plain HTTP

Web Crypto requires a secure context. Open DevTools → Console:

```js
window.isSecureContext   // false → THIS is your problem
```

**Fix:** serve over HTTPS. For testing, `http://localhost:4000/` works (the secure-context exemption); a LAN IP like `http://192.168.1.10:4000` does not.

### Cause 2: Wire-format mismatch (browser sees v3 / v5 page from a v4 / v3 client)

The bundle refuses to decrypt unknown wire-format versions. Check the page source for:

```html
<div id="hexo-blog-encrypt" data-hbe-format="4" ...>
```

Expected for v4. If it says `"3"` or is missing, you have stale ciphertext from an older build.

**Fix:**
```bash
rm -rf public db.json
hexo generate
```

If you have a CDN: purge after rebuild.

### Cause 3: Stale bundle from a service worker

Some Hexo themes register a service worker that aggressively caches `*.js`. If you upgraded the plugin but the service worker is still serving the old bundle, the wire format won't match.

**Fix (per-reader):** DevTools → Application → Service Workers → Unregister.
**Fix (site-wide):** bump your service worker version so all visitors re-fetch.

## Symptom: Right password rejected as wrong

### Cause 1: Trailing whitespace / Unicode look-alikes in front matter

YAML is fussy. `password: 'hello '` (trailing space) and `password: hello` are different passwords. Likewise `password: ""` (empty string) **disables** encryption, while no `password:` field at all means the post inherits the tag-registry password (or stays plaintext).

**Fix:** quote the password and trim it:

```yaml
password: 'hello'
```

### Cause 2: Tampered ciphertext

If your reverse proxy / CDN / minifier rewrites the rendered HTML — particularly anything that touches the `<script id="hbeData">…hex…</script>` block — the GCM auth tag fails and surfaces the same "wrong password" error.

**Fix:** exclude `*.html` from minification or whitelist the `hbeData` block. The script content is hex-encoded ciphertext; any byte change breaks decryption.

### Cause 3: KDF iteration mismatch

Each post embeds the iteration count it was built with, so this usually self-heals. But if you manually edit the published HTML and change `data-kdf-iterations`, decryption will fail. Don't do that.

## Symptom: Build error mentioning DataCloneError

You're on Node ≥ 18 and `structuredClone` is rejecting an unclonable value (typically a function). Most common cause: a Hexo theme or another plugin attached a function to a known config key (e.g. `password` as a callback).

**Fix:** ensure the conflicting key is a plain value (string, number, boolean, plain object, plain array). The plugin only deep-merges the [allow-listed config keys](Configuration-Reference#resolution-rules-in-detail) — anything else doesn't go through `structuredClone`.

## Symptom: Build warning about KDF iterations

```
WARN  hexo-blog-encrypt: kdf.iterations=250000 is below the OWASP-recommended 600_000.
```

This is the default, and it's not an error. The plugin warns to nudge you toward stronger PBKDF2 settings. To raise it:

```yaml
encrypt:
  kdf:
    iterations: 600000
```

The trade-off: ≈ 75 ms decrypt cost on a 2024 laptop instead of ≈ 30 ms. To suppress without raising, you'd have to fork — there's no `silentKdf` flag (the warning is on purpose).

## Symptom: Build warning about wrong_hash_message deprecation

```
WARN  hexo-blog-encrypt: "wrong_hash_message" is deprecated under v4 ...
```

Under AES-GCM, wrong-password and tampered-ciphertext are cryptographically indistinguishable. The two messages are now the same. To clear the warning, drop `wrong_hash_message` from your config and front matter — set `wrong_pass_message` if you want a custom error.

## Symptom: Tag-encrypted post is published in plaintext

Two possible causes:

### Cause 1: Tag name mismatch

YAML / Hexo are case-sensitive in odd places. `tags: [Diary]` vs `tags: { name: diary }` won't match.

**Fix:** make the tag name **byte-identical** across `_config.yml#encrypt.tags[].name` and the post's `tags:` list.

### Cause 2: Front-matter `password: ""`

Empty-string password disables encryption. Either remove the line or set a real password.

## Symptom: MathJax / hljs / mermaid not running on decrypted content

They scanned the DOM at page load and missed the encrypted post (it was just ciphertext). They need to re-run on the now-revealed content.

**Fix:** [Callbacks & MathJax](Callbacks-and-MathJax) — wire a `hexo-blog-decrypt` listener that re-triggers them.

## Symptom: TOC widget shows empty / nothing

Same root cause as above: the TOC scanner ran at page load and saw no headings (they were inside the ciphertext). Never fix this by rendering `toc(post.origin)`: that publishes plaintext headings, even when hidden. Follow [Encrypted TOC](Encrypted-TOC) to rebuild the TOC after decryption.

## Symptom: `npm install hexo-blog-encrypt` is huge / slow

It shouldn't be. The published tarball is 22 files, ≈ 32 KB packed. If you're seeing > 1 MB, something's wrong on your end (e.g., installing from the git ref instead of the npm registry, which pulls the whole repo including the demo and tests).

**Fix:** confirm your `package.json` has `"hexo-blog-encrypt": "^4.0.0"`, not `"hexo-blog-encrypt": "github:D0n9X1n/hexo-blog-encrypt"`.

## Symptom: Auto-save doesn't persist across reloads

`autoSave` is **off by default** in v4. To enable:

```yaml
# _config.yml — site-wide
encrypt:
  autoSave: true
```

Or per post:

```markdown
---
title: ...
password: ...
autoSave: true
---
```

Cache key is namespaced as `hbe.v4.<url-hash>` — verify in DevTools → Application → Local Storage. The cache stores the **derived key** (not the password), so a stolen localStorage dump still requires breaking AES-GCM to recover plaintext.

## Symptom: Decryption works but layout breaks

Your theme's CSS may target only the original (un-encrypted) post container. After decryption, the bundle replaces the encrypted wrapper with a new container that retains `id="hexo-blog-encrypt"` and adds the class `hbe-decrypted-content`. If your theme styles `.post-body > p`, that selector might not match the new container's children.

**Fix (theme-side):** add `.hbe-decrypted-content` to your CSS selectors, or scope styles to the post's outer container.

## Still stuck?

Open an issue at <https://github.com/D0n9X1n/hexo-blog-encrypt/issues> with:

- A reduced repro (one encrypted post, minimal `_config.yml`)
- The full output of `hexo generate --debug` from a clean tree
- The browser console output from the failing decrypt attempt
- Browser + version, hosting setup (CDN? service worker?)

Most "doesn't work" reports are resolved within one round-trip when the repro is tight.
