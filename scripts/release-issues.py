#!/usr/bin/env python3
"""Render issues proven closed by non-reverted commits in an exact Git range.

Ported from SonicTerm's scripts/release-issues.py. Python 3 stdlib only; GitHub
is reached exclusively through the `gh` CLI (authenticated via GH_TOKEN). Any
incomplete or ambiguous provenance fails closed, so release notes are never
published with a silently empty or wrong "Resolved issues" section.
"""

import argparse
from dataclasses import dataclass
from datetime import datetime
import html
import json
import os
from pathlib import Path
import re
import signal
import subprocess
import sys
import threading
import time


DEFAULT_REPO = "D0n9X1n/hexo-blog-encrypt"


class Failure(RuntimeError):
    """Incomplete or ambiguous provenance must block release-note publication."""


@dataclass
class Limits:
    """Hard ceilings also bound retries, pagination, and first-release traversal."""
    max_requests: int = 1000
    max_pages: int = 20
    max_commits: int = 2000
    max_output: int = 4 * 1024 * 1024
    max_total_output: int = 32 * 1024 * 1024
    # Seconds for the whole collection. max_requests attempts at a slow but normal 0.75 s each fit, so the attempt cap ends a large range.
    deadline: float = 900
    request_timeout: float = 15
    retry_delay: float = 1


def require(condition, message):
    if not condition:
        raise Failure(message)


def repository(value):
    require(isinstance(value, str) and re.fullmatch(
        r"[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})/[A-Za-z0-9_.-]{1,100}", value)
        and value.split("/")[1] not in (".", ".."), "invalid owner/repo")
    return value


def number(value):
    require(type(value) is int and 0 < value <= 2147483647, "invalid issue/PR number")
    return value


def oid(value):
    require(isinstance(value, str) and re.fullmatch(r"[0-9a-f]{40}", value), "invalid commit oid")
    return value


def timestamp(value):
    """Require timezone-qualified closure dates without inferring missing provenance."""
    require(isinstance(value, str), "missing manual closure provenance timestamp")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as error:
        raise Failure("invalid closure provenance timestamp") from error
    require(parsed.tzinfo is not None, "closure provenance timestamp needs timezone")
    return parsed


def terminate(process):
    """Kill the owned child tree, including descendants holding captured pipes open."""
    if os.name == "nt":
        try:
            subprocess.run(["taskkill", "/PID", str(process.pid), "/T", "/F"],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=5)
        except (OSError, subprocess.TimeoutExpired):
            pass
    else:
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
    if process.poll() is None:
        process.kill()
    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired as error:
        raise Failure("child cleanup failed") from error


def capture(command, timeout, cap, cwd=None):
    """Bound captured bytes while reading, not after an unbounded communicate()."""
    try:
        process = subprocess.Popen(command, cwd=cwd, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                   start_new_session=os.name != "nt",
                                   creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if os.name == "nt" else 0)
    except OSError as error:
        raise Failure(f"cannot start {command[0]}: {error}") from error
    output = [bytearray(), bytearray()]
    exceeded = threading.Event()
    lock = threading.Lock()

    def drain(index, pipe):
        while True:
            chunk = pipe.read(8192)
            if not chunk:
                break
            with lock:
                if sum(map(len, output)) + len(chunk) > cap:
                    exceeded.set()
                    return
                output[index].extend(chunk)

    readers = [threading.Thread(target=drain, args=(index, pipe), daemon=True)
               for index, pipe in enumerate((process.stdout, process.stderr))]
    for reader in readers:
        reader.start()
    end = time.monotonic() + timeout
    completed = False
    try:
        while process.poll() is None or any(reader.is_alive() for reader in readers):
            require(not exceeded.is_set(), "child output cap exceeded")
            if time.monotonic() >= end:
                raise TimeoutError("child request timeout")
            exceeded.wait(min(0.01, max(0, end - time.monotonic())))
        require(not exceeded.is_set(), "child output cap exceeded")
        result = process.returncode, *(bytes(data).decode("utf-8", errors="strict") for data in output)
        completed = True
        return result
    finally:
        if os.name != "nt" or not completed:
            terminate(process)
        for reader in readers:
            reader.join(timeout=1)
        # EOF or exceptional tree cleanup closes writers before buffered readers are closed.
        for pipe in (process.stdout, process.stderr):
            pipe.close()


class Api:
    """Cached, explicit-page gh transport with one aggregate deadline and budget."""
    def __init__(self, command=None, limits=None):
        self.command = command or ["gh"]
        self.limits = limits or Limits()
        self.end = time.monotonic() + self.limits.deadline
        self.requests = 0
        self.bytes = 0
        self.cache = {}

    def remaining(self):
        remaining = self.end - time.monotonic()
        require(remaining > 0, "collector deadline exceeded")
        return remaining

    def request(self, endpoint, fields=None):
        key = (endpoint, tuple(sorted((fields or {}).items())))
        if key in self.cache:
            return self.cache[key]
        command = self.command + ["api", endpoint, "--include", "--hostname", "github.com"]
        for key_name, value in (fields or {}).items():
            command += ["-F" if key_name == "number" else "-f", f"{key_name}={value}"]
        for attempt in range(3):
            require(self.requests < self.limits.max_requests, "API request cap exceeded")
            self.requests += 1
            transient = False
            try:
                code, raw, stderr = capture(command, min(self.limits.request_timeout, self.remaining()),
                                            self.limits.max_output)
                if code != 0 and not raw.startswith("HTTP/") and re.search(
                        r"timed out|timeout|deadline exceeded", stderr, re.I):
                    raise TimeoutError("gh transport timeout")
            except TimeoutError:
                transient, reason = True, "API request timeout"
            else:
                self.bytes += len(raw.encode()) + len(stderr.encode())
                require(self.bytes <= self.limits.max_total_output, "API aggregate output cap exceeded")
                # --include gives one status/header block for exactly one explicit page.
                header, separator, body = raw.replace("\r\n", "\n").partition("\n\n")
                match = re.match(r"HTTP/\S+ (\d{3})(?:\s|$)", header)
                require(match is not None and separator, "invalid API response headers/schema")
                status, headers = int(match[1]), header.lower()
                try:
                    data = json.loads(body)
                except (ValueError, RecursionError) as error:
                    if status == 429 or 500 <= status <= 599:
                        data = {}  # Gateway errors need no valid metadata body to retry.
                    else:
                        raise Failure("invalid API JSON/schema") from error
                errors = data.get("errors") if isinstance(data, dict) else None
                require(errors is None or isinstance(errors, list), "invalid GraphQL error schema")
                message = data.get("message", "") if isinstance(data, dict) else ""
                rate = (status in (403, 429) and bool(re.search(
                    r"rate.?limit|secondary rate|abuse detection", str(message), re.I)))
                graph_rate = bool(errors) and all(isinstance(graph_error, dict) and graph_error.get("type") == "RATE_LIMITED" for graph_error in errors)
                transient = status == 429 or 500 <= status <= 599 or rate or graph_rate
                reason = f"API failure HTTP {status}" + (" rate limit" if rate or graph_rate else "")
                if not transient:
                    require(code == 0 and 200 <= status < 300 and not errors, reason + " (auth/metadata/schema)")
                    self.cache[key] = (data, 'rel="next"' in headers)
                    return self.cache[key]
            if attempt == 2:
                raise Failure(reason + "; retries exhausted")
            delay = self.limits.retry_delay * (attempt + 1)
            require(self.remaining() > delay, "collector deadline exceeded before retry")
            time.sleep(delay)
        raise Failure("unreachable retry state")

    def associated(self, repo, sha):
        result = set()
        for page in range(1, self.limits.max_pages + 1):
            data, more = self.request(f"repos/{repo}/commits/{sha}/pulls?per_page=100&page={page}")
            require(isinstance(data, list), "invalid commit association schema")
            for item in data:
                result.add(number(item["number"]))
            if not more:
                return result
        raise Failure("commit association page cap exceeded")

    def nodes(self, repo, item_number, kind):
        """Page a PR's closing relationships or an issue's immutable closure events."""
        owner, name = repo.split("/")
        if kind == "pr":
            query = '''query ReleasePullRequest($owner:String!,$name:String!,$number:Int!,$cursor:String) {
              repository(owner:$owner,name:$name) { pullRequest(number:$number) {
                number merged mergeCommit { oid } repository { nameWithOwner }
                closingIssuesReferences(first:100,after:$cursor) {
                  nodes { number repository { nameWithOwner } } pageInfo { hasNextPage endCursor }
                }
              } }
            }'''
            field, connection_name = "pullRequest", "closingIssuesReferences"
        else:
            query = '''query ReleaseIssue($owner:String!,$name:String!,$number:Int!,$cursor:String) {
              repository(owner:$owner,name:$name) { issueOrPullRequest(number:$number) {
                __typename ... on PullRequest { number }
                ... on Issue { number title state closedAt repository { nameWithOwner }
                  timelineItems(first:100,after:$cursor,itemTypes:[CLOSED_EVENT]) {
                    nodes { __typename ... on ClosedEvent { createdAt closer {
                      __typename ... on PullRequest { number merged mergeCommit { oid } repository { nameWithOwner } }
                      ... on Commit { oid repository { nameWithOwner } }
                    } } } pageInfo { hasNextPage endCursor }
                  }
                }
              } }
            }'''
            field, connection_name = "issueOrPullRequest", "timelineItems"
        cursor, seen, nodes, identity = None, set(), [], None
        for _ in range(self.limits.max_pages):
            fields = dict(query=query, owner=owner, name=name, number=str(item_number))
            if cursor is not None:
                fields["cursor"] = cursor
            data, _ = self.request("graphql", fields)
            item = data["data"]["repository"][field]
            require(isinstance(item, dict), f"unavailable {kind} metadata for {repo}#{item_number}")
            require(number(item["number"]) == item_number, "mismatched metadata identity")
            if kind == "issue" and item.get("__typename") == "PullRequest":
                return item, []
            require(repository(item["repository"]["nameWithOwner"]).lower() == repo.lower(), "mismatched repository identity")
            require(kind == "pr" or item.get("__typename") == "Issue", "invalid issue type")
            current = {key: value for key, value in item.items() if key != connection_name}
            require(identity is None or identity == current, "metadata changed during pagination")
            identity = current
            connection = item[connection_name]
            require(isinstance(connection["nodes"], list), "invalid connection nodes")
            nodes.extend(connection["nodes"])
            info = connection["pageInfo"]
            require(type(info["hasNextPage"]) is bool, "invalid pageInfo")
            if not info["hasNextPage"]:
                return identity, nodes
            cursor = info["endCursor"]
            require(isinstance(cursor, str) and cursor and len(cursor) <= 1024 and cursor not in seen,
                    "invalid/repeated pagination cursor")
            seen.add(cursor)
        raise Failure(f"{kind} page cap exceeded")


REFERENCE = (r"(?:https://github\.com/(?P<url_repo>[A-Za-z0-9-]+/[A-Za-z0-9_.-]+)/issues/"
             r"(?P<url_number>[1-9][0-9]*)|(?:(?P<repo>[A-Za-z0-9-]+/[A-Za-z0-9_.-]+))?"
             r"#(?P<number>[1-9][0-9]*))\b")
CLOSING = re.compile(r"\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+" + REFERENCE, re.I)
CONTINUATION = re.compile(r"\s*(?:,\s*(?:and\s+)?|and\s+)" + REFERENCE, re.I)


def closing_references(message, repo):
    """Keywords nominate candidates; Refs, mentions, and PR numbers prove nothing."""
    result = set()
    for match in CLOSING.finditer(message):
        while match:
            result.add((repository(match["repo"] or match["url_repo"] or repo),
                        number(int(match["number"] or match["url_number"]))))
            match = CONTINUATION.match(message, match.end())
    return result


def collect(repo, head, base="", api=None, cwd=None):
    """Use closure commit ancestry rather than present-day state or milestone membership."""
    repo = repository(repo)
    api = api or Api()

    def git(*args, allow_failure=False):
        code, out, _ = capture(["git", *args], min(15, api.remaining()), api.limits.max_output, cwd)
        require(code == 0 or allow_failure, f"Git range/provenance failure: {args[0]}")
        return out.strip() if code == 0 else None

    head = oid(git("rev-parse", "--verify", "--end-of-options", f"{head}^{{commit}}"))
    base = oid(git("rev-parse", "--verify", "--end-of-options", f"{base}^{{commit}}")) if base else ""
    if base:
        require(git("merge-base", "--is-ancestor", base, head, allow_failure=True) is not None,
                "base is not an ancestor of head")
    commits = git("rev-list", "--topo-order", f"--max-count={api.limits.max_commits + 1}",
                  f"{base}..{head}" if base else head).splitlines()
    require(len(commits) <= api.limits.max_commits, "commit range cap exceeded")
    included = set(commits)
    messages, parents, reverts = {}, {}, {}
    for sha in commits:
        messages[sha] = git("show", "-s", "--format=%B", sha)
        parents[sha] = git("show", "-s", "--format=%P", sha).split()
        markers = re.findall(r"^This reverts commit ([0-9a-f]{40})(?:\.|, reversing)$", messages[sha], re.M)
        require(len(markers) <= 1, "ambiguous canonical revert provenance")
        if markers:
            target = markers[0]
            require(parents[sha] and git("merge-base", "--is-ancestor", target, parents[sha][0], allow_failure=True) is not None,
                    "canonical revert target is not an ancestor")
            reverts[sha] = target
    disabled = set()

    def effects(revert, target):
        # Undoing a revert disables that operation; its original target stays active.
        result = {target}
        target_parents = parents.get(target, [])
        if len(target_parents) > 1:
            mainlines = re.findall(r"^changes made to ([0-9a-f]{40})\.$", messages[revert], re.M)
            require(len(mainlines) == 1 and mainlines[0] in target_parents,
                    "ambiguous merge revert mainline provenance")
            introduced = git("rev-list", f"{mainlines[0]}..{target}").splitlines()
            result.update(introduced)
        return result & included

    for sha in commits:  # Reverse topological order visits undo operations first.
        if sha in reverts and sha not in disabled:
            disabled.symmetric_difference_update(effects(sha, reverts[sha]))
    active = included - disabled
    candidates, pulls = set(), {}
    for sha in commits:
        for pull_number in api.associated(repo, sha):
            pulls.setdefault(pull_number, set()).add(sha)
        if sha in active:
            candidates.update(closing_references(messages[sha], repo))
    reverted_pulls = {pull_number for pull_number, shas in pulls.items() if shas & disabled}
    for pull_number in sorted(pulls):
        pull_request, links = api.nodes(repo, pull_number, "pr")
        require(type(pull_request["merged"]) is bool, "invalid PR merged state")
        if not pull_request["merged"]:
            continue
        merge = oid(pull_request["mergeCommit"]["oid"])
        if merge not in active or pull_number in reverted_pulls:
            continue
        for issue in links:
            candidates.add((repository(issue["repository"]["nameWithOwner"]), number(issue["number"])))
    # GitHub repository identity is case insensitive, including direct references.
    candidates = {(name.lower(), issue_number) for name, issue_number in candidates}
    selected, manual = [], []
    head_date = timestamp(git("show", "-s", "--format=%cI", head))
    base_date = timestamp(git("show", "-s", "--format=%cI", base)) if base else None
    for issue_repo, issue_number in sorted(candidates):
        if issue_repo == repo.lower():
            issue_repo = repo
        issue, events = api.nodes(issue_repo, issue_number, "issue")
        if issue["__typename"] == "PullRequest":
            continue
        require(isinstance(issue["title"], str) and issue["title"].strip(), "invalid issue title")
        closure_commits, manual_dates = [], []
        for event in events:
            require(isinstance(event, dict) and event.get("__typename") == "ClosedEvent", "invalid closure event schema")
            closer = event["closer"]
            if closer is None:
                manual_dates.append(timestamp(event.get("createdAt")))
                continue
            require(isinstance(closer, dict), f"ambiguous closure provenance for {issue_repo}#{issue_number}")
            closer_repo = repository(closer["repository"]["nameWithOwner"])
            if closer["__typename"] == "Commit":
                sha = oid(closer["oid"])
            elif closer["__typename"] == "PullRequest":
                closer_number = number(closer["number"])
                require(closer["merged"] is True, "unmerged closure provenance")
                sha = oid(closer["mergeCommit"]["oid"])
                if closer_repo.lower() == repo.lower() and closer_number in reverted_pulls:
                    continue
            else:
                raise Failure("unknown closure provenance")
            if closer_repo.lower() == repo.lower():
                closure_commits.append(sha)
        # A prior shipped closure is not newly delivered merely because links changed.
        prior = any(sha not in included and base and git("merge-base", "--is-ancestor", sha, base,
                    allow_failure=True) is not None for sha in closure_commits)
        manual_date = None
        if manual_dates:
            require(issue.get("state") in ("OPEN", "CLOSED"), "invalid manual closure state")
            if issue["state"] == "CLOSED":
                closed_at = timestamp(issue.get("closedAt"))
                # GitHub's issue and event timestamps may differ by one second.
                matching = [date for date in manual_dates if abs((date - closed_at).total_seconds()) <= 1]
                require(len(matching) <= 1, "ambiguous current manual closure")
                if matching and (base_date is None or base_date < matching[0]) and matching[0] <= head_date:
                    manual_date = matching[0]
        title = " ".join(issue["title"].split())
        title = re.sub(r"([\\`*_{}\[\]()#+.!|~-])", r"\\\1", html.escape(title, quote=False))
        label = f"#{issue_number}" if issue_repo.lower() == repo.lower() else f"{issue_repo}#{issue_number}"
        entry = f"- [{label}](https://github.com/{issue_repo}/issues/{issue_number}) — {title}"
        if not prior and any(sha in active for sha in closure_commits):
            selected.append(entry)
        elif not prior and manual_date is not None:
            manual.append(f"{entry} (closed {manual_date.isoformat().replace('+00:00', 'Z')})")
    notes = "## Resolved issues\n\n" + ("\n".join(selected) if selected else "No linked issues resolved in this release range.") + "\n"
    if manual:
        notes += ("\n## Manually closed issues (unverified release linkage)\n\n"
                  "These issues were nominated by changes in this range and manually closed during its commit-date window. "
                  "GitHub records no closing commit or PR for those events; they are not verified as resolved by this release.\n\n"
                  + "\n".join(manual) + "\n")
    return notes


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", default=DEFAULT_REPO,
                        help=f"GitHub owner/repo (not a local directory); default {DEFAULT_REPO}")
    parser.add_argument("--head", required=True, help="exact release commit or tag; no tag creation required")
    parser.add_argument("--base", default="", help="exclusive ancestor commit/tag; omit for first release")
    args = parser.parse_args()
    try:
        notes = collect(args.repo, args.head, args.base, cwd=Path.cwd())
    except (Failure, KeyError, TypeError, ValueError, TimeoutError, RecursionError) as error:
        print(f"release issue lookup failed: {error}", file=sys.stderr)
        return 1
    print(notes, end="")
    return 0


if __name__ == "__main__":
    sys.exit(main())
