# Architecture

A Hexo plugin that encrypts blog posts at build time. Readers enter a
password in the browser to decrypt content client-side via the **Web
Crypto API**. Plain Node.js — uses Hexo's filter/generator hooks; the
browser bundle is built with esbuild (no runtime bundler).

## Repository map

| Path | Role |
| --- | --- |
| `index.js` | Hexo entry point. Registers config defaults, the `hexo-blog-encrypt` filter on `after_post_render`, and the asset generators that emit `css/hbe.style.css` + `lib/hbe.<hash10>.js`. Thin shim over `src/server/index.js`. |
| `src/server/` | Server-side composition. See [Server modules](#server-modules) below. |
| `src/browser/` | Browser-side composition. Single esbuild bundle output to `lib/hbe.bundle.js`; emitted at deploy time as `lib/hbe.<hash10>.js` for cache-busting. |
| `lib/hbe.<theme>.html` | Per-theme HTML wrappers. **One file = one theme** — auto-discovered at filter time. See [`docs/THEMES.md`](THEMES.md). |
| `lib/hbe.style.css` | Single stylesheet shared by every theme. |
| `tests/` | Real-Hexo + Playwright e2e harness. `npm test` runs lint + server tests + e2e. |
| `docs/` | Source-of-truth project documentation (you are here). |
| `.github/workflows/` | CI: `test.yml` (every push/PR), `release.yml` (npm), `publish-gh-packages.yml` (GH Packages mirror), `deploy-demo.yml` (Pages). |
| `demo/` | Live-demo Hexo site published to GitHub Pages. References the published npm package, NOT a `file:..` path. |
| `ReadMe.md` / `ReadMe.zh.md` | User-facing README in English / 中文. **Both must be updated** when user-facing behavior changes. |
| `CHANGELOG.md` | Keep-a-changelog format. Each release gets a dated `## [x.y.z] — YYYY-MM-DD` entry. |

## Server modules (`src/server/`)

| Module | Responsibility |
| --- | --- |
| `index.js` | Composition root — wires config + crypto + template + generator into the Hexo filter callback. |
| `config.js` | Deep-merge of `hexo.config.encrypt` with per-post front-matter; KDF-iterations floor; `wrong_hash_message` → `wrong_pass_message` defaulting. Tag-registry lookup lives in `index.js`. |
| `crypto.js` | PBKDF2-SHA256 → AES-256-GCM. Per-post 32-byte salt + 12-byte nonce. With `stableSalt: true`, the salt is derived from the post permalink; the nonce is still random for every encryption. |
| `template.js` | Single allowlist of 11 `{{hbe…}}` placeholders + per-placeholder render mode (attr-escape / text-escape / hex-validated). The contract every theme HTML satisfies. |
| `generator.js` | Hexo asset generator. Emits `css/hbe.style.css` + content-hashed `lib/hbe.<hex10>.js`. The hex10 is `sha256(bundle).slice(0, 10)`. |
| `logger.js` | Hexo logger adapter with a verbosity gate; warnings and errors remain visible. |

## Browser bundle (`src/browser/`)

Built into a single IIFE bundle with esbuild (`build/build.js`). The output
file is **not** committed; it's regenerated on `npm run build` and on
`prepack`. Entry: `src/browser/main.js`.

| Layer | What it does |
| --- | --- |
| `readWireFormat()` | Reads `data-hbe-format` from `#hexo-blog-encrypt`. Bails if not `"4"`. Then reads salt / nonce / kdf-iterations / wpm / auto-save from `data-*` attributes. |
| `deriveKey()` | `crypto.subtle.importKey('raw', utf8(password))` → `crypto.subtle.deriveKey({ name:'PBKDF2', salt, iterations, hash:'SHA-256' }, …, AES-GCM, 256)`. |
| `decrypt()` | `crypto.subtle.decrypt({ name:'AES-GCM', iv:nonce }, key, ciphertextWithTag)`. |
| `bootstrap()` / `handleSubmit()` | Wires `#hbeForm`; optionally saves the derived key, reveals the decrypted DOM, then dispatches `hexo-blog-decrypt` with `detail.mode`. Cache keys are `hbe.v4.` + pathname + query, not a URL hash. |
| `swapInDecryptedDOM()` | Attaches inert content, restores scripts in document order, and waits for external load/error events (15-second deadline each) before the decrypt callback. Explicit `async` scripts load independently. Inline modules retain native asynchronous execution and do not delay the callback. |

## Wire format (v4)

Browser ↔ server contract is the seven `data-*` attributes on the
`#hexo-blog-encrypt` wrapper plus the `<script id="hbeData">` body. The
exact attribute / placeholder table is in [`docs/THEMES.md`](THEMES.md);
the bundle gates on `data-hbe-format="4"` and refuses to attempt
decryption against any other value, so changing the wire format requires
bumping the version byte and the bundle in lockstep.

`stableSalt` is server-side only and does not add an eighth `data-*`
attribute. When enabled, `src/server/index.js` derives the 32-byte salt
from the namespace `hexo-blog-encrypt:v4:stableSalt:` plus a NUL separator
and the post permalink. If the permalink changes, the stable salt changes and any
existing `autoSave` cache for that page is invalidated.

For `autoSave`, the browser cache entry keeps `{ version, dk, salt,
nonce }` for v4 schema compatibility. On load, the browser clears the
entry when the cached salt differs from the current `data-salt`. It does
not clear solely because the cached nonce differs; decryption always uses
the current page's `data-nonce` and ciphertext. If AES-GCM authentication
fails, the cache is cleared and the password form remains visible.

The Playwright e2e suite (`tests/e2e/decryption.spec.js`) guards this
clean-rebuild path directly: with `stableSalt` + `autoSave` on, it seeds
the cache, simulates a rebuild (same salt, fresh nonce + ciphertext via the
server crypto) over the reload, and asserts the cached key still
auto-decrypts (`mode="cached"`); a companion test asserts the salt-change
self-heal re-prompts.

## Code conventions

- **Node CommonJS** (`require` / `module.exports`) on the server side; no
  transpilation. Browser sources also use CommonJS; esbuild emits an IIFE.
- **ESLint** config at `.eslintrc.js`; **EditorConfig** at `.editorconfig`
  — match existing style.
- **Backward-compatible config.** New options must default safely.
  Existing encrypted posts in the wild must still decrypt with the same
  password against the new bundle, OR the wire-format byte must bump.
- **Both READMEs in lockstep.** `ReadMe.md` and `ReadMe.zh.md` carry the
  same headings in the same order — the docs test guards this for the
  "Why upgrade" section.
- **Tarball whitelist.** `package.json`'s `files` field limits the npm
  tarball to `index.js` + `src/server/` + `lib/`, plus package metadata,
  README and license files. Server sources are required at runtime. Do not ship
  `src/browser/`, `build/`, `tests/`, `demo/`, or `.github/`.

## See also

- [`docs/THEMES.md`](THEMES.md) — the one-file theme drop contract.
- [`docs/RELEASING.md`](RELEASING.md) — release procedure.
- [`docs/DEVELOPMENT.md`](DEVELOPMENT.md) — workflow rules + commands.
