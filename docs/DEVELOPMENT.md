# Development

How to work on this project — setup, test commands, and basic workflow rules.

## Setup (after a fresh clone)

```sh
npm install
```

That's it. No submodules, no extra steps.

## Test commands

| Command | What it runs |
| --- | --- |
| `npm test` | Lint + server tests (`tests/server/*.test.js`, `tests/docs.test.js`) + Playwright e2e against all 8 themes. The full suite CI runs. |
| `npm run lint` | ESLint over `src/` + `tests/`. |
| `npm run test:server` | Server-side Node tests only. Fast (no browser). |
| `npm run test:e2e` | Playwright e2e only. Spins up a real Hexo build of `tests/fixtures/hexo-site/`, serves it, drives Chromium. |
| `npm run build` | Rebuild the browser bundle (`lib/hbe.bundle.js`) via esbuild. Runs as `prepack` automatically before `npm publish`. |

Run `npm test` BEFORE you push anything that touches `src/`, `lib/`, or
`tests/`. CI will reject regressions; running locally first catches
them in seconds.

## Workflow basics

- **No production code without a failing test first.** Add the test,
  watch it fail, then make it pass.
- **Root-cause fixes.** Don't paper over symptoms; understand why
  something broke before patching.
- **Verify before claiming done.** Re-run the relevant tests after
  every change.
- **Backward compatibility.** New config options must default safely.
  Existing encrypted posts in the wild must still decrypt against the
  new bundle, OR the wire-format byte (`data-hbe-format`) must bump in
  lockstep with the bundle.

## Branch protection

`master` requires the `Tests` status check to pass. The staged rollout
process for adding new required checks is documented in
[`.github/CONTRIBUTING.md`](../.github/CONTRIBUTING.md).

CODEOWNERS (`.github/CODEOWNERS`) makes `@D0n9X1n` the default reviewer
on every PR.

## Adding a theme

See [`docs/THEMES.md`](THEMES.md). It's a one-file drop — no edits to
`src/server/` or `src/browser/` needed.

## Cutting a release

See [`docs/RELEASING.md`](RELEASING.md). Pre-flight checklist + tag
flow + GH Packages mirror + troubleshooting all in one place.

## See also

- [`docs/ARCHITECTURE.md`](ARCHITECTURE.md) — codebase orientation.
- [`docs/RELEASING.md`](RELEASING.md) — release procedure.
- [`docs/THEMES.md`](THEMES.md) — theme contract.
- [`.github/CONTRIBUTING.md`](../.github/CONTRIBUTING.md) — contributor
  guidelines + branch-protection rollout.
