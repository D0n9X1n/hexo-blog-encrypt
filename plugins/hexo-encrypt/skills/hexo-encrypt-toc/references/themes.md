# Per-theme examples

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

## Notes

- **`class` option.** NexT, Keep, and Redefine call `toc()` with
  `class: 'nav'`. Set `window.HBE_TOC.className = 'nav'` so their CSS and
  scrollspy selectors match.
- **Closure-scoped initializers.** Butterfly and AnZhiYu keep their scrollspy
  inside `main.js`. Either build the TOC before their own decrypt listener
  runs, or expose the function with a one-line edit.
- **Hidden-origin pattern.** Any template that renders `origin` inside a
  hidden container publishes the headings. Replace it with an empty container
  and the builder; do not keep the hidden copy.
