# Architecture

A Hexo plugin that encrypts blog posts at build time. Readers enter a
password in the browser to decrypt content client-side via the **Web
Crypto API**. Plain Node.js — uses Hexo's filter/generator hooks; the
browser bundle is built with esbuild (no runtime bundler).

## Repository map

| Path | Role |
| --- | --- |
| `index.js` | Hexo entry point. Registers config defaults, the `hexo-blog-encrypt` filter on `after_post_render`, and the asset generators that emit `lib/hbe.style.css` + `lib/hbe.bundle.<hash>.js`. Thin shim over `src/server/index.js`. |
| `src/server/` | Server-side composition. See [Server modules](#server-modules) below. |
| `src/browser/` | Browser-side composition. Single esbuild bundle output to `lib/hbe.bundle.js`; emitted at deploy time as `lib/hbe.<hash10>.js` for cache-busting. |
| `lib/hbe.<theme>.html` | Per-theme HTML wrappers. **One file = one theme** — auto-discovered at filter time. See [`docs/THEMES.md`](THEMES.md). |
| `lib/hbe.style.css` | Single stylesheet shared by every theme. |
| `tests/` | Real-Hexo + Playwright e2e harness. `npm test` runs lint + server tests + e2e. |
| `docs/` | Source-of-truth project documentation (you are here). |
| `feature-crew/` | Vendored agent framework used for non-trivial work. Git submodule. |
| `.github/workflows/` | CI: `test.yml` (every push/PR), `release.yml` (npm), `publish-gh-packages.yml` (GH Packages mirror), `deploy-demo.yml` (Pages). |
| `demo/` | Live-demo Hexo site published to GitHub Pages. References the published npm package, NOT a `file:..` path. |
| `ReadMe.md` / `ReadMe.zh.md` | User-facing README in English / 中文. **Both must be updated** when user-facing behavior changes. |
| `CHANGELOG.md` | Keep-a-changelog format. Each release gets a dated `## [x.y.z] — YYYY-MM-DD` entry. |

## Server modules (`src/server/`)

| Module | Responsibility |
| --- | --- |
| `index.js` | Composition root — wires config + crypto + template + generator into the Hexo filter callback. |
| `config.js` | Deep-merge of `hexo.config.encrypt` with per-post front-matter; KDF-iterations floor; `wrong_hash_message` → `wrong_pass_message` defaulting; tag-registry lookup. |
| `crypto.js` | PBKDF2-SHA256 → AES-256-GCM. Per-post 16-byte salt + 12-byte nonce. Returns `{ ciphertextHex, saltHex, nonceHex, tagHex, kdfIterations }`. |
| `template.js` | Single allowlist of 10 `{{hbe…}}` placeholders + per-placeholder render mode (attr-escape / text-escape / hex-validated). The contract every theme HTML satisfies. |
| `generator.js` | Hexo asset generator. Emits `lib/hbe.style.css` + content-hashed `lib/hbe.<hex10>.js`. The hex10 is `sha256(bundle).slice(0, 10)`. |
| `logger.js` | Tiny console wrapper — namespaced "[hexo-blog-encrypt]" prefix + verbosity gate. |

## Browser bundle (`src/browser/`)

Built into a single ESM bundle with esbuild (`build/build.js`). The output
file is **not** committed; it's regenerated on `npm run build` and on
`prepack`. Entry: `src/browser/main.js`.

| Layer | What it does |
| --- | --- |
| `readWireFormat()` | Reads `data-hbe-format` from `#hexo-blog-encrypt`. Bails if not `"4"`. Then reads salt / nonce / kdf-iterations / wpm / auto-save from `data-*` attributes. |
| `deriveKey()` | `crypto.subtle.importKey('raw', utf8(password))` → `crypto.subtle.deriveKey({ name:'PBKDF2', salt, iterations, hash:'SHA-256' }, …, AES-GCM, 256)`. |
| `decrypt()` | `crypto.subtle.decrypt({ name:'AES-GCM', iv:nonce }, key, ciphertextWithTag)`. |
| `bindForm()` | Wires submit handler on `#hbeForm`. On success → swaps innerHTML, dispatches `CustomEvent('hexo-blog-decrypt', { detail: { mode } })`, optionally caches the derived key in `localStorage` (key namespace `hbe.v4.<url-hash>`) when `data-auto-save="true"`. |

## Wire format (v4)

Browser ↔ server contract is the seven `data-*` attributes on the
`#hexo-blog-encrypt` wrapper plus the `<script id="hbeData">` body. The
exact attribute / placeholder table is in [`docs/THEMES.md`](THEMES.md);
the bundle gates on `data-hbe-format="4"` and refuses to attempt
decryption against any other value, so changing the wire format requires
bumping the version byte and the bundle in lockstep.

## Code conventions

- **Node CommonJS** (`require` / `module.exports`) on the server side; no
  transpilation. Browser side is ESM (esbuild handles bundling).
- **ESLint** config at `.eslintrc.js`; **EditorConfig** at `.editorconfig`
  — match existing style.
- **Backward-compatible config.** New options must default safely.
  Existing encrypted posts in the wild must still decrypt with the same
  password against the new bundle, OR the wire-format byte must bump.
- **Both READMEs in lockstep.** `ReadMe.md` and `ReadMe.zh.md` carry the
  same headings in the same order — the docs test guards this for the
  "Why upgrade" section.
- **Tarball whitelist.** `package.json`'s `files` field limits the npm
  tarball to `index.js` + `lib/`. Don't ship `tests/`, `demo/`,
  `feature-crew/`, `.github/`, or `src/` (the bundle in `lib/` is what
  ships, not the sources).

## See also

- [`docs/THEMES.md`](THEMES.md) — the one-file theme drop contract.
- [`docs/RELEASING.md`](RELEASING.md) — release procedure.
- [`docs/DEVELOPMENT.md`](DEVELOPMENT.md) — workflow rules + commands.
- [`docs/specs/`](specs/) — accepted feature specs.
- [`docs/plans/`](plans/) — accepted implementation plans.
