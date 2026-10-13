# hexo-blog-encrypt

Hexo plugin that encrypts posts at build time (PBKDF2-SHA256 + AES-256-GCM,
Node `crypto`) and decrypts them in the browser (Web Crypto). This file is a
thin pointer: project details live in [`docs/`](docs/).

## Read first

1. [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md): modules, wire format, key files.
2. [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md): setup and test commands.
3. [`docs/THEMES.md`](docs/THEMES.md): the one-file theme contract (only when touching `lib/hbe.*.html`).
4. [`docs/RELEASING.md`](docs/RELEASING.md): tag-driven release flow (only when releasing or editing workflows).

## Layout

| Path | What |
| --- | --- |
| `index.js`, `src/server/` | Hexo filter and generator (shipped) |
| `src/browser/` | Browser source, bundled by esbuild to `lib/hbe.bundle.js` |
| `lib/` | Theme templates, CSS, built bundle (shipped) |
| `tests/server/`, `tests/e2e/`, `tests/*.test.js` | Node tests, Playwright tests, docs and skill contract tests |
| `skills/hexo-encrypt-toc/SKILL.md` | User-facing Claude Code skill: fix any theme's TOC for encrypted posts |
| `docs/wiki/` | Source of the GitHub wiki; `publish-wiki.yml` mirrors it on push to master |
| `scripts/` | Release-notes and wiki-publish tooling (not shipped) |
| `demo/` | Demo site deployed to GitHub Pages |

## Commands

```sh
npm install          # also builds lib/hbe.bundle.js
npm run build        # rebuild the browser bundle
npm run lint
npm run test:server  # Node tests with 100% coverage gate
npm run test:e2e     # Playwright against a real Hexo build of tests/fixtures/hexo-site
npm run test:docs    # docs and skill contract tests
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
  placeholders and 7 `data-*` attributes listed in `docs/THEMES.md`.
- **Never publish plaintext.** Don't render `post.origin`, `post.raw` or
  `post._content` into generated output.
- **Both READMEs.** `ReadMe.md` and `ReadMe.zh.md` keep the same structure;
  apply user-facing doc changes to both.
- **Don't ship dev-only paths.** The tarball whitelist in `package.json`
  `files` is `index.js`, `src/server/` and `lib/`. Never add `src/browser/`,
  `build/`, `tests/`, `scripts/`, `skills/`, `demo/` or `.github/`. There are
  no runtime dependencies.

## Releases

Bump `version` in `package.json`, merge to master, then tag `vX.Y.Z` and push
the tag. `release.yml` publishes to npm with provenance and creates the GitHub
Release; notes list issues closed by PRs in the range plus commits. Link issues
with `Closes #N` in PR bodies or they won't appear. There is no CHANGELOG file.
