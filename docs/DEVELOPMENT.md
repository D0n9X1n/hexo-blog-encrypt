# Development

How to work on this project — workflow rules, test commands, and
submodule maintenance.

## Setup (after a fresh clone)

```sh
git submodule update --init --recursive
npm install
```

The submodule pulls in the **feature-crew** agent framework at
`feature-crew/`. To pull the latest framework updates later:

```sh
git submodule update --remote feature-crew
```

## Test commands

| Command | What it runs |
| --- | --- |
| `npm test` | Lint + server tests (`tests/server.test.js`, `tests/docs.test.js`) + Playwright e2e against all 8 themes. The full suite the CI runs. |
| `npm run lint` | ESLint over `src/` + `tests/`. |
| `npm run test:server` | Server-side Node tests only. Fast (no browser). |
| `npm run test:e2e` | Playwright e2e only. Spins up a real Hexo build of `tests/fixtures/hexo-site/`, serves it, drives Chromium. |
| `npm run build` | Rebuild the browser bundle (`lib/hbe.bundle.js`) via esbuild. Runs as `prepack` automatically before `npm publish`. |

Run `npm test` BEFORE you push anything that touches `src/`, `lib/`, or
`tests/`. CI will reject regressions; running locally first catches
them in seconds.

## Workflow — feature-crew

This project uses the **feature-crew** agent framework (vendored as a
git submodule at `feature-crew/`). All non-trivial work goes through
it. Trivial work (single-file typo, badge tweak, etc.) may be done
directly.

**Read at session start (in this order):**

1. `feature-crew/.github/copilot-instructions.md` — framework rules
   (TDD, root-cause debugging, verification, cross-model audit).
2. `feature-crew/agents/pm.md` — PM behavior + track-selection process.
3. `feature-crew/workflow/pipeline.md` — three pipelines, gates, dispatch rules.

**On every user request to build, fix, change, or investigate:**

1. **Act as the PM.** Propose a track — **Trivial**, **Standard**, or
   **Complex** — and confirm with the user before starting work.
   - **Trivial:** 1 file, no design needed (e.g., typo, single-line
     tweak). PM does it directly.
   - **Standard:** 1–5 files, small feature. Bullet-spec → light build
     → one QA pass.
   - **Complex:** multi-module / new architecture. Brainstorm → spec
     → architect → devs → QA → tech lead.
2. **Follow the matching flow** in
   `feature-crew/workflow/pipeline.md`. Don't apply Complex ceremony
   to Trivial work, and don't rush Complex work through Standard.
   Wrong track = wasted work or missed risk.
3. **Honor the non-negotiables:**
   - No production code without a failing test first.
   - No completion claims without fresh verification.
   - No fixes without root-cause investigation.
   - Cross-model audit on every hard-gate artifact (spec, plan,
     tests-as-spec, implementation diff, tech-lead final).
4. **Dispatch subagents** per the pipeline rules. PM may write code
   directly only on Trivial work and light Standard work (≤2 files);
   otherwise dispatch a developer subagent.

Agent prompt templates live in `feature-crew/agents/` (architect,
developer, qa-spec-reviewer, qa-code-reviewer, tech-lead). Specs go in
`feature-crew/docs/specs/`, plans in `feature-crew/docs/plans/`.

Project-specific specs and plans (i.e. specs about this codebase, not
about the framework) live in [`docs/specs/`](specs/) and
[`docs/plans/`](plans/).

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
