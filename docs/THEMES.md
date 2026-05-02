# Themes

A **theme** in `hexo-blog-encrypt` is the HTML wrapper that surrounds an
encrypted post. The plugin auto-discovers themes by reading `lib/hbe.<name>.html`
at filter time, so adding a 9th (or 99th) theme is **a single-file drop** — no
edits to `index.js` or `lib/hbe.js` required.

This contract is enforced by `tests/docs.test.js` and described in detail in
[`docs/specs/2026-05-01-e2e-test-harness-design.md`](specs/2026-05-01-e2e-test-harness-design.md).

The 8 themes that ship today are: `default`, `default-dark`, `default-cn`,
`default-purple`, `surmount`, `xray`, `wave`, `mistyrose`.

## Adding a theme

1. Create `lib/hbe.<name>.html` containing:
   - All 7 `{{hbe...}}` placeholders (see below) — `index.js` substitutes them
     at render time.
   - A wrapper element `<div id="hexo-blog-encrypt" data-wpm="…" data-whm="…">`
     so the browser-side `lib/hbe.js` can find it.
   - A password input `<input id="hbePass" type="password">` inside that
     wrapper.
   - A `<script id="hbeData" type="text/template" data-hmacdigest="…"
     data-keysalt="…" data-ivsalt="…">` element whose body is the
     ciphertext. The 5 `data-*` attrs are how the decryptor recovers the
     per-post salts and verifies the HMAC.
2. Run `npm run test`. The auto-discovery + E2E harness picks up the new file
   and runs the encrypt/decrypt round-trip against it.
3. Reference it from a post’s front-matter as `theme: <name>` and you’re done.

There is **no registry** to update, no enum to extend, no build step. The
filename is the source of truth.

## Required placeholders

Every `lib/hbe.<name>.html` MUST contain these 7 placeholders verbatim. They
are string-substituted by `index.js` (`lib/hbe.*.html` → final HTML) for each
encrypted post:

- `{{hbeEncryptedData}}` — the AES-256-CBC ciphertext as hex.
- `{{hbeHmacDigest}}` — the HMAC-SHA256 of the plaintext (with the
  `<hbe-prefix>` sentinel) as hex.
- `{{hbeWrongPassMessage}}` — alert text shown when decryption produces
  invalid plaintext (sentinel mismatch).
- `{{hbeWrongHashMessage}}` — alert text shown when HMAC verification fails.
- `{{hbeMessage}}` — the prompt text shown above the password input.
- `{{hbeKeySalt}}` — PBKDF2 salt (1024 iterations, 32-byte key) as hex;
  written into the `data-keysalt` attribute.
- `{{hbeIvSalt}}` — PBKDF2 salt (512 iterations, 16-byte IV) as hex; written
  into the `data-ivsalt` attribute.

The 5 `data-*` attributes the browser-side decryptor reads are:

| Attribute        | Element                       | Source placeholder      |
| ---------------- | ----------------------------- | ----------------------- |
| `data-wpm`       | `#hexo-blog-encrypt` wrapper  | `{{hbeWrongPassMessage}}` |
| `data-whm`       | `#hexo-blog-encrypt` wrapper  | `{{hbeWrongHashMessage}}` |
| `data-hmacdigest`| `<script id="hbeData">`       | `{{hbeHmacDigest}}`     |
| `data-keysalt`   | `<script id="hbeData">`       | `{{hbeKeySalt}}`        |
| `data-ivsalt`    | `<script id="hbeData">`       | `{{hbeIvSalt}}`         |

## Forbidden

To keep the one-file-drop contract intact:

- **Don’t** introduce new `data-*` attributes without updating BOTH `index.js`
  (the server-side filter) AND `lib/hbe.js` (the browser-side decryptor).
  These two halves share an implicit wire format.
- **Don’t** rename or remove any of the 7 placeholders. Existing themes — and
  every encrypted post in the wild — depend on them.
- **Don’t** move or rename the `#hexo-blog-encrypt` wrapper or the `#hbePass`
  input. `lib/hbe.js` selects them by ID.
- **Don’t** ship a theme without running `npm run test`. The harness guards
  the contract; CI will reject regressions.

## See also

- Spec: [`docs/specs/2026-05-01-e2e-test-harness-design.md`](specs/2026-05-01-e2e-test-harness-design.md)
- Server-side filter: `index.js`
- Client-side decryptor: `lib/hbe.js`
- Existing themes: `lib/hbe.*.html`
