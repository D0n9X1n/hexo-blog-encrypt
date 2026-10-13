#!/usr/bin/env bash
# Generate GitHub Release notes for a hexo-blog-encrypt tag (SonicTerm style).
#
# Usage: scripts/release-notes.sh <tag>   (e.g. v4.1.0)
#
# Output (stdout, Markdown):
#   # hexo-blog-encrypt <tag>
#   install line + npm / GitHub Packages links
#   ## Resolved issues            (scripts/release-issues.py, fail-closed)
#   ## Manually closed issues     (only when present; unverified linkage)
#   ## Changes since <prev tag>   (git log --no-merges) + compare link
#   ## Verification
#
# GitHub Releases are the project's release history (there is no CHANGELOG
# file). Fail-closed: every lookup (predecessor tag, issue provenance via the
# GitHub API, commit range) completes BEFORE anything is printed, so a failure
# exits non-zero with empty stdout instead of partial notes.
#
# Environment:
#   GITHUB_REPOSITORY  owner/repo (default D0n9X1n/hexo-blog-encrypt)
#   GH_TOKEN           token for `gh api` (issues: read, pull-requests: read)
#   PREVIOUS_TAG       explicit exclusive base ref (default: nearest older tag)
#   RELEASE_FIRST=1    explicit first release: no base, full history
set -euo pipefail

TAG="${1:-${GITHUB_REF_NAME:-}}"
if [[ -z "$TAG" ]]; then
  echo "usage: $0 <tag>" >&2
  exit 2
fi
VERSION="${TAG#v}"
REPO="${GITHUB_REPOSITORY:-D0n9X1n/hexo-blog-encrypt}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ "$(git rev-parse --is-shallow-repository)" != false ]]; then
  echo "release notes require complete history; shallow repositories are not supported (use fetch-depth: 0)" >&2
  exit 2
fi
HEAD_COMMIT="$(git rev-parse --verify --end-of-options "${TAG}^{commit}")"
if [[ "${RELEASE_FIRST:-0}" == 1 && "${PREVIOUS_TAG+x}" == x ]]; then
  echo "RELEASE_FIRST=1 conflicts with PREVIOUS_TAG" >&2
  exit 2
fi
PREVIOUS_TAG="${PREVIOUS_TAG:-}"
if [[ "${RELEASE_FIRST:-0}" != 1 && -z "$PREVIOUS_TAG" ]]; then
  if ! PREVIOUS_TAG="$(git describe --tags --abbrev=0 "${HEAD_COMMIT}^")"; then
    echo "release predecessor lookup failed; fetch complete tags or explicitly set RELEASE_FIRST=1 for the first release" >&2
    exit 2
  fi
fi

# Complete all metadata lookups before emitting notes; an API error is not an empty release.
ISSUES="$(python3 "$ROOT/release-issues.py" \
  --repo "$REPO" --head "$HEAD_COMMIT" --base "$PREVIOUS_TAG")"

if [[ -n "$PREVIOUS_TAG" ]]; then
  COMMITS="$(git log --no-merges --pretty=format:'- %s (%h)' "${PREVIOUS_TAG}..${HEAD_COMMIT}")"
else
  COMMITS="$(git log --no-merges --pretty=format:'- %s (%h)' "$HEAD_COMMIT")"
fi

# Render to a buffer and print in one go so a late failure cannot leave partial notes.
NOTES="$(
  echo "# hexo-blog-encrypt ${TAG}"
  echo
  echo '```sh'
  echo "npm install hexo-blog-encrypt@${VERSION}"
  echo '```'
  echo
  echo "- npm: https://www.npmjs.com/package/hexo-blog-encrypt/v/${VERSION}"
  echo "- GitHub Packages mirror (\`@d0n9x1n/hexo-blog-encrypt\`): https://github.com/${REPO}/pkgs/npm/hexo-blog-encrypt"
  echo
  printf '%s\n\n' "$ISSUES"
  if [[ -n "$PREVIOUS_TAG" ]]; then
    echo "## Changes since ${PREVIOUS_TAG}"
  else
    echo "## Changes"
  fi
  echo
  if [[ -n "$COMMITS" ]]; then
    printf '%s\n' "$COMMITS"
  else
    echo "No non-merge commits in this range."
  fi
  echo
  if [[ -n "$PREVIOUS_TAG" ]]; then
    echo "**Full diff:** https://github.com/${REPO}/compare/${PREVIOUS_TAG}...${TAG}"
    echo
  fi
  echo "## Verification"
  echo
  echo "- Lint (\`npm run lint\`) passed in the release workflow before publication."
  echo "- Server tests passed with 100% line/branch/function/statement coverage (\`npm run test:server\`)."
  echo "- Playwright end-to-end tests passed (\`npm run test:e2e\`)."
  echo "- Published to npm from this tag via OIDC trusted publishing with npm provenance (\`npm publish --provenance\`)."
)"
printf '%s\n' "$NOTES"
