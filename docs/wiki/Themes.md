# Themes

Eight reveal-animation themes ship with the plugin. They differ only in CSS — the prompt structure (password field, button, error region) is identical across all themes, so any theme works with any feature (button, autoSave, callbacks, …).

## Gallery (live demo)

Each link goes to a live demo post. Password is `hello`.

| Theme | Demo |
|---|---|
| `default` | [hello → reveal](https://d0n9x1n.github.io/hexo-blog-encrypt/demo/theme/default/) |
| `blink`   | [hello → reveal](https://d0n9x1n.github.io/hexo-blog-encrypt/demo/theme/blink/) |
| `flip`    | [hello → reveal](https://d0n9x1n.github.io/hexo-blog-encrypt/demo/theme/flip/) |
| `shrink`  | [hello → reveal](https://d0n9x1n.github.io/hexo-blog-encrypt/demo/theme/shrink/) |
| `surge`   | [hello → reveal](https://d0n9x1n.github.io/hexo-blog-encrypt/demo/theme/surge/) |
| `up`      | [hello → reveal](https://d0n9x1n.github.io/hexo-blog-encrypt/demo/theme/up/) |
| `wave`    | [hello → reveal](https://d0n9x1n.github.io/hexo-blog-encrypt/demo/theme/wave/) |
| `xray`    | [hello → reveal](https://d0n9x1n.github.io/hexo-blog-encrypt/demo/theme/xray/) |

## Selecting a theme

### Site-wide

```yaml
# _config.yml
encrypt:
  theme: wave
```

### Per post

```markdown
---
title: This one uses xray
password: hello
theme: xray
---
```

Per-post setting overrides site-wide.

## What changes between themes

Themes are HTML/CSS bundles in `lib/hbe.<theme>.html`. They control:

- **Reveal animation** — how the encrypted shell transitions to the decrypted body (fade, slide, blink, etc.)
- **Visual styling** — colors, padding, typography of the password prompt

They do **NOT** change:

- Wire format (all themes use the same v4 ciphertext layout)
- Browser bundle (`lib/hbe.bundle.js` is theme-agnostic)
- Configuration schema
- The decrypted post's appearance — once the post reveals, your normal Hexo theme styles apply

## Adding your own theme

1. Copy `lib/hbe.default.html` to `lib/hbe.<your-name>.html`.
2. Edit the markup / CSS. Keep the **slot tokens** intact (`__abstract__`, `__message__`, `__decrypt_button__`, etc.) — the server-side template engine fills them at build time.
3. Reference it in config: `theme: your-name`.

The slot list is documented in `src/server/template.js#ALLOWED_SLOTS` (the only allow-list the renderer accepts).

If you build a theme worth sharing, please open a PR — we love new ones.

## Theme contract testing

Every shipped theme is exercised by the e2e suite (`tests/e2e/theme-contract.spec.js`) against the v4 wire format. To add a new theme without breaking CI, materialize one fixture post per theme — see `tests/helpers/buildSite.js#materializePosts`. The harness auto-discovers themes via the `hbe.<name>.html` filename pattern.
