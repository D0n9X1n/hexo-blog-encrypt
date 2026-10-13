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
per-theme notes in [Per-theme examples](#per-theme-examples) are examples, not a
whitelist. Everything the procedure needs is in this one file: the builder
script is [Appendix A](#appendix-a-hbe-tocjs) and the leak checker is
[Appendix B](#appendix-b-check-toc-leakjs).

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

**Server TOC.** Write the builder from [Appendix A](#appendix-a-hbe-tocjs) to
`themes/$THEME/source/js/hbe-toc.js` (or the theme's equivalent asset folder)
and load it on post pages after the theme's own scripts:

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
# Write Appendix B to a temporary file first, e.g. /tmp/check-toc-leak.js
node /tmp/check-toc-leak.js --source source/_posts --public public
```

The checker reads every post with a front-matter `password`, extracts its
Markdown headings (code fences skipped, headings shorter than 4 characters
ignored), and searches all generated `.html`, `.xml`, `.json`, `.txt`, and
`.js` files. Pass tag-encrypted posts explicitly with `--post <file>`. Add
`--body` to also check every prose line of 40+ characters (search indexes,
feeds, metadata). Exit code 1 means a leak; fix it before deploying. A heading that also appears in
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

## Per-theme examples

Examples gathered from each theme's default branch on 2026-10-12. Line
numbers drift; re-run the step 1 search before editing. Themes not listed here
use the same procedure.

| Theme | TOC source | Type | Leaks today? | Re-init after decrypt |
| --- | --- | --- | --- | --- |
| NexT | `layout/_macro/sidebar.njk` `toc(page.content, {class: 'nav'})` | Server | No (empty) | `NexT.utils.registerSidebarTOC()`, `NexT.utils.activateSidebarPanel(0)` |
| Butterfly | `layout/includes/widget/card_post_toc.pug` | Server | **Yes, hidden** `toc(page.origin)` | Build into `#card-toc .toc-content` before the theme's own `hexo-blog-decrypt` listener runs `forPostFn()` |
| AnZhiYu | `layout/includes/widget/card_post_toc.pug` | Server | **Yes, hidden** `toc(page.origin)` | Build into `#card-toc .toc-content`, then call the theme's `scrollFnToDo()` |
| Fluid | `layout/_partials/post/toc.ejs` | Client (tocbot, `.markdown-body`) | No | Add `markdown-body` to `#hexo-blog-encrypt`, then `Fluid.boot.refresh()`. The theme's `hbe-prefix` hook is from plugin v3 and never fires |
| Icarus | `hexo-component-inferno` `src/view/widget/toc.jsx` | Server | **Yes, visible** `encrypt ? origin : content` | Override the widget to pass `''` when encrypted; build `ul.menu-list` and reload `/js/toc.js` |
| Stellar | `layout/_partial/widgets/toc.ejs` | Server + client rebuild | No | Output an empty `nav.toc`, then dispatch `stellar:mdrender` on `document` |
| Redefine | `layout/pages/post/toc.ejs` | Server | No | Remove the theme's bundled copy of the plugin first; fill `.post-toc` and dispatch `redefine:page:refresh` |
| Volantis | `layout/_widget/toc.ejs` | Server | **Yes, hidden** `page.encrypt ? page.origin : page.content` | Render an empty `#toc-div .content`, build, then `listenSidebarTOC()` |
| Matery | `layout/_partial/post-detail-toc.ejs` | Client (tocbot, `#articleContent`) | No | `tocbot.refresh()` |
| Keep | `layout/_partial/toc.ejs` | Server | No, but has its own `password` encryption | Choose one encryption system; then fill `.post-toc` and call `KEEP.initTOC()` |
| Shoka | `layout/_macro/sidebar.njk` | Server | No | Output an empty `.contents` panel; build `ol.toc`; call `sidebarTOC()` |
| Cactus | `layout/_partial/post/actions_desktop.ejs`, `actions_mobile.ejs` | Server | No | Always output an empty `#toc`; fill it. No scrollspy |
| Landscape | none | — | No | Nothing to do |

### Notes

- **`class` option.** NexT, Keep, and Redefine call `toc()` with
  `class: 'nav'`. Set `window.HBE_TOC.className = 'nav'` so their CSS and
  scrollspy selectors match.
- **Closure-scoped initializers.** Butterfly and AnZhiYu keep their scrollspy
  inside `main.js`. Either build the TOC before their own decrypt listener
  runs, or expose the function with a one-line edit.
- **Hidden-origin pattern.** Any template that renders `origin` inside a
  hidden container publishes the headings. Replace it with an empty container
  and the builder; do not keep the hidden copy.

## Appendix A: hbe-toc.js

Theme-agnostic TOC builder. Write this block verbatim to the theme's
JavaScript folder.

````js
/* hbe-toc.js: theme-agnostic table of contents for hexo-blog-encrypt posts.
 *
 * Builds the TOC in the browser from the decrypted post, so the published
 * HTML never contains the encrypted post's headings. Markup matches Hexo's
 * `toc()` helper (`ol.<cls> > li.<cls>-item.<cls>-level-N > a.<cls>-link >
 * span.<cls>-text`, nested `ol.<cls>-child`), so most theme CSS and scrollspy
 * code works unchanged.
 *
 * Configure before this script loads (all optional):
 *   window.HBE_TOC = {
 *     container: '#toc',          // element that receives the TOC
 *     className: 'toc',           // Hexo toc() `class` option ('nav' for NexT, Keep, Redefine)
 *     maxDepth: 6,                // deepest heading level to include
 *     listNumber: false,          // add <span class="<cls>-number"> like toc({list_number: true})
 *     onRender: function (container, decrypted) {}, // re-run the theme's scrollspy here
 *   };
 */
(function () {
  'use strict';

  var opts = window.HBE_TOC || {};
  var cls = opts.className || 'toc';
  var maxDepth = opts.maxDepth || 6;

  function slug(text, used) {
    var base = text.trim().toLowerCase().replace(/[\s]+/g, '-').replace(/[^\p{L}\p{N}_-]/gu, '') || 'section';
    var id = base;
    for (var i = 1; used[id] || document.getElementById(id); i++) id = base + '-' + i;
    used[id] = true;
    return id;
  }

  function headings(root) {
    var selector = [];
    for (var level = 1; level <= maxDepth; level++) selector.push('h' + level);
    return Array.prototype.filter.call(root.querySelectorAll(selector.join(',')), function (h) {
      return h.textContent.trim() !== '';
    });
  }

  function build(root) {
    var used = {};
    var list = document.createElement('ol');
    list.className = cls;
    // stack[i] = { level, item } for the open ancestors of the next heading.
    var stack = [];
    var counters = [];

    headings(root).forEach(function (h) {
      var level = Number(h.tagName.charAt(1));
      if (!h.id) h.id = slug(h.textContent, used);

      while (stack.length && stack[stack.length - 1].level >= level) stack.pop();
      counters.length = stack.length + 1;
      counters[stack.length] = (counters[stack.length] || 0) + 1;

      var parentList = list;
      if (stack.length) {
        var parent = stack[stack.length - 1].item;
        parentList = parent.querySelector(':scope > ol.' + cls + '-child');
        if (!parentList) {
          parentList = document.createElement('ol');
          parentList.className = cls + '-child';
          parent.appendChild(parentList);
        }
      }

      var item = document.createElement('li');
      item.className = cls + '-item ' + cls + '-level-' + level;
      var link = document.createElement('a');
      link.className = cls + '-link';
      link.setAttribute('href', '#' + encodeURIComponent(h.id));
      if (opts.listNumber) {
        var number = document.createElement('span');
        number.className = cls + '-number';
        number.textContent = counters.join('.') + '.';
        link.appendChild(number);
        link.appendChild(document.createTextNode(' '));
      }
      var text = document.createElement('span');
      text.className = cls + '-text';
      // textContent, never innerHTML: headings are author content, not markup we trust.
      text.textContent = h.textContent.trim();
      link.appendChild(text);
      item.appendChild(link);
      parentList.appendChild(item);
      stack.push({ level: level, item: item });
    });
    return list;
  }

  function render() {
    var decrypted = document.querySelector('#hexo-blog-encrypt.hbe-decrypted-content');
    var container = document.querySelector(opts.container || '#toc');
    if (!decrypted || !container) return;
    var list = build(decrypted);
    container.textContent = '';
    if (list.children.length) container.appendChild(list);
    container.hidden = false;
    container.style.removeProperty('display');
    if (typeof opts.onRender === 'function') opts.onRender(container, decrypted);
  }

  // Some forks dispatch a plain Event without `detail`, so never read it.
  window.addEventListener('hexo-blog-decrypt', render);
  // With autoSave, a cached key can decrypt before this script runs.
  render();
})();
````

## Appendix B: check-toc-leak.js

Leak checker (Node.js 18+, no dependencies). Write this block verbatim to a
temporary file and run it from the Hexo site root.

````js
#!/usr/bin/env node
/* check-toc-leak.js: fail if an encrypted post's text appears in generated files.
 *
 * Usage (from the Hexo site root, after `hexo clean && hexo generate`):
 *   node check-toc-leak.js [--source source/_posts] [--public public] [--post path.md ...] [--body]
 *
 * Headings are always checked. --body also checks every prose line of at least
 * 40 characters, which catches search indexes, feeds and metadata that copy
 * the post body.
 * Posts with a non-empty front-matter `password` are checked automatically.
 * Tag-encrypted posts have no front-matter password; pass them with --post.
 * Exit code: 0 clean, 1 leak found, 2 usage or I/O error.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const MIN_HEADING_LENGTH = 4;
const MIN_BODY_LENGTH = 40;
const SCANNED_EXTENSIONS = new Set(['.html', '.xml', '.json', '.txt', '.js']);

function parseArgs(argv) {
  const args = { source: 'source/_posts', public: 'public', posts: [], body: false };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === '--body') {
      args.body = true;
      continue;
    }
    const value = argv[i + 1];
    if (!['--source', '--public', '--post'].includes(flag) || value === undefined) {
      throw new Error(`unknown or incomplete argument: ${flag}`);
    }
    if (flag === '--post') args.posts.push(value);
    else args[flag.slice(2)] = value;
    i++;
  }
  return args;
}

function frontMatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  return match ? match[1] : '';
}

function hasPassword(text) {
  const match = /^password:[ \t]*(.*)$/m.exec(frontMatter(text));
  if (!match) return false;
  const value = match[1].trim().replace(/^(['"])(.*)\1$/, '$2');
  return value !== '';
}

function plain(text) {
  return text
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[`*_~]/g, '')
    .trim();
}

function headings(text, includeBody = false) {
  const body = text.replace(/^---\r?\n[\s\S]*?\r?\n---/, '');
  const out = [];
  let fence = null;
  for (const line of body.split(/\r?\n/)) {
    const fenceMatch = /^\s*(```|~~~)/.exec(line);
    if (fenceMatch) {
      fence = fence === fenceMatch[1] ? null : (fence || fenceMatch[1]);
      continue;
    }
    if (fence) continue;
    const match = /^#{1,6}\s+(.+?)\s*#*\s*$/.exec(line);
    if (match) {
      const heading = plain(match[1]);
      if (heading.length >= MIN_HEADING_LENGTH) out.push(heading);
      continue;
    }
    if (!includeBody || /^\s*(<|\||>|[-*+]\s|\d+\.\s|<!--)/.test(line)) continue;
    const prose = plain(line);
    if (prose.length >= MIN_BODY_LENGTH) out.push(prose);
  }
  return out;
}

function walk(dir, extensions, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, extensions, files);
    else if (extensions.has(path.extname(entry.name))) files.push(full);
  }
  return files;
}

function escapeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    return 2;
  }
  if (!fs.existsSync(args.public)) {
    console.error(`generated directory not found: ${args.public} (run hexo generate first)`);
    return 2;
  }

  const posts = new Set(args.posts);
  if (fs.existsSync(args.source)) {
    for (const file of walk(args.source, new Set(['.md']))) {
      if (hasPassword(fs.readFileSync(file, 'utf8'))) posts.add(file);
    }
  }
  if (posts.size === 0) {
    console.log('No encrypted posts found. Pass tag-encrypted posts with --post.');
    return 0;
  }

  const needles = [];
  for (const post of posts) {
    for (const heading of headings(fs.readFileSync(post, 'utf8'), args.body)) {
      needles.push({ post, heading, forms: [heading, escapeHtml(heading), encodeURIComponent(heading)] });
    }
  }

  const leaks = [];
  for (const file of walk(args.public, SCANNED_EXTENSIONS)) {
    const text = fs.readFileSync(file, 'utf8');
    for (const needle of needles) {
      if (needle.forms.some((form) => text.includes(form))) leaks.push({ file, ...needle });
    }
  }

  for (const leak of leaks) {
    console.log(`LEAK ${leak.file}: "${leak.heading}" from ${leak.post}`);
  }
  console.log(`${posts.size} encrypted post(s), ${needles.length} string(s) checked, ${leaks.length} leak(s).`);
  return leaks.length ? 1 : 0;
}

if (require.main === module) process.exitCode = main();

module.exports = { hasPassword, headings };
````
