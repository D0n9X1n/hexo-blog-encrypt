# FAQ

[简体中文](FAQ-zh-CN)

Common questions, in order of how often they come up.

## Is the password ever sent over the network?

**No.** Encryption happens at `hexo generate` time on your machine. Decryption happens entirely in the reader's browser. The password the reader types never leaves their browser.

## Can I encrypt the whole site?

Yes — tag every post with a tag in your registry, or set a `password:` in every post's front matter. There's no "encrypt all" switch on the global config because it would be a footgun (your homepage / archives / RSS would silently break).

## Will Google still index my encrypted posts?

The encrypted body is opaque ciphertext, so search engines can't read or rank it. The page **title**, **date**, **tags**, and any text **above the `<!-- more -->` cut** are still indexed (they're plaintext in the HTML). If you don't want the post to be indexed at all, add `noindex` meta tags via your theme.

## Can readers see the post content if they View Source?

The encrypted body is ciphertext in the source. It's safe to share / view / save the source — it's useless without the password. The password prompt + abstract / preview text are visible in source like any other HTML.

## What if I lose the password?

There is no recovery. The plugin doesn't store the password anywhere — it derives a key from it at build time, encrypts with that key, and discards the key. If you don't remember the password, the post is **permanently** unreadable. Use a password manager.

## Can I have different passwords for different posts?

Yes. Each post can have its own `password:` in front matter. Different posts with different passwords coexist on the same site without interference (per-post salt + nonce ensures they don't share key material).

## What's the difference between `wrong_pass_message` and `wrong_hash_message`?

In v3 they were different — one for "wrong password", one for "ciphertext was tampered with." v4 unifies them: AES-GCM authentication failure is cryptographically indistinguishable from a wrong password (and that's a security feature, not a limitation). `wrong_hash_message` is now an alias of `wrong_pass_message` with a deprecation warning. Use `wrong_pass_message`.

## Why does my encrypted post's HTML change every time I rebuild?

A fresh **nonce** is generated per encryption (12 random bytes). With AES-GCM, **reusing a nonce is catastrophic** (it leaks plaintext XOR), so the plugin always uses a fresh one. The ciphertext changes byte-for-byte every build as a result.

If you serve from a CDN, this means:
- Always purge after rebuild
- Or: configure short TTLs for `*.html`
- Or: configure your CDN to revalidate on every request (defeats the purpose of a CDN, but is correct)

The browser bundle (`lib/hbe.bundle.<hash>.js`) is **content-hashed** and only changes when the bundle source changes, so it caches forever — only the post HTML needs short TTLs.

## Why does decryption fail on my deployed site but work locally?

99 % of the time: the deployed site is on plain HTTP. Web Crypto requires HTTPS (or localhost). See [Browser Support](Browser-Support).

Other causes:
- The page URL contains a hash fragment that your CDN strips (the bundle reads from the page DOM, not the URL)
- A service worker is serving a stale bundle that doesn't recognize the v4 wire format

## Why is decrypting slow?

The PBKDF2 KDF runs `kdf.iterations` rounds on each decrypt attempt (250 000 by default). On a 2024 laptop that's ≈ 30 ms. On a 2015 phone it can be 300+ ms. Lower iterations speed it up but weaken the brute-force resistance — see the [Security Model](Security-Model) page for the trade-off.

## Can I use this with `hexo-renderer-pug` / a non-marked renderer?

Yes — the plugin operates on the rendered HTML output, after Hexo's renderer is done. Any renderer Hexo supports works. The only constraint is that your renderer must produce valid HTML.

## Does this work with Hexo's `--draft` flag?

Yes. Drafts are rendered like normal posts; the encrypt filter runs the same way.

## Can I encrypt a page (not a post)?

The filter is registered on `after_post_render`. Pages render through a different pipeline. It's possible in principle but not currently wired up. PRs welcome.

## How do I get syntax highlighting / MathJax / mermaid to work after decryption?

Use the [`hexo-blog-decrypt` event](Callbacks-and-MathJax). The page-load-time pass of those libraries skipped your encrypted post (they only saw ciphertext); you need to re-run them on the decrypted DOM. Worked examples on that page.

## Can I customize the prompt's HTML?

Yes — write a [theme](Themes). The wiki has instructions for adding a new theme by copying `lib/hbe.default.html`.

## Is there a Vue / React / Svelte component?

No. This plugin works at Hexo-build-time. The browser-side bundle is plain vanilla JS with no framework dependency.

## Why is the bundle ~5 KB? That seems small.

Because it's tight on purpose. Web Crypto does the actual encryption; the bundle is just DOM + UI plumbing + the KDF / decrypt orchestration. No CryptoJS, no polyfills, no animations library — the themes use pure CSS.

## What's the maintenance status?

Actively maintained. v4 was a 2026 redesign; minor releases land as needed. Issues and PRs are welcome.
