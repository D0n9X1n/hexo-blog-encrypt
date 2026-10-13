# Callbacks & MathJax

[简体中文](Callbacks-and-MathJax-zh-CN)

After a post decrypts, you may need to re-initialize page-level libraries that scanned the DOM at load time:

- **MathJax / KaTeX** — re-typeset newly-revealed math
- **highlight.js / Prism** — re-highlight newly-revealed code blocks
- **mermaid / plantuml** — render diagrams
- **Table-of-contents widgets** — refresh from the now-visible headings
- **Lazy-loaders** — observe newly-visible images

The plugin gives you two hooks for this.

## Hook 1: `hexo-blog-decrypt` window event (recommended)

The browser bundle dispatches a `hexo-blog-decrypt` `CustomEvent` on `window` immediately after decryption succeeds.

### Minimal listener

Put this in your theme's layout (so it runs on every page, not just decrypted ones):

```html
<script>
  window.addEventListener('hexo-blog-decrypt', function (e) {
    var mode = (e && e.detail && e.detail.mode) || 'unknown';
    console.log('[hbe] decrypted, mode:', mode);
  });
</script>
```

`e.detail.mode` is `'manual'` for a fresh password decrypt or `'cached'` when an opt-in `autoSave` reload auto-decrypts. v3-style listeners that ignore `detail` keep working unchanged — the event fires either way.

### Worked example: MathJax

Live demo: **[/demo/mathjax/](https://d0n9x1n.github.io/hexo-blog-encrypt/demo/mathjax/)** (password `hello`).

You can put MathJax loading either in the page layout (loads on every page) or inside the encrypted body (loads only after decryption — recommended for math-heavy locked posts to avoid the cost on every page).

The cleanest pattern uses MathJax 3's auto-typeset on the decrypted DOM:

```html
<!-- 1. Configure MathJax before it loads -->
<script>
  window.MathJax = {
    tex: { inlineMath: [['$', '$'], ['\\(', '\\)']] },
    startup: { typeset: true }
  };
</script>

<!-- 2. Load MathJax (async, from CDN) -->
<script src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-chtml.js" async></script>
```

Place the two `<script>` tags **inside the encrypted post body**. The browser bundle re-creates `<script>` tags inside decrypted HTML as live nodes (see "How scripts in encrypted posts work" below), so MathJax loads only after the user enters the right password and finds the math the moment it's ready.

If MathJax is loaded site-wide and you only need it to re-typeset the decrypted post:

```html
<script>
  window.addEventListener('hexo-blog-decrypt', function () {
    if (window.MathJax && window.MathJax.typesetPromise) {
      window.MathJax.typesetPromise();
    }
  });
</script>
```

### Worked example: highlight.js

If hljs ran at page load and missed the encrypted code blocks:

```html
<script>
  window.addEventListener('hexo-blog-decrypt', function () {
    if (window.hljs) {
      document
        .querySelectorAll('#hexo-blog-encrypt pre code')
        .forEach(function (el) { window.hljs.highlightElement(el); });
    }
  });
</script>
```

### Worked example: alert() (just to see it firing)

The live callback demo at **[/demo/callback/](https://d0n9x1n.github.io/hexo-blog-encrypt/demo/callback/)** uses:

```html
<script>
window.addEventListener('hexo-blog-decrypt', function (e) {
  var mode = (e && e.detail && e.detail.mode) || 'unknown';
  console.log('[demo] hexo-blog-decrypt fired, mode:', mode);
  window.alert('Decryption callback fired! mode = ' + mode);
});
</script>
```

Type the password → an `alert()` pops up → click OK → content reveals. Confirms the listener saw the event.

## Hook 2: Inline `<script>` in the encrypted body

Anything you put in the encrypted markdown body — including `<script>` tags — is re-executed when the post decrypts. The browser bundle's `convertHTMLToElement` helper re-creates encrypted `<script>` tags as live DOM nodes (the standard "innerHTML doesn't run scripts" workaround).

Use this when you want code that **runs only for readers who unlock the post**:

```markdown
---
title: Locked Notes
password: hello
---
Below the cut is private.

<!-- more -->

# Private notes

Some private text.

<script>
  // Only runs when this post is decrypted.
  console.log('reader unlocked the notes');
</script>
```

## How scripts in encrypted posts work

`innerHTML = htmlString` does **not** execute `<script>` tags by default — that's a browser security policy. The bundle works around it by:

1. Setting `innerHTML` on a temporary wrapper to parse the HTML
2. Walking every `<script>` in the wrapper, creating a fresh `<script>` element with the same attributes + text content, and replacing the parsed-but-inert script with it
3. Appending the wrapper to the DOM — at which point the new script nodes execute

Then the bundle dispatches `hexo-blog-decrypt`. Because the swap happens **before** the dispatch, listeners registered inside the body's `<script>` are present when the event fires.

Source: [`src/browser/dom.js`](https://github.com/D0n9X1n/hexo-blog-encrypt/blob/master/src/browser/dom.js).

## Encrypting a post with a TOC

If your theme renders a TOC, it is empty for encrypted posts because the headings are inside the ciphertext.

**Do not render `toc(post.origin)`, even inside `display:none`.** `post.origin` is plaintext; rendering it publishes every heading in the page source. Earlier versions of this wiki recommended that pattern. It is unsafe.

Instead, render the server TOC only for unencrypted posts, keep an empty container, and build the TOC in the browser after the `hexo-blog-decrypt` event. The full, theme-agnostic procedure (with a drop-in builder script and a leak checker) is on the [Encrypted TOC](Encrypted-TOC) page.
