# E2E Test Harness for hexo-blog-encrypt

**Track:** Complex · **Status:** Approved (user override: skip human; AI cross-audit pair) · **Branch:** `test/e2e-framework`

## Purpose

Establish a real-Hexo + real-browser E2E harness that catches every realistic regression in this plugin (cipher-parameter drift, theme breakage, generator-path drift, front-matter precedence bugs), gates every PR through GitHub Actions, and lets contributors add a 9th theme by dropping one file.

## Scope (this PR)

- Minimal Hexo fixture site at `tests/fixtures/hexo-site/`
- Server-side filter & generator tests via `node --test` against real `new Hexo(fixtureDir)` boot — **no `global.hexo` stubs**
- Playwright E2E (Chromium) over **all 8 themes × 3 paths** (right pw, wrong pw, cache reload) = 24 specs
- GitHub Actions workflow: lint + server tests + E2E + c8 coverage report (no gating)
- PR template additions, CODEOWNERS, CONTRIBUTING recipe for branch protection
- `docs/THEMES.md` — theme contributor contract

## Architecture

Two-layer pyramid (no mock-Hexo unit tests, by user rule):

| Layer | Runner | Boot strategy |
|---|---|---|
| Server-side wiring | `node --test` | `new Hexo(fixtureDir, opts)` → `init()` → `load()` → assert on rendered post objects |
| Browser E2E | `@playwright/test` | `npx hexo generate` → tiny `http.createServer` on ephemeral port → Playwright drives Chromium against served URLs |

Module layout:

```
tests/
├── fixtures/hexo-site/   ← _config.yml, package.json (file: plugin dep), templates/encrypted-post.md
├── helpers/              ← buildSite.js, generateSite.js, serveSite.js (stable API; future test-kit surface)
├── server/               ← filter.test.js, generator.test.js, themes.test.js
└── e2e/                  ← playwright.config.js, decryption.spec.js, theme-contract.spec.js
```

## Must-pass criteria (the canonical contract)

**Server tests (real Hexo boot):**

1. Plugin registers a filter on `after_post_render` priority `1000` and a generator named `hexo-blog-encrypt`.
2. Generator emits exactly 2 entries: `lib/hbe.js`, `css/hbe.style.css`, content matching the source files byte-for-byte.
3. Post with no password and no matching tag → unchanged; `data.encrypt` undefined.
4. Post with `password: ""` → encryption skipped even when matching tag exists.
5. Post with `password: "hello"` (front-matter) → `data.encrypt === true`; `data.origin` preserved; `data.excerpt === data.more === abstract`; rendered HTML contains all 7 substitutions (5 `data-*` attrs `data-wpm`/`data-whm`/`data-hmacdigest`/`data-keysalt`/`data-ivsalt`, plus inline message + ciphertext body) and zero `{{hbe` substrings.
6. Tag-config password resolves on `data.tags[i].name === config.encrypt.tags[j].name` match.
7. Front-matter password takes precedence over tag-config password.
8. Each of 8 themes loads via `theme:` front-matter without throwing; no leftover placeholders.
9. `silent: true` suppresses `log.info` calls but not `log.warn`.

**Browser E2E (real Chromium against generated `public/`):**

For each `lib/hbe.<theme>.html` × {right pw, wrong pw, cache reload}:

10. Page loads with no console errors before password entry; `<div id="hexo-blog-encrypt">` and `<input id="hbePass">` present; original plaintext absent from initial DOM.
11. Right password (`hello`) + Enter → decrypted plaintext appears; `hexo-blog-decrypt` event fires; "Encrypt again" button present; localStorage key `hexo-blog-encrypt:#<path>` populated.
12. Wrong password + Enter → `alert` fires with `wrong_pass_message`; original plaintext still absent from DOM; localStorage key absent.
13. Reload after step 11 → page decrypts automatically from cache; no password prompt needed; `hexo-blog-decrypt` event fires again.
14. **Artifact identity preflight** (runs in `globalSetup` before any spec): `<repo>/lib/hbe.js` byte-equals `<fixture>/public/lib/hbe.js`, AND `<repo>/lib/hbe.style.css` byte-equals `<fixture>/public/css/hbe.style.css`. Fail-fast if not — closes the server↔browser drift loophole.

## Test strategy

- **Server layer** boots an isolated `Hexo` per `describe` (pattern from `hexo-renderer-marked` tests), registers this plugin, runs the filter, asserts on the post object.
- **Plugin identity**: fixture `package.json` uses `"hexo-blog-encrypt": "file:../../.."` (npm 7+ symlink). Criterion 14 byte-compares served `lib/hbe.js` to repo's before any spec runs.
- **One-file theme drop**: `globalSetup` reads `templates/encrypted-post.md`, globs `lib/hbe.*.html`, writes `source/_posts/encrypted-<theme>.md` per theme. **Adding a 9th theme = drop `lib/hbe.<name>.html` only**; post + spec materialize automatically.
- **E2E layer**: Playwright `globalSetup` runs `hexo clean && hexo generate`, asserts artifact identity, serves on a random port. Specs parameterize over discovered themes; CI shards 4-way.
- **Browser-event timing**: helpers register `page.on('console')`, `page.on('dialog')`, and the `hexo-blog-decrypt` listener BEFORE password submission, else events fire before listeners attach.
- **Determinism**: random salts → ciphertext differs per run; tests assert decryption, never bytes. Separate "salts differ" test spawns 2 fresh `hexo generate` and diffs `data-keysalt`.
- **Helpers** ship with stable JSDoc-typed exports — future `@hexo-blog-encrypt/test-kit` surface.

## Acceptance command

```sh
npm run test
```
Equivalent to `npm run lint && npm run test:server && npm run test:e2e`. Exit 0 = green.

## Files added

| Path | Purpose |
|---|---|
| `tests/fixtures/hexo-site/**` | Minimal Hexo site, `file:` plugin dep, `templates/encrypted-post.md` (per-theme posts auto-materialized) |
| `tests/helpers/{buildSite,generateSite,serveSite}.js` | Stable test-kit API |
| `tests/server/{filter,generator,themes}.test.js` | Server layer (criteria 1–9) |
| `tests/e2e/{playwright.config.js,decryption.spec.js,theme-contract.spec.js}` | Browser layer (criteria 10–14) |
| `.github/workflows/test.yml` | CI: lint + server + e2e + coverage |
| `.github/CODEOWNERS`, `PULL_REQUEST_TEMPLATE.md` update, `CONTRIBUTING.md` recipe | Review + branch-protection workflow |
| `docs/THEMES.md` | Theme contributor contract |
| `package.json` | devDeps (`hexo`, `hexo-renderer-marked`, `@playwright/test`, `c8`); scripts |

`index.js` and `lib/*` are **not modified** — they are the system under test.

## Non-goals (deferred to follow-up specs, each must demonstrate value to earn its slot)

- `npm run new-theme -- <name>` scaffold script
- Cross-browser matrix (Firefox, WebKit) — Chromium-only on PR; nightly schedule is a follow-up
- Coverage gating threshold (flip after harness stabilizes for ~6 PRs). **c8 measures Node side only** (`index.js`); browser-side `lib/hbe.js` coverage needs Playwright's CDP coverage API and is out of scope here
- Publishing `@hexo-blog-encrypt/test-kit`
- Refactor of the `Object.assign(defaultConfig, …)` mutation bug in `index.js` (file as separate issue)
- README badge updates / dead Scrutinizer link removal

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Hexo `new Hexo()` API drift | Pin `hexo` devDep to one major |
| Playwright flake on CI | `globalSetup` builds once; fresh context per test; retry once + trace |
| Random salts → non-deterministic ciphertext | Tests assert decryption, never bytes |
| Stale fixture install loads wrong `lib/hbe.js` | `file:` dep + criterion 14 byte-identity preflight |
| Branch protection enabled too early | CONTRIBUTING.md staged rollout: workflow → 3 green PRs → required check → protection |
| `hexo generate` slow on CI | Built once per shard, shared by all specs |
