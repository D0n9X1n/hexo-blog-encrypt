# Encrypted TOC

Make any Hexo theme's table of contents work on encrypted posts **without
publishing the encrypted headings**.

## The problem

The plugin replaces `post.content` with ciphertext, sets `post.encrypt = true`,
and keeps plaintext in `post.origin`. Themes react in one of three ways:

| What you see | Cause | Safe? |
| --- | --- | --- |
| TOC empty or missing | `toc(post.content)` sees ciphertext | Safe, but no TOC |
| TOC visible before unlocking | `toc(post.origin)` | **Leaks headings** |
| TOC hidden, shown after unlocking | `toc(post.origin)` + `display:none` | **Leaks headings** (view source) |

A survey of 13 popular themes on 2026-10-12 found Icarus leaking visibly and
Butterfly, AnZhiYu and Volantis leaking hidden headings.

## The fix, for any theme

1. **Find the TOC.** Search the theme (and any component package) for
   `toc(`, `.origin`, `encrypt`, `tocbot`, `hexo-blog-decrypt`.
2. **Remove plaintext.** Delete every `toc(*.origin)`. Wrap the remaining
   server call in `if !page.encrypt`, but keep the empty container:

   ```ejs
   <div id="toc" class="toc-article">
     <% if (!page.encrypt) { %><%- toc(page.content) %><% } %>
   </div>
   ```

3. **Rebuild after decryption.**
   - Client TOC (tocbot and similar): make sure `#hexo-blog-encrypt` is inside
     the scanner's content selector, then call its refresh on
     `hexo-blog-decrypt`.
   - Server TOC: load the drop-in builder
     `hbe-toc.js` ([Appendix A of the skill](https://github.com/D0n9X1n/hexo-blog-encrypt/blob/master/skills/hexo-encrypt-toc/SKILL.md#appendix-a-hbe-tocjs)).
     It emits the same markup as Hexo's `toc()` helper, so theme CSS applies:

     ```html
     <script>
       window.HBE_TOC = {
         container: '#toc',   // the empty container from step 2
         className: 'toc',    // the class the theme passes to toc(); 'nav' for NexT, Keep, Redefine
         onRender: function () { /* call the theme's scrollspy init */ }
       };
     </script>
     <script src="/js/hbe-toc.js"></script>
     ```

4. **Verify** there is no leak:

   ```bash
   hexo clean && hexo generate
   node check-toc-leak.js --source source/_posts --public public
   ```

   `check-toc-leak.js` ([Appendix B of the skill](https://github.com/D0n9X1n/hexo-blog-encrypt/blob/master/skills/hexo-encrypt-toc/SKILL.md#appendix-b-check-toc-leakjs))
   exits with code 1 if any heading of a password-protected post appears in
   the generated site. Pass tag-encrypted posts with `--post <file>`.

Handler rules: don't read `event.detail` (some forks send a plain `Event`),
also check for `#hexo-blog-encrypt.hbe-decrypted-content` at load time (cached
`autoSave` keys can decrypt first), and re-run after PJAX page swaps.

## Let Claude Code do it

The whole procedure is a single [Claude Code](https://claude.com/claude-code)
skill file: [`skills/hexo-encrypt-toc/SKILL.md`](https://github.com/D0n9X1n/hexo-blog-encrypt/blob/master/skills/hexo-encrypt-toc/SKILL.md). It includes the
steps, the builder and the leak checker. Save it as a personal skill:

```bash
mkdir -p ~/.claude/skills/hexo-encrypt-toc
curl -fsSL https://raw.githubusercontent.com/D0n9X1n/hexo-blog-encrypt/master/skills/hexo-encrypt-toc/SKILL.md \
  -o ~/.claude/skills/hexo-encrypt-toc/SKILL.md
```

Then, from your blog's directory, ask Claude Code: *"Fix the TOC for encrypted
posts in my theme."* or run `/hexo-encrypt-toc`.

## Per-theme examples

Notes for NexT, Butterfly, AnZhiYu, Fluid, Icarus, Stellar, Redefine, Volantis,
Matery, Keep, Shoka, Cactus and Landscape are in
the skill's [Per-theme examples](https://github.com/D0n9X1n/hexo-blog-encrypt/blob/master/skills/hexo-encrypt-toc/SKILL.md#per-theme-examples).
They are examples; the steps above apply to every theme.

Watch for themes with their **own** encryption (Keep) or a **bundled copy** of
this plugin (Redefine). Use one encryption system, not both.
