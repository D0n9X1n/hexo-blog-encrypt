#!/usr/bin/env bash
# Exercise scripts/publish-wiki.sh against throwaway Git repositories.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

fail() { printf 'FAIL: %s\n' "$1" >&2; exit 1; }

mkdir -p "$tmp/src" "$tmp/empty"
printf '# Home\n' > "$tmp/src/Home.md"
printf '# New\n' > "$tmp/src/New.md"
git init -q -b master "$tmp/wiki"
printf '# Old\n' > "$tmp/wiki/Old.md"
printf 'keep\n' > "$tmp/wiki/image.png"
git -C "$tmp/wiki" add -A
git -C "$tmp/wiki" -c user.name=t -c user.email=t@t commit -q -m init

out="$tmp/out1"
GITHUB_OUTPUT="$out" bash "$root/scripts/publish-wiki.sh" "$tmp/src" "$tmp/wiki" abcdef1234567
grep -qx 'changed=true' "$out" || fail 'first publish should report changed=true'
[[ -f "$tmp/wiki/Home.md" && -f "$tmp/wiki/New.md" ]] || fail 'source pages not copied'
[[ ! -f "$tmp/wiki/Old.md" ]] || fail 'stale page not removed'
[[ -f "$tmp/wiki/image.png" ]] || fail 'non-Markdown asset removed'
git -C "$tmp/wiki" log -1 --format=%s | grep -qx 'Publish wiki from abcdef1' || fail 'commit message'

out="$tmp/out2"
GITHUB_OUTPUT="$out" bash "$root/scripts/publish-wiki.sh" "$tmp/src" "$tmp/wiki" abcdef1234567 >/dev/null
grep -qx 'changed=false' "$out" || fail 'unchanged publish should report changed=false'

if bash "$root/scripts/publish-wiki.sh" "$tmp/empty" "$tmp/wiki" x 2>/dev/null; then fail 'empty source accepted'; fi
if bash "$root/scripts/publish-wiki.sh" "$tmp/src" "$tmp/src" x 2>/dev/null; then fail 'non-Git destination accepted'; fi
git -C "$tmp/wiki" checkout -q -b other
if bash "$root/scripts/publish-wiki.sh" "$tmp/src" "$tmp/wiki" x 2>/dev/null; then fail 'non-master destination accepted'; fi

printf 'publish-wiki tests passed\n'
