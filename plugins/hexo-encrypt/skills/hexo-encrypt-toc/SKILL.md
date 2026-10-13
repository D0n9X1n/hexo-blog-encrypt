---
name: hexo-encrypt-toc
description: Patches any Hexo theme so its table of contents works with hexo-blog-encrypt without leaking encrypted headings. Use when a theme shows an empty, hidden, or plaintext TOC on password-protected posts, when installing hexo-blog-encrypt on a theme with a TOC, or when asked to "fix TOC for encrypted posts". Do NOT use for themes with no TOC, or for changing the encryption plugin itself.
---

# Encrypted-post TOC for any Hexo theme

hexo-blog-encrypt replaces `page.content` with ciphertext in an
`after_post_render` filter, sets `page.encrypt = true`, and keeps the plaintext
in `page.origin`. After the reader decrypts, it swaps in the post as
`#hexo-blog-encrypt.hbe-decrypted-content` and dispatches `hexo-blog-decrypt`
on `window`.

That breaks theme TOCs in one of three ways:

| Symptom | Cause | Risk |
| --- | --- | --- |
| TOC empty or missing | `toc(page.content)` sees ciphertext | Cosmetic |
| TOC visible on the locked page | `toc(page.origin)` rendered | **Plaintext headings published** |
| TOC hidden, appears after decrypt | `toc(page.origin)` with `display:none` | **Plaintext headings published** (view source) |

The goal is always the same: **no encrypted heading in the generated HTML, and
a working TOC after decryption.** This procedure works for any theme; the
per-theme notes in [references/themes.md](references/themes.md) are examples,
not a whitelist.

## 1. Locate the TOC

Run from the Hexo site root. Include theme packages installed from npm.

```bash
THEME=$(sed -n 's/^theme:[[:space:]]*//p' _config.yml | tr -d "\"'")
grep -rnE "toc\(|\.origin|encrypt|tocbot|hexo-blog-decrypt|hbe|password" \
  "themes/$THEME" "node_modules/hexo-theme-$THEME" 2>/dev/null \
  | grep -v -E "/(node_modules|source/lib|vendor)/" | head -80
```

Also search component packages the theme depends on (for example Icarus
renders its TOC from `hexo-component-inferno`).

Classify every hit:

- **Server TOC**: a template calls `toc(...)` (ejs, njk, pug, jsx, swig).
- **Client TOC**: JavaScript scans headings in the DOM (tocbot, a custom
  `querySelectorAll('h1,h2,…')`, or a theme `initTOC` function).
- **Theme-native encryption**: the theme has its own `password` handling or
  bundles a copy of hexo-blog-encrypt. Resolve this first (see step 5).

Record the TOC container selector, the `class` passed to `toc()` (default
`toc`), and the function that starts scrollspy or highlighting.

## 2. Remove every plaintext source

In each server template:

- Delete any `toc(page.origin)`, `toc(post.origin)`, or equivalent.
- Guard the remaining call with the encrypt flag and **still output the empty
  container**, because many themes drop the sidebar panel when the TOC is
  empty:

```ejs
<div id="toc" class="toc-article">
  <% if (!page.encrypt) { %><%- toc(page.content, {class: 'toc'}) %><% } %>
</div>
```

Nunjucks: `{% if not page.encrypt %}…{% endif %}`. Pug:
`if !page.encrypt` with the container outside the branch. JSX: pass `''`
instead of `origin`.

Also check `head` templates for `open_graph()` and meta descriptions, and
search, feed, and sitemap generator configs for fields that read `origin`,
`raw`, or `_content`.

## 3. Rebuild the TOC after decryption

Prefer the theme's own initializer. Otherwise use the generic builder.

**Client TOC (tocbot style).** Make sure the decrypted node is inside the
scanner's content selector, then refresh:

```html
<script>
  window.addEventListener('hexo-blog-decrypt', function () {
    var el = document.getElementById('hexo-blog-encrypt');
    if (el) el.classList.add('markdown-body'); // match the theme's contentSelector
    if (window.tocbot) tocbot.refresh();
  });
</script>
```

**Server TOC.** Copy the bundled builder ([scripts/hbe-toc.js](scripts/hbe-toc.js))
into the theme and load it on post pages after the theme's own scripts:

```bash
cp "${CLAUDE_SKILL_DIR}/scripts/hbe-toc.js" "themes/$THEME/source/js/hbe-toc.js"
```

```html
<script>
  window.HBE_TOC = {
    container: '#toc',     // the empty container from step 2
    className: 'toc',      // the class the theme passed to toc()
    onRender: function () { /* call the theme's scrollspy init here */ }
  };
</script>
<script src="/js/hbe-toc.js"></script>
```

The builder emits the same markup as Hexo's `toc()` helper, so theme CSS
applies. It reads heading text with `textContent` and never `innerHTML`. It
runs on the decrypt event and once on load, which covers `autoSave` pages that
decrypt from a cached key before the theme's script runs.

**Event rules for any custom handler:**

- Do not depend on `event.detail`; some forks dispatch a plain `Event`.
- Also check for `#hexo-blog-encrypt.hbe-decrypted-content` at load time.
- On PJAX themes, re-run the handler after each page swap.

## 4. Verify

```bash
hexo clean && hexo generate
node "${CLAUDE_SKILL_DIR}/scripts/check-toc-leak.js" \
  --source source/_posts --public public
```

The checker ([scripts/check-toc-leak.js](scripts/check-toc-leak.js)) reads every post with a front-matter `password`, extracts its
Markdown headings (code fences skipped, headings shorter than 4 characters
ignored), and searches all generated `.html`, `.xml`, `.json`, `.txt`, and
`.js` files. Pass tag-encrypted posts explicitly with `--post <file>`. Exit
code 1 means a leak; fix it before deploying. A heading that also appears in
an unencrypted post is a false positive; confirm by viewing source.

Then in a browser:

1. Open an encrypted post: the TOC is empty or hidden, and view-source shows no
   headings.
2. Enter the password: the TOC appears, links scroll to headings, scrollspy
   highlights the current section.
3. With `autoSave: true`, reload: the TOC appears without a password.
4. Open an unencrypted post: the TOC is unchanged.

## 5. Pitfalls

- **Theme-native encryption** (for example Keep's `password` filter, or
  Redefine's bundled copy of hexo-blog-encrypt): use one system. With both,
  posts can be encrypted twice or the plugin's form never renders. Remove or
  disable the theme's copy, or don't install the plugin.
- **Hidden is not secret.** `display:none`, `hidden`, and CSS-only tricks still
  publish headings.
- **Stale hooks.** Themes written for plugin v3 may wait for elements that v4
  no longer outputs (for example `hbe-prefix`). Replace them with the
  `hexo-blog-decrypt` listener.
- **Theme updates** overwrite edits in `themes/<name>`. Prefer the theme's
  override mechanism (`source/_data`, injectors, custom layouts) or record the
  patch so it can be re-applied.

## Report back

State the theme and version, the files changed, the checker's output, and the
browser checks you ran. Say which checks you could not run.
