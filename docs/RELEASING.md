# Releasing

This is the **maintainer-facing** release procedure. End users install
the published package per [`Getting-Started`](https://github.com/D0n9X1n/hexo-blog-encrypt/wiki/Getting-Started)
in the wiki — they don't need to read this.

## Where the package lives

| Registry | Name | Auth | Audience |
| --- | --- | --- | --- |
| **npmjs.com** (canonical) | `hexo-blog-encrypt` | OIDC trusted publishing | All end users. This is the install path advertised in the README. |
| **GitHub Packages** (mirror) | `@d0n9x1n/hexo-blog-encrypt` | `GITHUB_TOKEN` | Discoverability only — populates the repo's "Packages" sidebar. Identical tarball, scoped name. |

Both publish flows run **with provenance** (`npm publish --provenance`)
so the attestation proves the tarball was built from this repo at the
exact tagged commit.

## Pre-flight checklist (before tagging)

Single commit on `master`, two file changes:

1. **`CHANGELOG.md`** — change `## [x.y.z] — Unreleased` → `## [x.y.z] — YYYY-MM-DD`.
   The release workflow's regex `^## \[VERSION\] — [0-9]{4}-[0-9]{2}-[0-9]{2}` will
   fail closed if the date is missing.
2. **`demo/package.json`** — flip `"hexo-blog-encrypt": "file:.."` →
   `"hexo-blog-encrypt": "^x.y.z"`. The release workflow refuses to
   publish if a `file:` reference remains.
3. **`package.json` `version`** — should already match the tag from your
   bump commit; the workflow re-verifies.

```sh
git -c user.email=you@example.com -c user.name=You commit -am "release: prepare vX.Y.Z

- CHANGELOG date YYYY-MM-DD
- demo/package.json: file:.. → ^X.Y.Z (release.yml requires this)

deploy-demo will temporarily fail until X.Y.Z publishes; retrigger after."
git push origin master
```

> **Heads-up: deploy-demo will fail on this commit.** The Pages deploy
> runs `npm install` against the demo site, which now wants
> `hexo-blog-encrypt@^X.Y.Z` from npmjs — and that version doesn't
> exist yet. This is expected. Retrigger deploy-demo once the release
> workflow has published (see step 5 below).

## Tag + push

```sh
git tag -a vX.Y.Z -m "hexo-blog-encrypt vX.Y.Z

<one-paragraph release summary>

Migration / changelog links."
git push origin vX.Y.Z
```

This single tag push triggers **two workflows in parallel**:

| Workflow | What it publishes |
| --- | --- |
| `.github/workflows/release.yml` | `hexo-blog-encrypt@X.Y.Z` to npmjs.com via OIDC + provenance |
| `.github/workflows/publish-gh-packages.yml` | `@d0n9x1n/hexo-blog-encrypt@X.Y.Z` to npm.pkg.github.com via GITHUB_TOKEN + provenance |

Watch them:

```sh
gh run list --workflow=release.yml --limit 1
gh run list --workflow=publish-gh-packages.yml --limit 1
```

The `publish-gh-packages.yml` job is **idempotent** — it skips publish
if the version already exists. Re-runs are safe.

## Post-publish

1. **Verify on npm:**

   ```sh
   curl -s "https://registry.npmjs.org/hexo-blog-encrypt/latest" \
     | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['version'])"
   ```

2. **Create the GitHub Release** (the workflow only publishes the
   tarball; the user-facing release notes are a separate step):

   ```sh
   gh release create vX.Y.Z \
     --title "vX.Y.Z — <headline>" \
     --notes-file path/to/release-notes.md \
     --latest
   ```

3. **Retrigger deploy-demo** so the live site pulls the now-published
   tarball and refreshes:

   ```sh
   gh workflow run deploy-demo.yml --ref master
   ```

4. **Verify the GH Packages mirror** at
   `https://github.com/D0n9X1n/hexo-blog-encrypt/pkgs/npm/hexo-blog-encrypt`
   shows the new version. Confirm the repo's right-hand "Packages"
   sidebar lists `@d0n9x1n/hexo-blog-encrypt`.

## Backfilling the GH Packages mirror

If a tag already exists but `publish-gh-packages.yml` didn't run for it
(e.g. the workflow was added later), dispatch it manually:

```sh
gh workflow run publish-gh-packages.yml --ref master -f tag=vX.Y.Z
```

The workflow checks out the requested tag, applies the same scope
rewrite, and publishes. If the version is already present, it skips.

## Auth setup (one-time)

### npmjs.com — OIDC trusted publishing

Configure on npmjs once per package:

1. https://www.npmjs.com/package/hexo-blog-encrypt/access → **Trusted Publishers**
2. Add a GitHub Actions trusted publisher with:
   - **Organization or user:** `D0n9X1n`
   - **Repository:** `hexo-blog-encrypt`
   - **Workflow filename:** `release.yml`
   - **Environment:** *(leave blank)*

The release workflow then exchanges its short-lived OIDC token for
publish authority — no `NPM_TOKEN` secret required, no rotation. The
docs test (`tests/docs.test.js`) fails closed if `secrets.NPM_TOKEN` or
`NODE_AUTH_TOKEN` is re-introduced into `release.yml`.

### GitHub Packages

No setup. The workflow uses the auto-provided `GITHUB_TOKEN` with
`permissions: packages: write` declared inline.

## npm CLI version requirement

OIDC trusted publishing **and** provenance attestations both require
**npm CLI ≥ 11.5.1**. Node 20 ships with npm 10.x, so both publish
workflows include an explicit `npm install -g npm@^11` step. If that
step disappears, `npm publish --provenance` fails with `ENEEDAUTH`
(npm 10 doesn't know how to do the OIDC dance, so it falls back to
checking for a token that isn't there).

## Why scoped name on GitHub Packages?

GitHub Packages npm requires the package name to be scoped to the repo
owner. `hexo-blog-encrypt` (unscoped) cannot be published as-is to
`npm.pkg.github.com`. The `publish-gh-packages.yml` workflow mutates
`package.json` in-CI before `npm publish`:

```json
{
  "name": "@d0n9x1n/hexo-blog-encrypt",
  "publishConfig": { "registry": "https://npm.pkg.github.com", "access": "public" }
}
```

The runner is ephemeral so this rewrite never reaches git. End users
who want to install from GH Packages instead of npmjs use the scoped
name (see Getting Started for the install snippet).

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `ENEEDAUTH` from `npm publish` in release.yml | npm CLI < 11.5.1 (the `npm install -g npm@^11` step is missing or failed), OR trusted publisher misconfigured on npmjs.com | Verify the upgrade step ran; double-check the trusted-publisher fields match exactly (workflow filename `release.yml`, no environment). |
| `release.yml` fails at "Verify CHANGELOG has dated entry" | You forgot to date the `## [x.y.z]` heading | Pre-flight commit + push, then re-run with `gh run rerun <id>` (the tag stays put). |
| `release.yml` fails at "Verify demo references published package" | `demo/package.json` still says `file:..` | Pre-flight commit + push, re-run. |
| `publish-gh-packages.yml` fails with `403 Forbidden` | The runner's `GITHUB_TOKEN` lost `packages: write` (e.g. branch protection stripped it) | Restore `permissions: packages: write` at the workflow / job scope. |
| GitHub Packages page returns 404 after publish | Eventually consistent; CDN catches up within seconds. | Wait, refresh. If still 404 after a few minutes, the publish step probably no-op'd — check the workflow log for the "Skip if … already exists" branch. |
| Tag points at the wrong commit (you forgot a fix) | Squash merges drop late commits; the tag was created before the fix | `git tag -d vX.Y.Z && git push --delete origin vX.Y.Z`, fix on master, re-tag, re-push. The publish workflow is idempotent only at the tarball level — if you already published the bad version to npm, you must bump (npm versions are immutable). |

## Lessons learned

- **Push pre-flight + verify CI green BEFORE creating the tag.** The tag
  triggers a real publish; once `npm publish` succeeds you cannot
  republish that version. Rolling back means a new patch version.
- **Squash-merging a PR mid-flight orphans late commits on the source
  branch.** If you push a fix to a feature branch after the squash
  merge, that fix lives only on the dead branch — it never reaches
  master. Always push fixes BEFORE merging, or apply them as a fresh
  commit on master after merge.
- **Both publish jobs are independent**, so a failure in one doesn't
  abort the other. Don't assume "both green" from a single ✓ — check
  each workflow's run.

## See also

- [`docs/ARCHITECTURE.md`](ARCHITECTURE.md) — codebase orientation.
- [`docs/DEVELOPMENT.md`](DEVELOPMENT.md) — workflow rules + commands.
- [`.github/workflows/release.yml`](../.github/workflows/release.yml) — npmjs publish workflow.
- [`.github/workflows/publish-gh-packages.yml`](../.github/workflows/publish-gh-packages.yml) — GH Packages mirror workflow.
- [`CHANGELOG.md`](../CHANGELOG.md) — release history.
