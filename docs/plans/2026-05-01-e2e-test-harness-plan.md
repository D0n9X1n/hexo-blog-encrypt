# Implementation Plan — E2E Test Harness for hexo-blog-encrypt

**Spec:** `docs/specs/2026-05-01-e2e-test-harness-design.md`
**Branch:** `test/e2e-framework`
**Architect:** claude-opus-4.7-xhigh
**Plan cap:** ≤500 lines (this file)

> The system under test (`index.js`, `lib/*`) is **not modified** by any task.
> All tasks add files under `tests/`, `.github/`, `docs/`, or extend root `package.json`.

---

## Task summary table

| ID | Title                                                | Files owned                                                                                                       | Preconditions | Wave | Parallel-safe | Spec criteria  |
| -- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------- | ---- | ------------- | -------------- |
| T1 | Hexo fixture site scaffold                           | `tests/fixtures/hexo-site/**`, `tests/.gitignore`                                                                  | —             | 1    | yes           | (enables 1–14) |
| T2 | Test-kit helpers (build/generate/serve)              | `tests/helpers/{buildSite,generateSite,serveSite}.js`                                                              | T1, T3        | 2    | no (solo)     | (enables 1–14) |
| T3 | Root `package.json` devDeps + scripts                | `package.json` (no other file)                                                                                    | —             | 1    | yes           | (enables 1–14) |
| T4 | Server filter tests (front-matter, tags, silent)     | `tests/server/filter.test.js`                                                                                      | T1, T2, T3    | 3    | yes           | 3, 4, 5, 6, 7, 9 |
| T5 | Server generator + themes tests                      | `tests/server/generator.test.js`, `tests/server/themes.test.js`                                                    | T1, T2, T3    | 3    | yes           | 1, 2, 8        |
| T6 | Playwright E2E suite (8 themes × 3 paths + identity) | `tests/e2e/playwright.config.js`, `tests/e2e/global-setup.js`, `tests/e2e/decryption.spec.js`, `tests/e2e/theme-contract.spec.js` | T1, T2, T3    | 3    | yes           | 10, 11, 12, 13, 14 |
| T7 | CI workflow (lint + server + e2e + coverage)         | `.github/workflows/test.yml`                                                                                       | T3, T4, T5, T6, T8 | 4 | no (solo)    | (gates all)    |
| T8 | Contributor docs + docs-contract test                | `docs/THEMES.md`, `CONTRIBUTING.md` (append section), `.github/CODEOWNERS`, `.github/PULL_REQUEST_TEMPLATE.md` (append section), `tests/docs.test.js` | T3 | 3 | yes           | (theme-drop contract) |

**Total tasks:** 8 (cap respected). **Total criteria coverage:** 1–14 mapped across T4/T5/T6.

---

## Dispatch order

- **Wave 1 (parallel, 2 dispatches):** T1, T3 — pure scaffolding, no shared files (T1 writes only under `tests/fixtures/`; T3 writes only root `package.json`).
- **Wave 2 (sequential, 1 dispatch):** T2 — helpers depend on the fixture path layout (T1) and on `hexo` being installed (T3).
- **Wave 3 (parallel, 4 dispatches):** T4, T5, T6, T8 — disjoint file ownership (`tests/server/filter.test.js` vs `tests/server/generator|themes.test.js` vs `tests/e2e/**` vs `docs/` + `tests/docs.test.js`); all read T1+T2+T3 outputs, none mutate them.
- **Wave 4 (sequential, 1 dispatch):** T7 — CI workflow assembly + green-run verification requires all test files in place.

**Total dispatches:** 4 waves, 8 task-slots, max parallelism = 4 in wave 3.

---

## Per-task detail

### T1 — Hexo fixture site scaffold

- **Spec criteria addressed:** none directly; enables 1–14 by providing the boot target.
- **Files owned:**
  - `tests/fixtures/hexo-site/_config.yml`
  - `tests/fixtures/hexo-site/package.json`
  - `tests/fixtures/hexo-site/templates/encrypted-post.md`
  - `tests/fixtures/hexo-site/source/_posts/.gitkeep`
  - `tests/fixtures/hexo-site/.gitignore` (ignores `node_modules/`, `db.json`, `public/`)
  - `tests/.gitignore` (ignores `fixtures/hexo-site/node_modules/`, `fixtures/hexo-site/public/`, `fixtures/hexo-site/db.json` — defence-in-depth)
- **Preconditions:** none.
- **RED:** `node -e "require('fs').statSync('tests/fixtures/hexo-site/_config.yml')"` → `ENOENT` (fixture absent).
- **GREEN steps:**
  1. Create `tests/fixtures/hexo-site/_config.yml`: minimal Hexo 7 config — `title`, `url: http://localhost`, `permalink: :title/`, `theme:` unset (use `landscape` is heavy → set `theme: ""` and add a stub layout under `themes/` OR rely on default-rendered post HTML; verify via spike during implementation).
  2. Create `tests/fixtures/hexo-site/package.json` with `"hexo-blog-encrypt": "file:../../.."`, `"hexo": "^7"`, `"hexo-renderer-marked": "^7"`. No `scripts` other than `"hexo": "hexo"`.
  3. Create `tests/fixtures/hexo-site/templates/encrypted-post.md` — single canonical post body containing: title `Encrypted Post (__THEME__)`, front-matter placeholders `password: hello`, `theme: __THEME__`, body markdown including a code fence, an image `![](https://example.com/x.png)`, an inline `<script>window.__seenScript = true;</script>` (to validate browser script re-execution in T6), and a deterministic plaintext sentence `THE SECRET IS BUTTERFLY` used by all later assertions.
  4. Source `_posts/.gitkeep` ensures the directory exists; per-theme post files are NOT committed — they are materialized by helpers (T2) at test-time.
  5. Local `.gitignore` keeps `node_modules/`, `db.json`, `public/`, `.deploy_git/` out of git.
- **VERIFY:**
  - `test -f tests/fixtures/hexo-site/_config.yml && test -f tests/fixtures/hexo-site/package.json && test -f tests/fixtures/hexo-site/templates/encrypted-post.md && echo OK` → `OK`.
  - `node -e "console.log(require('./tests/fixtures/hexo-site/package.json').dependencies['hexo-blog-encrypt'])"` → `file:../../..`.
  - `git check-ignore tests/fixtures/hexo-site/node_modules` → exits 0.
- **Done criteria:** all three checks above pass; eslint not applicable (no `.js` added under fixture); files committed.

---

### T2 — Test-kit helpers

- **Spec criteria addressed:** none directly; encapsulates boot for T4/T5/T6.
- **Files owned:**
  - `tests/helpers/buildSite.js` — `async function buildSite({ cwd } = { cwd: <fixture> }): Promise<Hexo>` — returns an initialized + loaded `Hexo` instance with this plugin registered. Materializes per-theme posts (one per `lib/hbe.*.html` discovered) into `source/_posts/encrypted-<theme>.md` from the template, idempotently.
  - `tests/helpers/generateSite.js` — `async function generateSite({ cwd } = ...): Promise<{publicDir: string}>` — runs `hexo clean && hexo generate` via the fixture's local `hexo` binary (`require.resolve('hexo/bin/hexo', { paths: [fixtureDir] })`), returns absolute path to `public/`.
  - `tests/helpers/serveSite.js` — `async function serveSite({ root }): Promise<{url: string, close(): Promise<void>}>` — wraps `http.createServer` from Node core, binds to `127.0.0.1:0` (ephemeral), serves static files from `root`, returns `{ url: 'http://127.0.0.1:<port>', close }`. The returned `close` is an async function that resolves when the server is fully closed; the handle is **never** intended to be serialized — callers (e.g. T6's `globalSetup`) must keep the handle in their own closure.
  - JSDoc `@typedef` blocks at top of each file declaring the public surface (future test-kit API).
- **Preconditions:** T1 (fixture path), T3 (`hexo` installed via fixture's `npm install`, helpers `require()` it).
- **RED:** `node --test tests/helpers/_smoke.test.js` (one-off smoke probe written and deleted within this task) → `Cannot find module './buildSite'`. Acceptable equivalent: `node -e "require('./tests/helpers/buildSite')"` → `MODULE_NOT_FOUND`.
- **GREEN steps:**
  1. Implement `buildSite.js`: `glob lib/hbe.*.html` from repo root, derive theme list, write `source/_posts/encrypted-<theme>.md` files from `templates/encrypted-post.md` with `__THEME__` substituted. Then `const Hexo = require(require.resolve('hexo', { paths: [fixtureDir] }));` `const hexo = new Hexo(fixtureDir, { silent: true }); await hexo.init(); await hexo.load();` Return `hexo`.
  2. Implement `generateSite.js`: shell out via `node:child_process`'s `execFile` to the fixture's `hexo generate` (cwd = fixture). Surface stderr on non-zero exit. Return `{ publicDir: path.join(fixtureDir, 'public') }`.
  3. Implement `serveSite.js`: trivial mime map (`.html`, `.js`, `.css`, `.png`, `.svg`, `.json`); 404 on missing; security: reject `..` in URL paths.
  4. JSDoc each exported function with `@param` + `@returns` so the future `@hexo-blog-encrypt/test-kit` package can inherit.
- **VERIFY:**
  - `node -e "require('./tests/helpers/buildSite'); require('./tests/helpers/generateSite'); require('./tests/helpers/serveSite'); console.log('OK')"` → `OK`.
  - `npm run lint -- tests/helpers/` → exit 0 (must respect existing `.eslintrc.js`; if Node 20 syntax trips ESLint 6, add a minimal `tests/.eslintrc.js` override with `"parserOptions": { "ecmaVersion": 2022 }, "env": { "node": true }` — overrides only, no rule additions).
- **Done criteria:** three helpers exist with JSDoc, `require()` succeeds, eslint clean.

---

### T3 — Root `package.json` devDeps + scripts

- **Spec criteria addressed:** none directly; gates the acceptance command.
- **Files owned:** `package.json` (root, only). No other file.
- **Preconditions:** none.
- **RED:** `npm run test:server 2>&1 | head -1` → `Missing script: "test:server"`.
- **GREEN steps:**
  1. Add `devDependencies`: `"hexo": "^7"`, `"hexo-renderer-marked": "^7"`, `"@playwright/test": "^1.45"`, `"c8": "^10"`. Keep existing `"eslint": "^6.2.2"` untouched.
  2. Replace `scripts.test` with `"test": "npm run lint && npm run test:server && npm run test:e2e"`.
  3. Add scripts:
     - `"test:server": "c8 --reporter=text --reporter=lcov --include=index.js node --test tests/server/ tests/docs.test.js"`
     - `"test:e2e": "cd tests/fixtures/hexo-site && (test -d node_modules || npm install --no-audit --no-fund) && cd ../../.. && playwright install --with-deps chromium && playwright test --config tests/e2e/playwright.config.js"`
     - `"test:docs": "node --test tests/docs.test.js"` (convenience).
  4. Do **not** modify `engines`, `main`, version, or runtime dependencies.
  5. Run `npm install` once locally to produce a working tree (do NOT commit `package-lock.json` — already gitignored per repo convention).
- **VERIFY:**
  - `node -e "const p=require('./package.json'); for (const s of ['test','test:server','test:e2e','test:docs','lint']) if (!p.scripts[s]) throw new Error(s); for (const d of ['hexo','hexo-renderer-marked','@playwright/test','c8','eslint']) if (!p.devDependencies[d]) throw new Error(d); console.log('OK')"` → `OK`.
  - `npm run lint` → exit 0 (baseline preserved).
- **Done criteria:** scripts + devDeps present, `npm install` succeeds, lint still green.

---

### T4 — Server filter tests

- **Spec criteria addressed:** **3, 4, 5, 6, 7, 9**.
- **Files owned:** `tests/server/filter.test.js` (only).
- **Preconditions:** T1, T2, T3.
- **RED:** `node --test tests/server/filter.test.js` → `Cannot find module` (file doesn't exist yet).
- **GREEN steps:** Implement one `describe`-equivalent (`test()` with nested `t.test()`) per criterion, all booting via `await buildSite()`:
  1. **Criterion 3** — Render a post with no `password` and no matching tag; assert `data.encrypt === undefined`, `data.content` byte-equals the originally rendered HTML (compare against an unencrypted control post processed by a fresh Hexo without our filter, OR simpler: assert the rendered content does NOT contain `data-hmacdigest`).
  2. **Criterion 4** — Post with front-matter `password: ""` AND a matching configured tag; assert `data.encrypt === undefined`, no `data-hmacdigest` in `data.content`.
  3. **Criterion 5** — Post with front-matter `password: "hello"`; assert `data.encrypt === true`; `data.origin` truthy and equals pre-filter content (capture via a probe filter at lower priority); `data.excerpt === data.more && data.more === <abstract>`; `data.content` contains all 5 of `data-wpm=`, `data-whm=`, `data-hmacdigest=`, `data-keysalt=`, `data-ivsalt=`; contains the configured `message` text; contains a non-empty `<pre>` ciphertext block; `data.content.indexOf('{{hbe') === -1`.
  4. **Criterion 6** — Post with no front-matter password but `tags: [Secret]`; configure `hexo.config.encrypt.tags = [{ name: 'Secret', password: 'tagpass' }]`; assert `data.encrypt === true` and decryption succeeds (call into a tiny in-test Node-side decrypt helper — duplicate of the algorithm with the salts from `data-keysalt`/`data-ivsalt` — to confirm the password is `tagpass`).
  5. **Criterion 7** — Same post as (6) but front-matter `password: "fmpass"`; assert decryption succeeds with `fmpass` and **fails** with `tagpass`.
  6. **Criterion 9** — Boot two Hexo instances with `silent: true` and `silent: false` respectively, monkey-patch `hexo.log.info` and `hexo.log.warn` to count invocations during a render that triggers both code paths. **The only `log.warn` path in `index.js` is the deprecated-`template`-property warning at line 77** — trigger it by setting `template: 'anything'` in the post's front-matter `encrypt` block (or in `hexo.config.encrypt`), keeping `theme:` set to a valid theme so the encryption path still runs and emits its `log.info` lines. Assert `silent:true` info-count===0 while warn-count>=1; `silent:false` info-count>=1 and warn-count>=1. (Do NOT use `theme: nonexistent` — that throws `ENOENT` from `fs.readFileSync` and never reaches the warn/info paths.)
  7. Use `node:assert/strict` throughout. Each `test()` must `await hexo.exit()` in cleanup.
- **VERIFY:** `node --test tests/server/filter.test.js` → all sub-tests pass; expected output line `# pass 6` (or higher if criteria split into multiple sub-tests).
- **Done criteria:** all six criteria assertions pass; eslint clean on the new file; no `global.hexo` usage anywhere.

---

### T5 — Server generator + themes tests

- **Spec criteria addressed:** **1, 2, 8**.
- **Files owned:**
  - `tests/server/generator.test.js`
  - `tests/server/themes.test.js`
- **Preconditions:** T1, T2, T3.
- **RED:** `node --test tests/server/generator.test.js tests/server/themes.test.js` → `Cannot find module` for both.
- **GREEN steps:**
  1. **`generator.test.js`** — boot via `buildSite()`, then introspect `hexo.extend.filter.list('after_post_render')` and assert one entry with `priority === 1000` belonging to this plugin (identify by `Function.prototype.toString` containing a unique marker substring like `'hbe-prefix'` OR by registering a probe filter at priority 999 that observes ordering — the first approach is cheaper). **Criterion 1 part B:** assert `hexo.extend.generator.get('hexo-blog-encrypt')` is a function; invoke it, assert the returned array has length === 2 with paths exactly `lib/hbe.js` and `css/hbe.style.css`. **Criterion 2:** read both source files (`lib/hbe.js`, `lib/hbe.style.css`) from disk and assert byte-equality with the generator entries' `data` (Buffer or string).
  2. **`themes.test.js`** — for each `theme` in the discovered theme list (glob `lib/hbe.*.html` → strip prefix/suffix), materialize a post `theme: <theme>` via the helper (T2 already does this), boot, render, assert: `data.encrypt === true`; `data.content` contains zero `{{hbe` substrings; `data.content` contains the 5 mandatory `data-*` attributes; `data.content` contains the configured `message`. Use a single parameterized `test()` loop; each iteration has its own assertion subtests. **Criterion 8** is satisfied iff the loop completes for all 8 themes without throw.
  3. Both files must clean up Hexo instances in `after`/`finally` blocks.
- **VERIFY:**
  - `node --test tests/server/generator.test.js` → `# pass` count matches assertions; expected: 2 sub-tests (registration + identity).
  - `node --test tests/server/themes.test.js` → 8 sub-tests pass (one per theme).
  - `npm run test:server` → all of T4 + T5 + docs.test.js pass; c8 emits a coverage table for `index.js`.
- **Done criteria:** all sub-tests pass; eslint clean; if a 9th theme HTML is dropped into `lib/`, themes.test.js automatically picks it up (manual sanity: `touch lib/hbe.zzz.html && node --test tests/server/themes.test.js` shows 9 sub-tests, then `rm lib/hbe.zzz.html`).

---

### T6 — Playwright E2E suite

- **Spec criteria addressed:** **10, 11, 12, 13, 14**.
- **Files owned:**
  - `tests/e2e/playwright.config.js`
  - `tests/e2e/global-setup.js`
  - `tests/e2e/fixtures.js`
  - `tests/e2e/decryption.spec.js`
  - `tests/e2e/theme-contract.spec.js`
- **Preconditions:** T1, T2, T3.
- **RED:**
  - `npx playwright test --config tests/e2e/playwright.config.js` → `Error: Cannot find module 'tests/e2e/playwright.config.js'` (or "no tests found"). Acceptable equivalent: `node -e "require('./tests/e2e/playwright.config')"` → `MODULE_NOT_FOUND`.
- **GREEN steps:**
  1. **`playwright.config.js`** — single project `chromium` (Desktop Chrome). `globalSetup: require.resolve('./global-setup.js')`. **Do NOT set `use.baseURL` from `process.env.E2E_BASE_URL`** — Playwright evaluates the config file BEFORE `globalSetup` runs, so any env var written by globalSetup arrives too late for config-level `use.baseURL` (would resolve to `undefined`). Instead, expose the URL to spec files via a Playwright **fixture** (or by having specs read `process.env.E2E_BASE_URL` at test runtime — workers are spawned AFTER globalSetup and inherit its env writes). Recommended: a tiny `tests/e2e/fixtures.js` exporting `const test = base.extend({ baseURL: async ({}, use) => { await use(process.env.E2E_BASE_URL); } });` so specs do `page.goto('/encrypted-${theme}/')` and Playwright resolves it via the fixture-supplied baseURL at test time. Also `workers: process.env.CI ? 2 : undefined`. `reporter: [['list'], ['html', { open: 'never' }]]`. `retries: process.env.CI ? 1 : 0`. `use.trace: 'retain-on-failure'`. `testDir: '.'` so the spec files in this same dir are discovered.
  2. **`global-setup.js`** —
     - Call `generateSite()` (helper T2). This runs `hexo clean && hexo generate` once for the whole suite.
     - **Criterion 14 — Artifact identity preflight:** `assert.strictEqual` on `crypto.createHash('sha256').update(fs.readFileSync(<repo>/lib/hbe.js)).digest('hex')` vs the same for `<publicDir>/lib/hbe.js`. Repeat for `lib/hbe.style.css` ↔ `<publicDir>/css/hbe.style.css`. Throw with both digests in the message on mismatch (closes server↔browser drift loophole).
     - Call `serveSite({ root: publicDir })`, capture the returned `{ url, close }`. Set `process.env.E2E_BASE_URL = url` (workers spawned next inherit it) and write the URL ONLY to `tests/e2e/.runtime.json` (gitignored) as a debug aid (NOT for teardown).
     - **Use Playwright's `globalSetup` return-teardown pattern** (supported since Playwright 1.27): `module.exports = async () => { ... ; return async () => { await server.close(); }; };` This keeps the server handle in the same closure that started it — no inter-file handle serialization. **No separate `global-teardown.js` file is needed and `playwright.config.js` does NOT set a `globalTeardown` key.** The `serveSite()` helper from T2 must therefore return `{ url, close }` (NOT `{ url, closeId }`).
     - Discover the theme list (`glob lib/hbe.*.html`) and write to `tests/e2e/.themes.json` for spec-file consumption.
  3. **`decryption.spec.js`** — `test.describe.parallel('theme: ' + theme, ...)` for each discovered theme; each describe contains 3 specs:
     - **Criterion 10 + 11** — "right password decrypts": navigate to `/encrypted-${theme}/`. Assert no `console.error` events (register `page.on('console', m => { if (m.type()==='error') errors.push(m); })` BEFORE `goto`). Assert `#hexo-blog-encrypt` and `#hbePass` present. Assert page text does NOT contain `THE SECRET IS BUTTERFLY`. Register `page.evaluate(() => new Promise(r => window.addEventListener('hexo-blog-decrypt', r, { once: true })))` as a Promise BEFORE submitting. Fill `#hbePass` with `hello`, press Enter. Await the promise. Assert page text NOW contains `THE SECRET IS BUTTERFLY`. Assert `text=Encrypt again` button visible. Assert `await page.evaluate(() => Object.keys(localStorage).some(k => k.startsWith('hexo-blog-encrypt:#')))` is `true`.
     - **Criterion 12** — "wrong password alerts": register `page.on('dialog', d => { dialogText = d.message(); d.dismiss(); })` BEFORE submission. Fill `#hbePass` with `wrongpw`, press Enter. Wait for `dialogText` to be set (poll up to 5s). Assert it equals the configured `wrong_pass_message`. Assert page text still does NOT contain the secret. Assert `localStorage` has zero `hexo-blog-encrypt:` keys.
     - **Criterion 13** — "cache reload auto-decrypts": run the right-password flow first; reload the page; register the `hexo-blog-decrypt` listener BEFORE reload (via `page.addInitScript`); assert no password prompt is needed (poll: secret text appears within 2s without any `#hbePass` interaction); assert the event fires post-reload.
  4. **`theme-contract.spec.js`** — single spec that, for each theme, navigates to `/encrypted-${theme}/` and asserts: response status 200; HTML contains all 5 `data-*` attributes; HTML contains `<input id="hbePass">`; HTML contains zero `{{hbe` substrings. (Defence-in-depth alongside server T5.)
  5. **Browser-event-timing rule:** all `page.on('console')`, `page.on('dialog')`, and `hexo-blog-decrypt` listeners are registered BEFORE the action that may fire them. Document this as a top-of-file comment in `decryption.spec.js`.
  6. **Determinism:** never assert ciphertext bytes — only decryption outcomes (per spec risk-mitigation row).
- **VERIFY:**
  - `npm run test:e2e` → exits 0; reporter shows `8 themes × 3 specs = 24 specs passed` plus 8 theme-contract specs = 32 total in this suite (give or take spec count); html report present at `playwright-report/`.
  - **baseURL resolution probe:** the FIRST spec to run must include an `expect(page.url()).not.toBe('about:blank')` assertion immediately after the first `page.goto('/encrypted-<theme>/')`, so a misconfigured fixture surfaces as a clear failure rather than a 30-second timeout.
  - Manual tamper check: edit `lib/hbe.js` (add a comment), re-run `npm run test:e2e`, observe the criterion-14 preflight FAILS in `globalSetup` with both digests printed; revert the edit, re-run, observe pass. (Performed once during T6 implementation; not an automated test.)
- **Done criteria:** 32+ specs pass green; eslint clean (or has scoped override per T2); preflight failure mode demonstrated and reverted; `playwright-report/`, `test-results/`, `tests/e2e/.runtime.json`, `tests/e2e/.themes.json` are gitignored (extend `tests/.gitignore` from T1).

---

### T7 — CI workflow

- **Spec criteria addressed:** none individually; **gates** the full suite on every PR.
- **Files owned:** `.github/workflows/test.yml` (only).
- **Preconditions:** T3 (scripts), T4, T5, T6, T8 (all test files exist for the workflow to actually be green).
- **RED:** `test -f .github/workflows/test.yml && echo exists || echo missing` → `missing`. Equivalent CI-side: opening a draft PR with the branch shows zero status checks reporting.
- **GREEN steps:**
  1. Write `.github/workflows/test.yml` with `on: [push, pull_request]` (PRs targeting `master`).
  2. **Job `lint-and-server`:** `runs-on: ubuntu-latest`; steps: `actions/checkout@v4`; `actions/setup-node@v4` with `node-version: 20.x`, `cache: npm`; `npm ci` (or `npm install` since lockfile not committed — use `npm install --no-audit --no-fund`); `npm run lint`; `npm run test:server`; upload `coverage/` via `actions/upload-artifact@v4` (non-gating per spec).
  3. **Job `e2e`:** `runs-on: ubuntu-latest`; `strategy.matrix.shard: [1, 2, 3, 4]`, `fail-fast: false`; same checkout + node-setup + `npm install`; cache Playwright browsers per Playwright docs (`~/.cache/ms-playwright` keyed by `package.json` hash); `cd tests/fixtures/hexo-site && npm install --no-audit --no-fund && cd ../../..`; `npx playwright install --with-deps chromium`; `npx playwright test --config tests/e2e/playwright.config.js --shard=${{ matrix.shard }}/4`; on failure, `actions/upload-artifact@v4` for `playwright-report/` and `test-results/` (retention 7 days).
  4. Workflow name displayed in PR check: `Tests`. Both jobs must be required for the future branch-protection rule (documented in CONTRIBUTING per T8).
- **VERIFY:**
  - `node -e "require('js-yaml').load(require('fs').readFileSync('.github/workflows/test.yml','utf8')); console.log('OK')"` (install `js-yaml` ad-hoc with `npx --yes js-yaml@4 ...`) OR simpler `python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/test.yml')); print('OK')"` → `OK` (file is valid YAML).
  - Push branch; observe in `gh run list --branch test/e2e-framework --limit 1` the run completes with `success`. `gh run view --log` shows lint, server, and 4 e2e shards all green.
- **Done criteria:** workflow YAML parses; first push triggers a green run end-to-end (all jobs success); coverage artifact uploaded; failure-mode artifacts upload on synthetic-failure (verified once by introducing a temporary failing assertion in a server test, observing artifact appears, then reverting).

---

### T8 — Contributor docs + docs-contract test

- **Spec criteria addressed:** none of 1–14 directly; encodes the "9th theme = drop one file" contract and the staged-rollout branch-protection recipe.
- **Files owned:**
  - `tests/docs.test.js`
  - `docs/THEMES.md`
  - `CONTRIBUTING.md` (append a new section — do not rewrite existing content)
  - `.github/CODEOWNERS`
  - `.github/PULL_REQUEST_TEMPLATE.md` (append a checklist section — do not rewrite existing content)
- **Preconditions:** T3 (so `npm run test:docs` is wired and `node --test` is the agreed runner; doc files themselves have no other technical dep).
- **RED:** `node --test tests/docs.test.js` → `Cannot find module` (file doesn't exist yet). Once `tests/docs.test.js` is written but the doc files are not, the assertions fail with `ENOENT`/missing-substring messages.
- **GREEN steps:**
  1. **Write `tests/docs.test.js` FIRST** with grep/wc-checkable assertions per the framework rule (RED before doc):
     - `docs/THEMES.md` exists; contains the literal string ``` `lib/hbe.<name>.html` ``` (one-file drop contract); contains a `## Required placeholders` heading; lists all 7 placeholders by name (`{{hbeWPM}}`, `{{hbeWHM}}`, `{{hbeHmacDigest}}`, `{{hbeKeySalt}}`, `{{hbeIvSalt}}`, `{{hbeMessage}}`, `{{hbeEncryptedData}}` — verify the actual placeholder identifiers from `index.js` during implementation and use those exact strings).
     - `CONTRIBUTING.md` contains a new section header `## Branch protection rollout` AND lists the staged steps in order: workflow merged → 3 green PRs → required check → branch protection rule.
     - `.github/CODEOWNERS` exists; non-empty; contains at least one `*` rule mapping to a GitHub handle (`@D0n9X1n` per repo author).
     - `.github/PULL_REQUEST_TEMPLATE.md` contains a new checklist line referencing `npm run test`.
     - `docs/THEMES.md` line count ≤ 200 (proof that the contract stays focused, not a tutorial).
  2. **Then write `docs/THEMES.md`** to satisfy the assertions: opening paragraph; "Adding a theme" steps (drop `lib/hbe.<name>.html`, run `npm run test`, done); "Required placeholders" section listing all 7 with one-line semantic descriptions; "Forbidden" section (don't introduce new `data-*` attributes without updating `index.js`); link back to spec.
  3. **Append to `CONTRIBUTING.md`** the `## Branch protection rollout` section: numbered list (1) merge `.github/workflows/test.yml`, (2) wait for 3 consecutive green PR runs, (3) Settings → Branches → require `Tests` check, (4) require PR review (per CODEOWNERS).
  4. **Write `.github/CODEOWNERS`**: single line `* @D0n9X1n` (extend later as contributors join).
  5. **Append to `.github/PULL_REQUEST_TEMPLATE.md`** a checkbox: `- [ ] Ran \`npm run test\` locally and it passed`.
- **VERIFY:**
  - `node --test tests/docs.test.js` → all assertions pass.
  - `wc -l docs/THEMES.md` → ≤ 200.
  - `git diff --stat CONTRIBUTING.md .github/PULL_REQUEST_TEMPLATE.md` → shows only additions (no deletions/rewrites).
- **Done criteria:** all docs.test.js assertions pass; existing user-facing prose in `CONTRIBUTING.md` and the PR template is preserved verbatim; both `ReadMe.md` and `ReadMe.zh.md` are NOT modified by this task (no user-facing runtime behavior change → the bilingual-readme convention does not trigger).

---

## Cross-cutting acceptance gate (post-Wave-4)

After T7 reports green on CI, run locally as a final smoke:

```sh
npm run lint && npm run test:server && npm run test:e2e
# equivalently: npm run test
```

Expected: exit 0; lint clean; server tests show `# pass` count covering criteria 1–9; e2e shows 24 decryption specs + 8 theme-contract specs (32 total) passing across 8 themes; coverage report printed for `index.js`.

This satisfies the spec's "Acceptance command" line.

---

## Notes on parallelism safety

- **Wave 1 file disjointness:** T1 writes only under `tests/fixtures/`; T3 writes only `package.json`. Zero overlap.
- **Wave 3 file disjointness:** T4 owns `tests/server/filter.test.js`; T5 owns `tests/server/generator.test.js` + `tests/server/themes.test.js`; T6 owns `tests/e2e/**`; T8 owns `tests/docs.test.js` + `docs/**` + `.github/CODEOWNERS` + appends to `CONTRIBUTING.md` & `.github/PULL_REQUEST_TEMPLATE.md`. The two append-only edits in T8 are the only mutations to pre-existing files in wave 3 and are confined to that one task — no merge conflicts with T4/T5/T6.
- **Shared read-only inputs (safe):** all wave-3 tasks read `tests/fixtures/**` and `tests/helpers/**` and the root `package.json` from waves 1–2; none mutate them.
- **No shared mutable state at runtime:** server tests boot isolated `Hexo` instances; E2E `globalSetup` runs ONCE per suite (not per worker) and emits read-only artifacts (`public/`, `.runtime.json`, `.themes.json`).

---

## Risk register (plan-specific, supplements spec risks)

| Risk                                                                                  | Mitigation                                                                                                                            |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `node --test` reporter format changes between Node versions                           | Pin CI to Node 20.x; document local minimum in T8's `CONTRIBUTING.md` addition.                                                       |
| ESLint 6.2.2 chokes on modern syntax in test files                                    | T2 introduces `tests/.eslintrc.js` override (parserOptions only, no rule changes) — only if needed; verify before adding.              |
| Fixture `npm install` slow on first CI run                                            | Cache `node_modules` of fixture via `actions/setup-node@v4` cache + Playwright browser cache (T7).                                    |
| Default Hexo theme rendering produces unexpected wrappers that break content asserts  | Spike during T1: if `theme: ""` produces minimal HTML, use it; otherwise commit a 5-line `themes/_minimal/layout/layout.ejs` stub.    |
| `data-*` placeholder names assumed in T8 differ from actual `index.js` strings        | T8 implementer must `grep -o '{{hbe[A-Za-z]*}}' index.js lib/hbe.*.html` to extract the canonical 7 names BEFORE writing assertions.  |
