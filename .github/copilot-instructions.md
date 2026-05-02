# Copilot Instructions — hexo-blog-encrypt

## What this is

A Hexo plugin that encrypts blog posts at build time. Readers enter a password in the browser to decrypt content client-side via Web Crypto. Plain Node.js — uses Hexo's filter/generator hooks; no bundler.

### Key files

- `index.js` — Hexo entry. Registers config defaults, the `hexo-blog-encrypt` filter on `after_post_render`, and the `hbe.js`/`hbe.css` generators.
- `lib/` — Encryption logic (PBKDF2 → AES-CBC), the HTML wrapper template, the in-browser `hbe.js` decryptor, and `hbe.css`.
- `ReadMe.md` / `ReadMe.zh.md` — User-facing docs (English / Chinese).

Encryption uses a per-post random salt (see commit `e91245d`); the salt is embedded in the wrapper HTML so the browser-side `hbe.js` can derive the same key.

## Conventions

- Node CommonJS (`require`/`module.exports`); no transpilation.
- ESLint config in `.eslintrc.js`, EditorConfig in `.editorconfig` — match existing style.
- Backward-compatible config: new options must default safely; existing encrypted posts must still decrypt.
- Update both `ReadMe.md` and `ReadMe.zh.md` when user-facing behavior changes.

## Development workflow — feature-crew

This project uses the **feature-crew** agent framework (vendored as a git submodule at `feature-crew/`).

Read and follow these at session start:
- `feature-crew/.github/copilot-instructions.md` — framework rules (TDD, root-cause debugging, verification, cross-model audit)
- `feature-crew/agents/pm.md` — your PM behavior and track-selection process
- `feature-crew/workflow/pipeline.md` — pipelines, gates, dispatch rules

Agent prompt templates live in `feature-crew/agents/`.

### Submodule maintenance

After cloning the repo, initialize the submodule:

```sh
git submodule update --init --recursive
```

To pull the latest framework updates:

```sh
git submodule update --remote feature-crew
```
