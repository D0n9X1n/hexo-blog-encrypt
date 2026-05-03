# Themes

A **theme** in `hexo-blog-encrypt` is the HTML wrapper that surrounds an
encrypted post. The plugin auto-discovers themes by reading `lib/hbe.<name>.html`
at filter time, so adding a 9th (or 99th) theme is **a single-file drop** — no
edits to `index.js` or any browser-side source required.

This contract is enforced by `tests/docs.test.js` and described in detail in
[`docs/specs/2026-05-01-e2e-test-harness-design.md`](specs/2026-05-01-e2e-test-harness-design.md).

The 8 themes that ship today are: `default`, `blink`, `flip`, `shrink`,
`surge`, `up`, `wave`, `xray`.

## Adding a theme

1. Create `lib/hbe.<name>.html` containing:
   - All 10 `{{hbe...}}` placeholders (see below) — the server-side filter
     substitutes them at render time.
   - A wrapper element with `id="hexo-blog-encrypt"` (the browser bundle finds
     it by id) carrying the seven `data-*` attributes listed below.
   - A form `<form id="hbeForm">` containing:
     - A password input `<input id="hbePass" type="password">`.
     - A submit button with class `hbe-button`.
     - An empty alert region: `<div role="alert" aria-live="polite">…</div>`.
     - **No `onsubmit` JS** — the bundle attaches a `submit` listener that
       prevents default; an inline `onsubmit="return false"` is harmless but
       unnecessary.
   - A `<script id="hbeData" type="hbeData">{{hbeEncryptedData}}</script>`
     element whose body is the AES-256-GCM ciphertext (with the 16-byte auth
     tag appended) as hex.
2. Run `npm run test`. The auto-discovery + e2e harness picks up the new file
   and runs the encrypt/decrypt round-trip against it (per-theme matrix in
   `tests/e2e/decryption.spec.js` + `tests/e2e/theme-contract.spec.js`).
3. Reference it from a post’s front-matter as `theme: <name>` and you’re done.

There is **no registry** to update, no enum to extend, no build step. The
filename is the source of truth.

## Required placeholders

Every `lib/hbe.<name>.html` MUST contain these 10 placeholders verbatim. They
are string-substituted by `src/server/template.js` for each encrypted post:

| Placeholder                | Field          | Render mode       | Meaning                                                                        |
| -------------------------- | -------------- | ----------------- | ------------------------------------------------------------------------------ |
| `{{hbeFormat}}`            | `format`       | attr-escaped      | Wire-format version. Always `"4"` under v4. Used by the bundle to fail-fast on stale decryptors. |
| `{{hbeWrongPassMessage}}`  | `wpm`          | attr-escaped      | Inline error text for any decrypt failure (wrong password OR tampered ciphertext — GCM unifies both). |
| `{{hbeWrongHashMessage}}`  | `whm`          | attr-escaped      | Deprecated under v4 (alias of `wpm`). Kept for forward-compat introspection. |
| `{{hbeKdfIterations}}`     | `kdfIterations`| attr-escaped      | PBKDF2 iteration count used to derive the AES key. Default 250000; configurable per-post. |
| `{{hbeAutoSave}}`          | `autoSave`     | attr-escaped      | `"true"` if the derived AES key should be persisted to `localStorage` so a subsequent reload auto-decrypts. Default `"false"`. |
| `{{hbeMessage}}`           | `message`      | text-escaped      | Prompt label shown above the password input.                                   |
| `{{hbeButtonText}}`        | `buttonText`   | text-escaped      | Visible label for the decrypt submit button.                                   |
| `{{hbeSalt}}`              | `salt`         | hex (validated)   | Per-post 32-byte PBKDF2 salt as 64 hex chars.                                  |
| `{{hbeNonce}}`             | `nonce`        | hex (validated)   | Per-post 12-byte AES-GCM nonce as 24 hex chars.                                |
| `{{hbeEncryptedData}}`     | `ciphertext`   | hex (validated)   | AES-256-GCM ciphertext concatenated with its 16-byte auth tag, as hex.         |

The seven `data-*` attributes the browser bundle reads from the
`#hexo-blog-encrypt` wrapper are:

| Attribute              | Source placeholder          | Used for                                            |
| ---------------------- | --------------------------- | --------------------------------------------------- |
| `data-hbe-format`      | `{{hbeFormat}}`             | Wire-format guard (must be `"4"`).                  |
| `data-wpm`             | `{{hbeWrongPassMessage}}`   | Inline alert text on any decrypt failure.           |
| `data-whm`             | `{{hbeWrongHashMessage}}`   | Reserved (alias of `wpm` under v4).                 |
| `data-salt`            | `{{hbeSalt}}`               | PBKDF2 salt for key derivation.                     |
| `data-nonce`           | `{{hbeNonce}}`              | AES-GCM nonce.                                      |
| `data-kdf-iterations`  | `{{hbeKdfIterations}}`      | PBKDF2 iteration count.                             |
| `data-auto-save`       | `{{hbeAutoSave}}`           | Whether the derived key is persisted to `localStorage`. |

## Forbidden

To keep the one-file-drop contract intact:

- **Don’t** introduce new `data-*` attributes without updating BOTH the
  server filter (`src/server/template.js`'s `PLACEHOLDERS` table + the v4
  config flow in `src/server/config.js`) AND the browser bundle
  (`src/browser/main.js`'s `readWireFormat`). These two halves share an
  implicit wire format and the version is bumped via `{{hbeFormat}}`.
- **Don’t** rename or remove any of the 10 placeholders. Existing themes —
  and every encrypted post in the wild — depend on them.
- **Don’t** move or rename the `#hexo-blog-encrypt` wrapper, the `#hbeForm`
  form, the `#hbePass` input, the `.hbe-button` submit button, or the
  `[role="alert"]` region. The bundle selects them by id / class / role.
- **Don’t** ship a theme without running `npm run test`. The harness guards
  the contract; CI will reject regressions.

## See also

- Spec: [`docs/specs/2026-05-01-e2e-test-harness-design.md`](specs/2026-05-01-e2e-test-harness-design.md)
- Server-side filter: `src/server/index.js` (composition root) + `src/server/template.js` (placeholder table)
- Browser bundle source: `src/browser/` — built via `npm run build` (esbuild) into `lib/hbe.bundle.js`. The served filename is content-hashed at deploy time as `lib/hbe.<hex10>.js` so cache busts are automatic across releases.
- Existing themes: `lib/hbe.*.html`
