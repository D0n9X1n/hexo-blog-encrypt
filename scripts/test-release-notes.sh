#!/usr/bin/env bash
# Unit test for scripts/release-notes.sh. Uses a temporary git repository and
# replaces only the `gh` process; the production issue collector still runs.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/hbe-release-notes.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

# Keep release-notes.sh byte-for-byte unchanged; inject the fake gh transport
# through a sibling release-issues.py stub that loads the real module.
mkdir "$TMP/scripts"
cp "$ROOT/scripts/release-notes.sh" "$TMP/scripts/release-notes.sh"
export HBE_RELEASE_ISSUES_SOURCE
HBE_RELEASE_ISSUES_SOURCE="$(python3 -c 'import pathlib,sys; print(pathlib.Path(sys.argv[1]).resolve())' "$ROOT/scripts/release-issues.py")"
cat > "$TMP/scripts/release-issues.py" <<'PY'
import argparse
import importlib.util
import os
from pathlib import Path
import re
import sys

spec = importlib.util.spec_from_file_location("release_issues", os.environ["HBE_RELEASE_ISSUES_SOURCE"])
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)
parser = argparse.ArgumentParser()
parser.add_argument("--repo", required=True)
parser.add_argument("--head", required=True)
parser.add_argument("--base", required=True)
args = parser.parse_args()
assert args.repo == "owner/repo", args.repo
assert re.fullmatch(r"[0-9a-f]{40}", args.head)
# Run production range selection and base validation; replace only the gh process.
api = release.Api(command=[sys.executable, str(Path(__file__).with_name("fake_gh.py"))])
try:
    print(release.collect(args.repo, args.head, args.base, api=api, cwd=Path.cwd()), end="")
except release.Failure as error:
    print(f"release issue lookup failed: {error}", file=sys.stderr)
    sys.exit(1)
PY
cat > "$TMP/scripts/fake_gh.py" <<'PY'
import os
import re
import sys

assert sys.argv[1] == "api"
assert re.fullmatch(r"repos/owner/repo/commits/[0-9a-f]{40}/pulls\?per_page=100&page=1", sys.argv[2]), sys.argv[2]
if os.environ.get("HBE_RELEASE_FIXTURE_FAILURE") == "1":
    print('HTTP/2.0 401 Unauthorized\n\n{"message":"Bad credentials"}')
    sys.exit(1)
print('HTTP/2.0 200 OK\nContent-Type: application/json\n\n[]')
PY
export GITHUB_REPOSITORY=owner/repo
NOTES_SH="$TMP/scripts/release-notes.sh"

(
  cd "$TMP"
  git init -q
  git config user.email test@example.invalid
  git config user.name "Release Notes Test"
  git config commit.gpgsign false
  git config tag.gpgsign false

  echo one > file.txt
  git add file.txt
  git commit -q -m "feat: initial release"
  git tag v1.0.0

  echo two >> file.txt
  git commit -qam "fix: polish palette"
  echo extra > extra.txt
  git add extra.txt
  git commit -qm "docs: mention 1.1.0"
  git tag v1.1.0

  # --- 1. Normal release: install/registry links, issues, commits since prev tag.
  bash "$NOTES_SH" v1.1.0 > notes.md
  head -n 1 notes.md | grep -qx '# hexo-blog-encrypt v1.1.0' || fail "title line"
  grep -qF 'npm install hexo-blog-encrypt@1.1.0' notes.md || fail "install line"
  grep -qF 'https://www.npmjs.com/package/hexo-blog-encrypt/v/1.1.0' notes.md || fail "npm link"
  grep -qF '@d0n9x1n/hexo-blog-encrypt' notes.md || fail "GitHub Packages name"
  grep -qF 'https://github.com/owner/repo/pkgs/npm/hexo-blog-encrypt' notes.md || fail "GitHub Packages link"
  ! grep -qi 'changelog' notes.md || fail "notes must not reference a CHANGELOG"
  grep -qx '## Resolved issues' notes.md || fail "resolved issues heading"
  grep -qF 'No linked issues resolved' notes.md || fail "empty resolved-issues text"
  grep -qx '## Changes since v1.0.0' notes.md || fail "changes heading"
  grep -qE '^- fix: polish palette \([0-9a-f]{7,}\)$' notes.md || fail "commit line format"
  grep -qF -- '- docs: mention 1.1.0' notes.md || fail "second commit"
  ! grep -qF 'feat: initial release' notes.md || fail "commit range leaked previous release"
  grep -qF 'https://github.com/owner/repo/compare/v1.0.0...v1.1.0' notes.md || fail "compare link"
  grep -qx '## Verification' notes.md || fail "verification heading"
  grep -qiF 'lint' notes.md || fail "verification: lint"
  grep -qF '100%' notes.md || fail "verification: coverage"
  grep -qF 'Playwright' notes.md || fail "verification: e2e"
  grep -qF 'provenance' notes.md || fail "verification: provenance"
  ! grep -qiE 'download|SHA256SUMS|release-assets' notes.md || fail "no binary asset section expected"
  # Section order: title -> install -> Resolved issues -> Changes -> compare -> Verification.
  order="$(grep -nE '^(# hexo-blog-encrypt |npm install |## Resolved issues|## Changes since|\*\*Full diff:\*\*|## Verification)' notes.md | cut -d: -f1 | tr '\n' ' ')"
  [[ "$order" =~ ^([0-9]+\ ){6}$ ]] || fail "missing sections: $order"
  read -r a b c d e f <<< "$order"
  (( a < b && b < c && c < d && d < e && e < f )) || fail "section order: $order"

  # --- 2. Collector (GitHub API) failure fails with no partial notes.
  if HBE_RELEASE_FIXTURE_FAILURE=1 bash "$NOTES_SH" v1.1.0 > failed.md 2> failed.txt; then
    fail "metadata failure unexpectedly succeeded"
  fi
  [[ ! -s failed.md ]] || fail "metadata failure produced partial notes"
  grep -qF 'release issue lookup failed' failed.txt || fail "metadata failure message"

  # --- 3. Missing predecessor must not silently broaden to full history.
  git tag -d v1.0.0 >/dev/null
  if bash "$NOTES_SH" v1.1.0 > missing.md 2> missing.txt; then
    fail "missing predecessor unexpectedly succeeded"
  fi
  [[ ! -s missing.md ]] || fail "missing predecessor produced partial notes"
  grep -qF 'predecessor' missing.txt || fail "missing predecessor message"

  # --- 4. Explicit first release: full history, no compare link.
  RELEASE_FIRST=1 bash "$NOTES_SH" v1.1.0 > first.md
  grep -qx '## Changes' first.md || fail "first release changes heading"
  grep -qF 'feat: initial release' first.md || fail "first release includes full history"
  grep -qF 'fix: polish palette' first.md || fail "first release includes latest commit"
  ! grep -qF '/compare/' first.md || fail "first release must not have a compare link"
  if RELEASE_FIRST=1 PREVIOUS_TAG=HEAD bash "$NOTES_SH" v1.1.0 > conflict.md 2> conflict.txt; then
    fail "conflicting first-release base unexpectedly succeeded"
  fi
  [[ ! -s conflict.md ]] || fail "conflict produced partial notes"
  grep -qF 'conflicts' conflict.txt || fail "conflict message"

  # --- 5. Explicit PREVIOUS_TAG is honoured; invalid/nonancestor bases fail closed.
  first_commit="$(git rev-list --max-parents=0 HEAD)"
  PREVIOUS_TAG="$first_commit" bash "$NOTES_SH" v1.1.0 > explicit.md
  grep -qF "## Changes since ${first_commit}" explicit.md || fail "explicit PREVIOUS_TAG heading"
  ! grep -qF 'feat: initial release' explicit.md || fail "explicit base range"
  current_branch="$(git branch --show-current)"
  git checkout --orphan unrelated -q
  git commit --allow-empty -qm 'unrelated history'
  unrelated="$(git rev-parse HEAD)"
  git checkout "$current_branch" -q
  for base in missing-tag "$unrelated"; do
    if PREVIOUS_TAG="$base" bash "$NOTES_SH" v1.1.0 > invalid.md 2> invalid.txt; then
      fail "invalid explicit base ($base) unexpectedly succeeded"
    fi
    [[ ! -s invalid.md ]] || fail "invalid base produced partial notes"
    grep -qF 'release issue lookup failed' invalid.txt || fail "invalid base message"
  done

  # --- 6. Shallow clones are rejected even in first-release mode.
  git clone --quiet --depth=1 --no-local "file://$TMP" "$TMP/shallow"
  git -C "$TMP/shallow" fetch --quiet --depth=1 origin tag v1.1.0
  if (cd "$TMP/shallow" && RELEASE_FIRST=1 bash "$NOTES_SH" v1.1.0) > shallow.md 2> shallow.txt; then
    fail "shallow history unexpectedly succeeded"
  fi
  [[ ! -s shallow.md ]] || fail "shallow history produced partial notes"
  grep -qF 'shallow' shallow.txt || fail "shallow message"

  # --- 7. Usage error without a tag.
  if GITHUB_REF_NAME= bash "$NOTES_SH" > usage.md 2> usage.txt; then
    fail "missing tag unexpectedly succeeded"
  fi
  grep -qF 'usage' usage.txt || fail "usage message"
)

echo "release-notes.sh test passed"
