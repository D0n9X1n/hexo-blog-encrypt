# hexo-blog-encrypt

Hexo plugin that encrypts posts at build time (PBKDF2-SHA256 + AES-256-GCM,
Node `crypto`) and decrypts them in the browser (Web Crypto). This file is a
thin pointer: project details live in [`wiki/`](wiki/).

## Read first

1. [`wiki/Architecture.md`](wiki/Architecture.md): modules, wire format, key files.
2. [`wiki/Development.md`](wiki/Development.md): setup and test commands.
3. [`wiki/Theme-Authoring.md`](wiki/Theme-Authoring.md): the one-file theme contract (only when touching `lib/hbe.*.html`).
4. [`wiki/Release-Process.md`](wiki/Release-Process.md): tag-driven release flow (only when releasing or editing workflows).
5. [`wiki/Wiki-Publication.md`](wiki/Wiki-Publication.md): how documentation is written, checked and published.

**Canonical documentation rule:** `wiki/` at the repository root is the
only source of truth for documentation, for agents and humans alike. There is
no `docs/` folder. Each topic has an English `wiki/<Page>.md` and a Chinese
`wiki/<Page>-zh-CN.md` with matching heading structure and equivalent facts;
update both in the same change.
Load only the English files for routine agent context; read the Chinese files
only when editing or verifying translations. Link other pages by bare page name
(`[Security Model](Security-Model)`), stay in the current language except for
the language-switch link, and link repository files with absolute GitHub URLs.
Run `python3 scripts/check-wiki.py` before pushing. `publish-wiki.yml` mirrors
`wiki/*.md` to the GitHub wiki after every push to master.
Never edit the GitHub wiki directly: browser edits are
overwritten on the next publish.

## Layout

| Path | What |
| --- | --- |
| `index.js`, `src/server/` | Hexo filter and generator (shipped) |
| `src/browser/` | Browser source, bundled by esbuild to `lib/hbe.bundle.js` |
| `lib/` | Theme templates, CSS, built bundle (shipped) |
| `tests/server/`, `tests/e2e/`, `tests/*.test.js` | Node tests, Playwright tests, docs and skill contract tests |
| `skills/hexo-encrypt-toc/SKILL.md` | User-facing Claude Code skill: fix any theme's TOC for encrypted posts |
| `wiki/` | The only documentation source: English `<Page>.md` + Chinese `<Page>-zh-CN.md`, mirrored to the GitHub wiki |
| `scripts/` | Release-notes, wiki checker and wiki-publish tooling (not shipped) |
| `demo/` | Demo site deployed to GitHub Pages |

## Commands

```sh
npm install          # also builds lib/hbe.bundle.js
npm run build        # rebuild the browser bundle
npm run lint
npm run test:server  # Node tests with 100% coverage gate
npm run test:e2e     # Playwright against a real Hexo build of tests/fixtures/hexo-site
npm run test:docs    # docs and skill contract tests
python3 scripts/check-wiki.py   # wiki language pairs, links, Home navigation
npm test             # everything CI runs
```

## Non-negotiables

- **Test first.** No production change without a failing test. Re-run the
  relevant tests before claiming anything is done.
- **100% server coverage** (lines, branches, functions, statements) is enforced
  by `npm run test:server`.
- **Backward compatibility.** New options default safely. Existing encrypted
  posts must still decrypt, or the wire-format version (`data-hbe-format`)
  bumps in lockstep with the bundle.
- **Theme contract.** Every `lib/hbe.<name>.html` keeps the 11 `{{hbe...}}`
  placeholders and 7 `data-*` attributes listed in `wiki/Theme-Authoring.md`.
- **Never publish plaintext.** Don't render `post.origin`, `post.raw` or
  `post._content` into generated output.
- **Both languages.** `ReadMe.md` / `ReadMe.zh.md` and every `wiki/<Page>.md` /
  `wiki/<Page>-zh-CN.md` pair keep the same structure; change both together.
- **Don't ship dev-only paths.** The tarball whitelist in `package.json`
  `files` is `index.js`, `src/server/` and `lib/`. Never add `src/browser/`,
  `build/`, `tests/`, `scripts/`, `skills/`, `demo/` or `.github/`. There are
  no runtime dependencies.

## Releases

Bump `version` in `package.json`, merge to master, then tag `vX.Y.Z` and push
the tag. `release.yml` publishes to npm with provenance and creates the GitHub
Release; notes list issues closed by PRs in the range plus commits. Link issues
with `Closes #N` in PR bodies or they won't appear. There is no CHANGELOG file.
