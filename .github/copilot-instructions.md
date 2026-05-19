# Copilot Instructions — hexo-blog-encrypt

This file is intentionally **thin**. Project details live in
[`docs/`](../docs/) — that is the source of truth for everything below.
This file only orients agents and lists the non-negotiables that must
be enforced even if you never get around to reading the docs.

## Read at session start

In this order:

1. [`docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md) — what this project
   is, key files, server / browser modules, wire-format overview.
2. [`docs/DEVELOPMENT.md`](../docs/DEVELOPMENT.md) — setup, test
   commands, workflow basics.
3. [`docs/THEMES.md`](../docs/THEMES.md) — the one-file theme drop
   contract (read only if you're touching themes).
4. [`docs/RELEASING.md`](../docs/RELEASING.md) — release procedure
   (read only if you're cutting a release or touching the publish
   workflows).

## Non-negotiables

These are the rules that never bend, regardless of scope or
"just a quick fix" framing:

- **No production code without a failing test first.** No completion
  claims without fresh verification. No fixes without root-cause
  investigation.
- **Backward compatibility.** New config options must default safely.
  Existing encrypted posts in the wild must still decrypt against the
  new bundle, OR the wire-format byte (`data-hbe-format`) must bump in
  lockstep with the bundle.
- **Update both READMEs.** `ReadMe.md` and `ReadMe.zh.md` carry the
  same headings in the same order — the docs test (`tests/docs.test.js`)
  guards this for the "Why upgrade" section. Apply user-facing docs
  changes to BOTH.
- **Don't ship dev-only paths in the npm tarball.** `package.json`'s
  `files` whitelist limits the tarball to `index.js` + `lib/`. Don't
  add `tests/`, `demo/`, `.github/`, or `src/` — the bundle in `lib/`
  is what ships, not the sources.
- **Run `npm test` before pushing** anything that touches `src/`,
  `lib/`, or `tests/`. CI will reject regressions; locally is faster.
