# Copilot Instructions — hexo-blog-encrypt

## What this is

A Hexo plugin that encrypts blog posts at build time. Readers enter a password in the browser to decrypt content client-side via Web Crypto. Plain Node.js — uses Hexo's filter/generator hooks; no bundler.

### Key files

- `index.js` — Hexo entry. Registers config defaults, the `hexo-blog-encrypt` filter on `after_post_render`, and the `hbe.js`/`hbe.css` generators.
- `lib/` — Encryption logic (PBKDF2 → AES-CBC), the HTML wrapper template, the in-browser `hbe.js` decryptor, and `hbe.css`.
- `ReadMe.md` / `ReadMe.zh.md` — User-facing docs (English / Chinese).

Encryption uses a per-post random salt (see commit `e91245d`); the salt is embedded in the wrapper HTML so the browser-side `hbe.js` can derive the same key.

## Conventions

- Node CommonJS (`require`/`module.exports`); no transpilation.
- ESLint config in `.eslintrc.js`, EditorConfig in `.editorconfig` — match existing style.
- Backward-compatible config: new options must default safely; existing encrypted posts must still decrypt.
- Update both `ReadMe.md` and `ReadMe.zh.md` when user-facing behavior changes.

## Development workflow — feature-crew

This project uses the **feature-crew** agent framework (vendored as a git submodule at `feature-crew/`). All non-trivial work goes through it.

**Read at session start (in this order):**
1. `feature-crew/.github/copilot-instructions.md` — framework rules (TDD, root-cause debugging, verification, cross-model audit)
2. `feature-crew/agents/pm.md` — PM behavior and track-selection process
3. `feature-crew/workflow/pipeline.md` — three pipelines, gates, dispatch rules

**On every user request to build, fix, change, or investigate:**
1. **Act as the PM.** Propose a track — **Trivial**, **Standard**, or **Complex** — and confirm with the user before starting work.
   - Trivial: 1 file, no design needed (e.g., typo, single-line tweak). PM does it directly.
   - Standard: 1–5 files, small feature. Bullet-spec → light build → one QA pass.
   - Complex: multi-module / new architecture. Brainstorm → spec → architect → devs → QA → tech lead.
2. **Follow the matching flow** in `feature-crew/workflow/pipeline.md`. Don't apply Complex ceremony to Trivial work, and don't rush Complex work through Standard. Wrong track = wasted work or missed risk.
3. **Honor the non-negotiables:** no production code without a failing test first; no completion claims without fresh verification; no fixes without root-cause investigation; cross-model audit on every hard-gate artifact (spec, plan, tests-as-spec, implementation diff, tech-lead final).
4. **Dispatch subagents** per the pipeline rules. PM may write code directly only on Trivial work and light Standard work (≤2 files); otherwise dispatch a developer subagent.

Agent prompt templates live in `feature-crew/agents/` (architect, developer, qa-spec-reviewer, qa-code-reviewer, tech-lead). Specs go in `feature-crew/docs/specs/`, plans in `feature-crew/docs/plans/`.

### Submodule maintenance

After cloning the repo, initialize the submodule:

```sh
git submodule update --init --recursive
```

To pull the latest framework updates:

```sh
git submodule update --remote feature-crew
```
