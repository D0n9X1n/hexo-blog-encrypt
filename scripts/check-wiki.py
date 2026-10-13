#!/usr/bin/env python3
"""Validate separate English and Chinese Markdown wiki files."""

from __future__ import annotations

from pathlib import Path, PurePosixPath
import re
import subprocess
import sys
from urllib.parse import unquote, urlsplit

CHINESE_SUFFIX = "-zh-CN"
LEGACY_MARKERS = frozenset({"## English", "## 中文"})
HEADING_PATTERN = re.compile(r"^(#{1,6})[ \t]+")
LINK_PATTERN = re.compile(r"(?<!!)\[[^\]]*\]\(([^)]+)\)")
FENCE_PATTERN = re.compile(r"^[ \t]{0,3}(`{3,}|~{3,})")
EXTERNAL_SCHEMES = frozenset(
    {
        "data",
        "ftp",
        "ftps",
        "http",
        "https",
        "irc",
        "ircs",
        "mailto",
        "news",
        "ssh",
        "tel",
    }
)


def repository_root() -> Path:
    """Return the repository root containing this checker."""
    return Path(__file__).resolve().parent.parent


def tracked_wiki_paths(root: Path) -> list[PurePosixPath]:
    """Return tracked wiki files in deterministic repository-relative order."""
    completed = subprocess.run(
        ["git", "ls-files", "-z", "--", "wiki/**"],
        capture_output=True,
        check=False,
        cwd=root,
    )
    if completed.returncode != 0:
        detail = completed.stderr.decode("utf-8", errors="replace").strip()
        raise RuntimeError(f"git ls-files failed: {detail or 'unknown error'}")
    try:
        output = completed.stdout.decode("utf-8")
    except UnicodeDecodeError as error:
        raise RuntimeError(f"git ls-files returned a non-UTF-8 path: {error}") from error
    return sorted(
        PurePosixPath(path) for path in output.split("\0") if path
    )


def counterpart_stem(stem: str) -> str:
    """Return the other-language page name without changing the English URL."""
    return stem.removesuffix(CHINESE_SUFFIX) if stem.endswith(CHINESE_SUFFIX) else stem + CHINESE_SUFFIX


def heading_depths(lines: list[str]) -> list[int]:
    """Return heading depths outside fenced code blocks in source order."""
    depths: list[int] = []
    fence: str | None = None
    fence_length = 0
    for line in lines:
        marker = FENCE_PATTERN.match(line)
        if marker:
            run = marker.group(1)
            if fence is None:
                fence = run[0]
                fence_length = len(run)
            elif run[0] == fence and len(run) >= fence_length:
                fence = None
                fence_length = 0
            continue
        if fence is None and (heading := HEADING_PATTERN.match(line)):
            depths.append(len(heading.group(1)))
    return depths


def link_targets(lines: list[str], start_line: int = 1) -> list[tuple[int, str]]:
    """Return inline Markdown link destinations outside fenced code blocks."""
    links: list[tuple[int, str]] = []
    fence: str | None = None
    fence_length = 0
    for line_number, line in enumerate(lines, start=start_line):
        marker = FENCE_PATTERN.match(line)
        if marker:
            run = marker.group(1)
            if fence is None:
                fence = run[0]
                fence_length = len(run)
            elif run[0] == fence and len(run) >= fence_length:
                fence = None
                fence_length = 0
            continue
        if fence is not None:
            continue
        for match in LINK_PATTERN.finditer(line):
            destination = match.group(1).strip()
            if destination.startswith("<") and destination.endswith(">"):
                destination = destination[1:-1].strip()
            links.append((line_number, destination))
    return links


def validate_links(
    path: PurePosixPath,
    lines: list[str],
    page_stems: set[str],
    errors: list[str],
    start_line: int = 1,
) -> None:
    """Validate bare cross-page links while allowing local anchors and URLs."""
    for line_number, raw_target in link_targets(lines, start_line):
        target = unquote(raw_target)
        if target.startswith("#"):
            continue
        parsed = urlsplit(target)
        if parsed.scheme.lower() in EXTERNAL_SCHEMES or parsed.netloc:
            continue
        page_target = parsed.path
        if page_target.endswith(".md"):
            errors.append(
                f"{path}:{line_number}: cross-page link must omit .md: {raw_target}"
            )
            continue
        if page_target not in page_stems:
            errors.append(
                f"{path}:{line_number}: cross-page link target does not exist: {raw_target}"
            )
        elif (
            page_target != counterpart_stem(path.stem)
            and page_target.endswith(CHINESE_SUFFIX) != path.stem.endswith(CHINESE_SUFFIX)
        ):
            errors.append(
                f"{path}:{line_number}: cross-page link must stay in the same language: {raw_target}"
            )


def local_link_stems(lines: list[str]) -> set[str]:
    """Return local page destinations, excluding URLs and same-page anchors."""
    linked: set[str] = set()
    for _, target in link_targets(lines):
        parsed = urlsplit(unquote(target))
        if target.startswith("#") or parsed.scheme or parsed.netloc:
            continue
        linked.add(parsed.path)
    return linked


def validate_home_links(
    path: PurePosixPath, lines: list[str], other_stems: set[str], errors: list[str]
) -> None:
    """Require each Home page to navigate to every page in its own language."""
    for stem in sorted(other_stems - local_link_stems(lines)):
        errors.append(f"{path}: missing link to {stem}")


def main() -> int:
    """Validate paired language files, structure, links, and navigation."""
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
    root = repository_root()
    errors: list[str] = []
    try:
        tracked = tracked_wiki_paths(root)
    except RuntimeError as error:
        print(f"check-wiki: {error}", file=sys.stderr)
        return 1

    nested = [
        path for path in tracked if path.suffix == ".md" and len(path.parts) != 2
    ]
    for path in nested:
        errors.append(f"{path}: nested Markdown pages are not allowed")

    pages = [
        path
        for path in tracked
        if path.suffix == ".md" and len(path.parts) == 2
    ]
    if not pages:
        errors.append("wiki: no tracked Markdown pages found")

    page_stems = {path.stem for path in pages}
    lines_by_path: dict[PurePosixPath, list[str]] = {}
    for path in pages:
        if not (root / path).is_file():
            errors.append(f"{path}: tracked page is missing from the working tree")
            continue
        lines = (root / path).read_text(encoding="utf-8").splitlines()
        lines_by_path[path] = lines
        for marker in sorted(LEGACY_MARKERS.intersection(lines)):
            errors.append(f"{path}: legacy language marker {marker!r}; use separate files")
        counterpart = counterpart_stem(path.stem)
        if counterpart not in page_stems:
            errors.append(f"{path}: missing language counterpart: {counterpart}")
        if counterpart not in local_link_stems(lines):
            errors.append(f"{path}: missing language-switch link to {counterpart}")
        validate_links(path, lines, page_stems, errors)

    for path, english_lines in lines_by_path.items():
        if path.stem.endswith(CHINESE_SUFFIX):
            continue
        chinese_path = path.with_stem(counterpart_stem(path.stem))
        if chinese_path not in lines_by_path:
            continue
        english_depths = heading_depths(english_lines)
        chinese_depths = heading_depths(lines_by_path[chinese_path])
        if english_depths != chinese_depths:
            errors.append(
                f"{path}: heading-depth sequences differ from {chinese_path}: "
                f"English {english_depths}; Chinese {chinese_depths}"
            )

    for suffix in ("", CHINESE_SUFFIX):
        home = PurePosixPath(f"wiki/Home{suffix}.md")
        if home not in lines_by_path:
            errors.append(f"{home}: required page is missing")
        else:
            language_stems = {
                stem for stem in page_stems if stem.endswith(CHINESE_SUFFIX) == bool(suffix)
            }
            validate_home_links(home, lines_by_path[home], language_stems - {home.stem}, errors)

    if errors:
        for error in sorted(errors):
            print(f"check-wiki: {error}", file=sys.stderr)
        return 1
    print(f"check-wiki: ok ({len(pages)} pages)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
