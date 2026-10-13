# Getting Started

[简体中文](Getting-Started-zh-CN)

This guide gets you from **clean Hexo site** to **first encrypted post** in about a minute.

## 1. Install

```bash
npm install --save hexo-blog-encrypt
# or
yarn add hexo-blog-encrypt
```

The plugin requires **Node.js ≥ 18** (uses `crypto.webcrypto` and `structuredClone`). Hexo ≥ 5 is supported (verified against Hexo 7).

> 💡 **Provenance attestation.** Every release since v4.0.0 is published
> to npmjs with a signed [provenance](https://docs.npmjs.com/generating-provenance-statements)
> statement that ties the tarball to the exact GitHub Actions run that
> built it. `npm audit signatures` will verify this for you.

### Alternative: install from GitHub Packages

The same release is also mirrored to **GitHub Packages** under the
scoped name `@d0n9x1n/hexo-blog-encrypt`. This is purely for
discoverability (it shows up on the repo's "Packages" sidebar) — the
contents are identical to the npmjs.com release. To use the mirror,
add this to your project's `.npmrc`:

```
@d0n9x1n:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

Then `GITHUB_TOKEN=<a token with read:packages scope> npm install --save @d0n9x1n/hexo-blog-encrypt`.

For everyone else (which is everyone unless your CI policy mandates a
GitHub-only registry), the plain `npm install hexo-blog-encrypt` from
npmjs.com is the canonical install.

## 2. Encrypt one post

Add a `password:` field to any post's front matter:

```markdown
---
title: My First Encrypted Post
date: 2024-01-01 12:00:00
password: hello
---

Public preview text — anything before the `<!-- more -->` cut is shown
in feeds and the password screen.

<!-- more -->

This part is encrypted.

The secret is **butterfly**.
```

## 3. Build and preview

```bash
hexo clean && hexo generate && hexo server
```

Open the post in your browser. You'll see:

- A password prompt with the **abstract** + **message** text
- A "Decrypt" button (v4 default; can be hidden — see [Configuration Reference](Configuration-Reference))
- An empty content area below

Type `hello` → click **Decrypt** (or press Enter) → the secret reveals.

## 4. Verify the static HTML is encrypted

```bash
grep -r "butterfly" public/    # should NOT find a match
grep -r "hbeData" public/      # SHOULD find your post — proves encryption ran
```

If `grep` finds the plaintext, encryption did not run on that post. Check:
- The post has `password:` (not empty string) in its front matter
- `_config.yml` doesn't set `encrypt:` to a non-object value
- No build error was logged

## 5. Configure site-wide defaults

```yaml
# _config.yml
encrypt:
  abstract: 'This post is locked.'
  message: 'Password required.'
  theme: default
  wrong_pass_message: 'Wrong password — try again.'
```

Site-wide values are inherited by every encrypted post. Per-post front matter overrides site defaults. See [Configuration Reference](Configuration-Reference) for the full key list.

## 6. (Optional) Tag-based encryption

To encrypt all posts with a given tag without writing `password:` in each one:

```yaml
# _config.yml
encrypt:
  tags:
    - { name: diary, password: 'diary-secret' }
    - { name: drafts, password: 'draft-secret' }
```

Any post tagged `diary` is now encrypted with `diary-secret`. See [Tag-Based Encryption](Tag-Based-Encryption) for details.

## Next steps

- Browse the 8 built-in [Themes](Themes)
- Wire up [Callbacks & MathJax](Callbacks-and-MathJax) for syntax highlighting / math after decryption
- Read the [Security Model](Security-Model) to understand what is and isn't protected
- If your theme shows a table of contents, install the `hexo-encrypt-toc` Claude Code skill to fix it for encrypted posts: see [Encrypted TOC](Encrypted-TOC)
