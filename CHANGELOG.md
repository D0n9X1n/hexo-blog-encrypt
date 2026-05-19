# Changelog

All notable changes to **hexo-blog-encrypt** are documented here. The format
is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [4.0.1] — 2026-05-19

### Fixed

* **Decrypt button layout** — on wide screens the button could land on the
  same row as the password input and lose centering. The shared decrypt
  form now uses a flex column layout so the button always renders centered,
  on its own line, below the input. Long / non-ASCII labels wrap correctly.
* **`decryptButton.show: false`** — previously only the label was blanked
  while the button chrome remained clickable. The button is now actually
  removed from layout via a new `hbe-button-hidden` class, while Enter-key
  form submission still works.

### Template contract

* Added `{{hbeButtonClass}}` placeholder (10 → 11). All 8 shipped themes
  and the docs were updated together. Custom themes following
  [`docs/THEMES.md`](docs/THEMES.md) should add the placeholder to their
  button element:

  ```html
  <button class="hbe hbe-button{{hbeButtonClass}}" type="submit">{{hbeButtonText}}</button>
  ```

  No wire-format change — existing encrypted posts continue to decrypt.

### Tests

* Server-side unit test for the new hidden-button class.
* Playwright e2e for non-ASCII button text + geometric centering check.
* Playwright e2e for `decryptButton.show: false` + Enter-key fallback.

Closes #231. PR #232.

---

## [4.0.0] — 2026-05-03

### Highlights

* **AES-256-GCM** replaces AES-CBC + HMAC-SHA-256 — one round-trip
  encrypt-and-authenticate, no more ciphertext-then-MAC composition. GCM's
  authentication tag fails closed: a wrong password and a tampered
  ciphertext are now indistinguishable to the user (see _Breaking
  changes_).
* **Per-post salt + per-encryption nonce.** Two posts with the same
  password produce different ciphertexts; rebuilding the same post
  produces a fresh nonce every time. Previously, all posts shared the
  same salt by default and produced byte-identical ciphertext.
* **Optional decrypt button.** Themes now expose a click-to-decrypt
  button alongside the password field. Default: visible (`decryptButton:
  { show: true, text: 'Decrypt' }`).
* **Opt-in autosave.** Successfully-decrypted plaintext is cached in
  `localStorage` only when the post (or `_config.yml.encrypt`) sets
  `autoSave: true`. Default: OFF. Cache keys are namespaced under
  `hbe.v4.<post-permalink-hash>`; v3 cache leftovers are purged on read.
* **Modular architecture.** `src/server/{config,crypto,generator,index,
  logger,template}.js` (server) and `src/browser/{main,crypto,storage,
  ui,dom}.js` (browser, esbuild-bundled to `lib/hbe.bundle.js`) replace
  the previous `index.js` + monolithic `lib/hbe.js`.
* **Real-Hexo + real-browser e2e suite.** Per-theme matrix (right
  password / wrong password / reload re-prompts) plus tag-encryption
  guard, autosave-cached reload, decrypt-button click, legacy event
  listener, stale-format and tampered-ciphertext failure modes. Runs on
  every push via GitHub Actions.

### Breaking changes

* **Wire-format break.** Posts encrypted by hexo-blog-encrypt v3 cannot
  be decrypted by v4 (and vice versa). v4 wrappers carry
  `data-hbe-format="4"`; the bundle aborts with a friendly upgrade
  message on a format mismatch. **Action required:** rebuild the entire
  site with `hexo clean && hexo generate` after upgrading. No data is
  lost — the source `.md` files are unchanged.
* **`wrong_hash_message` is deprecated.** GCM unifies wrong-password and
  tampered-ciphertext into a single failure path; the option is now an
  alias of `wrong_pass_message` and emits a build-time warning when set.
  Will be removed in v5. **Action required:** delete
  `wrong_hash_message` from `_config.yml` and front-matter; set only
  `wrong_pass_message`.
* **Cipher and KDF changes.** AES-256-GCM (was AES-256-CBC + HMAC).
  PBKDF2 iteration default raised to 250 000 (was hard-coded). KDF
  iterations are now configurable via `kdf.iterations` with a 100 000
  floor and a build-time warning below the OWASP-2023 recommended
  600 000. **Action required:** none. Defaults are safe; tune via
  `_config.yml.encrypt.kdf.iterations`.
* **Generated bundle filename includes a content hash.** `lib/hbe.js`
  is no longer generated; the runtime is emitted as
  `lib/hbe.<10-hex>.js` and referenced by the wrapper template
  automatically. **Action required:** themes that hard-coded
  `lib/hbe.js` in a `<script src="…">` must remove that tag — the
  wrapper now handles it itself. Custom themes that copy the default
  templates need no changes.
* **localStorage namespace change.** Cache keys moved from
  `hexo-blog-encrypt:#…` (v3) to `hbe.v4.…` (v4). v3 entries are purged
  on first read; users who manually scripted around the old keys must
  update their references.
* **`hexo-blog-decrypt` event payload.** The legacy event continues to
  fire on `window` for back-compat. v4 _additionally_ exposes
  `event.detail.mode` (`'manual'` for click-to-decrypt or first
  password entry; `'cached'` when autosave restores plaintext on
  reload). Listeners that ignore `event.detail` continue to work
  unchanged. **Action required:** none unless you want the new mode
  signal.

### New configuration

```yaml
encrypt:
  decryptButton:
    show: true              # default true
    text: 'Decrypt'         # default 'Decrypt'
  autoSave: false           # default false (opt-in per post or globally)
  kdf:
    iterations: 250000      # default 250000; floor 100000; OWASP-recommended ≥ 600000
```

### Browser support

The runtime uses Web Crypto (`crypto.subtle`) which requires a **secure
context** (HTTPS, or `http://localhost`). Verified on:

| Browser | Minimum version | Notes |
| --- | --- | --- |
| Chromium / Edge | 92+ | Tested in CI via Playwright |
| Firefox | 90+ | |
| Safari (macOS / iOS) | 14+ | Manual smoke at release time |

If your site is served over plain `http://` from a non-localhost host,
decryption silently fails (`crypto.subtle` is `undefined`). Use HTTPS
in production.

### Determinism / caching note

Encrypted output now changes byte-for-byte on every build by design
(fresh nonce per encryption). If you serve through a CDN, this means
every rebuild invalidates the post HTML — purge or rely on the
content-hashed `lib/hbe.<hash>.js` URL for the runtime asset. The
runtime asset hash only changes when the bundle changes, so CDN
caching of the bundle remains effective.

### Internals

* `src/server/config.js` — schema validation, deep-merge of
  `defaults → _config.yml.encrypt → front-matter`, OWASP iteration
  warnings, `wrong_hash_message` deprecation handling.
* `src/server/crypto.js` — PBKDF2-SHA256 → AES-256-GCM; per-call random
  salt + nonce.
* `src/server/template.js` — context-aware HTML escape (text vs.
  attribute), placeholder allowlist, theme fallback with warning.
* `src/server/generator.js` — content-hashed `lib/hbe.<hash>.js[.map]`
  emission, mtime+size memoization shared with the filter so both agree
  on the same hash within one generation cycle.
* `src/server/logger.js` — uniform `info`/`warn`/`debug` adapter over
  Hexo's logger; `silent: true` suppresses info but never warn.
* `src/server/index.js` — composition root; registers the
  `after_post_render` filter and the asset generator.
* `src/browser/{main,crypto,storage,ui,dom}.js` — modular browser
  runtime; bundled and minified by esbuild (`build/build.js`).
* `build/prepare.js` — npm `prepare` lifecycle hook that auto-builds
  the bundle on git/source installs (no-op on tarball installs since
  `build/` is excluded from `package.json#files`).

### Tests

* Server suite at 100 % statements / branches / functions / lines.
* Playwright e2e suite covers every shipped theme (per-theme:
  right-password, wrong-password, autosave-default reload) plus
  global UX / regression specs (decrypt button, autosave reload,
  legacy event listener, stale format, tampered ciphertext, tag-only
  encryption, decryption-callback hook firing inline `<script>`).
* CI matrix: lint + server + 4 e2e shards on every push.

### Documentation

* Both READMEs gained a "Why upgrade from v3" section above the
  procedural upgrade steps (security + UX rationale: AES-256-GCM,
  per-post salt, KDF iteration jump, autoSave default flip, inline
  errors, click-to-decrypt button, smaller bundle, regression-tested
  on every push).
* Badges trimmed and refreshed: dropped two stale Scrutinizer badges
  (pointing at the unmaintained `MikeCoder/hexo-blog-encrypt` legacy
  fork); added npm version, npm monthly downloads, license MIT;
  release + npm-version badges forced to green to match the rest.
* New comprehensive [GitHub Wiki](https://github.com/D0n9X1n/hexo-blog-encrypt/wiki):
  12 pages (Getting Started, Configuration Reference, Themes,
  Callbacks & MathJax, Tag-Based Encryption, Migration v3 → v4,
  Security Model, Browser Support, FAQ, Troubleshooting + Home + Sidebar).
* New live demos: `/demo/callback/` (decryption hook fires
  `window.alert(...)` from inline script in the encrypted body),
  `/demo/mathjax/` (MathJax 3 loaded from CDN inside the encrypted
  body, auto-typesets on decrypt). Both have e2e regression coverage.

---

## [3.x.x] — historical

See git history for releases prior to v4. The 3.x series used AES-CBC
with HMAC-SHA-256, a fixed salt by default, and a monolithic
`lib/hbe.js` runtime.
