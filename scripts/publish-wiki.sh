#!/usr/bin/env bash
# Mirror wiki/*.md into a cloned GitHub wiki repository and commit.
set -euo pipefail

if [[ $# -ne 3 ]]; then
  printf 'usage: %s SOURCE_DIR WIKI_REPO SOURCE_SHA\n' "$0" >&2
  exit 2
fi

source_dir="$1"
wiki_repo="$2"
source_sha="$3"

[[ -d "$source_dir" ]] || {
  printf 'wiki source directory does not exist: %s\n' "$source_dir" >&2
  exit 1
}
[[ -d "$wiki_repo/.git" ]] || {
  printf 'wiki destination is not a Git worktree: %s\n' "$wiki_repo" >&2
  exit 1
}
[[ "$(git -C "$wiki_repo" branch --show-current)" == "master" ]] || {
  printf 'wiki destination must be on master\n' >&2
  exit 1
}

shopt -s nullglob
pages=("$source_dir"/*.md)
(( ${#pages[@]} > 0 )) || {
  printf 'wiki source contains no Markdown pages\n' >&2
  exit 1
}

find "$wiki_repo" -maxdepth 1 -type f -name '*.md' -delete
cp -- "${pages[@]}" "$wiki_repo"/

git -C "$wiki_repo" add --all
if git -C "$wiki_repo" diff --cached --quiet; then
  if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
    printf 'changed=false\n' >> "$GITHUB_OUTPUT"
  fi
  printf 'wiki already matches %s\n' "$source_sha"
  exit 0
fi

git -C "$wiki_repo" -c user.name='github-actions[bot]' \
  -c user.email='41898282+github-actions[bot]@users.noreply.github.com' \
  commit -q -m "Publish wiki from ${source_sha:0:7}"
if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  printf 'changed=true\n' >> "$GITHUB_OUTPUT"
fi
