#!/usr/bin/env python3
"""Offline release provenance tests use real Git histories and a fake gh process.

Ported from SonicTerm's scripts/release-issues_tests.py. Run directly:
    python3 scripts/release-issues_tests.py
(`unittest discover` cannot import the hyphenated filename and finds no tests.)
"""
import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("release_issues", ROOT / "release-issues.py")
release = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(release)

# The transport is a real child process: malformed output, exit status, and pagination
# exercise the same bounded gh boundary as production rather than mocking its parser.
FAKE_GH = r'''
import json, os, pathlib, sys, time
args = sys.argv[1:]
fixture = json.loads(pathlib.Path(os.environ["FAKE_GH_FIXTURE"]).read_text())
fields = {}
for i, arg in enumerate(args):
    if arg in ("-f", "-F"):
        key, value = args[i+1].split("=", 1)
        fields[key] = value
endpoint = args[1]
if endpoint == "graphql":
    kind = "pr" if "ReleasePullRequest" in fields["query"] else "issue"
    key = kind + ":" + fields["owner"] + "/" + fields["name"] + ":" + fields["number"] + ":" + fields.get("cursor", "")
else:
    key = endpoint
log = pathlib.Path(os.environ["FAKE_GH_LOG"])
prior = log.read_text().splitlines() if log.exists() else []
with log.open("a") as out:
    out.write(key + "\n")
response = fixture.get(key, {"status": 404, "body": {"message":"missing fixture " + key}})
if isinstance(response, list):
    response = response[min(prior.count(key), len(response)-1)]
if response.get("sleep"):
    time.sleep(response["sleep"])
if "raw" in response:
    print(response["raw"])
else:
    status = response.get("status", 200)
    print("HTTP/2.0", status)
    if response.get("next"):
        print('Link: <https://api.github.com/next>; rel="next"')
    print()
    print(json.dumps(response.get("body")))
sys.exit(response.get("exit", int(response.get("status", 200) >= 400)))
'''


def connection(nodes, cursor=None):
    return {"nodes": nodes, "pageInfo": {"hasNextPage": cursor is not None, "endCursor": cursor}}


def commit_closer(sha, repo="owner/repo"):
    return {"__typename": "Commit", "oid": sha, "repository": {"nameWithOwner": repo}}


def pr_closer(number, sha, repo="owner/repo"):
    return {"__typename": "PullRequest", "number": number, "merged": True,
            "mergeCommit": {"oid": sha}, "repository": {"nameWithOwner": repo}}


@unittest.skipUnless(os.name == "nt", "Windows capture cleanup boundary")
class WindowsCaptureCleanupTests(unittest.TestCase):
    def test_complete_child_and_eof_do_not_terminate(self):
        # A real completed child with both streams drained needs no destructive tree cleanup.
        command = [sys.executable, "-c", "print('RELEASE_CAPTURE_COMPLETE', flush=True)"]
        with patch.object(release, "terminate", wraps=release.terminate) as terminate:
            code, output, error = release.capture(command, 10, 4096)
        self.assertEqual(code, 0)
        self.assertEqual(output.splitlines(), ["RELEASE_CAPTURE_COMPLETE"])
        self.assertEqual(error, "")
        terminate.assert_not_called()

    def test_invalid_utf8_still_terminates_completed_child(self):
        # Strict decoding failure remains exceptional cleanup even after the real child exited and both streams reached EOF.
        command = [sys.executable, "-c", "import sys; sys.stdout.buffer.write(bytes([255])); sys.stdout.flush()"]
        with patch.object(release, "terminate", wraps=release.terminate) as terminate:
            with self.assertRaises(UnicodeDecodeError):
                release.capture(command, 10, 4096)
        terminate.assert_called_once()
        self.assertEqual(terminate.call_args.args[0].returncode, 0)

    def test_timeout_still_terminates_and_waits_for_child(self):
        # Successful-path optimization must not remove the real timeout cleanup or reaping.
        command = [sys.executable, "-c", "import time; time.sleep(30)"]
        with patch.object(release, "terminate", wraps=release.terminate) as terminate:
            with self.assertRaisesRegex(TimeoutError, "child request timeout"):
                release.capture(command, 0.2, 4096)
        terminate.assert_called_once()
        process = terminate.call_args.args[0]
        self.assertIsNotNone(process.returncode)
        self.assertIsNotNone(process.poll())

    def test_output_overflow_still_terminates_and_waits_for_child(self):
        # A live child exceeding the cap must still be killed and reaped, not mistaken for complete EOF.
        command = [sys.executable, "-c",
                   "import sys,time; sys.stdout.write('X' * 8192); sys.stdout.flush(); time.sleep(30)"]
        with patch.object(release, "terminate", wraps=release.terminate) as terminate:
            with self.assertRaisesRegex(release.Failure, "child output cap exceeded"):
                release.capture(command, 10, 1024)
        terminate.assert_called_once()
        process = terminate.call_args.args[0]
        self.assertIsNotNone(process.returncode)
        self.assertIsNotNone(process.poll())


class CliTests(unittest.TestCase):
    def run_main(self, argv, collect):
        stdout, stderr = io.StringIO(), io.StringIO()
        with patch.object(sys, "argv", ["release-issues.py", *argv]), \
                patch.object(release, "collect", side_effect=collect) as mocked, \
                contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            code = release.main()
        return code, mocked, stdout.getvalue(), stderr.getvalue()

    def test_repo_defaults_to_this_repository(self):
        code, mocked, stdout, _ = self.run_main(["--head", "v1.0.0"], lambda *a, **k: "## Resolved issues\n")
        self.assertEqual(code, 0)
        self.assertEqual(release.DEFAULT_REPO, "D0n9X1n/hexo-blog-encrypt")
        self.assertEqual(mocked.call_args.args[:3], ("D0n9X1n/hexo-blog-encrypt", "v1.0.0", ""))
        self.assertEqual(stdout, "## Resolved issues\n")

    def test_explicit_repo_and_base_are_forwarded(self):
        _, mocked, _, _ = self.run_main(["--repo", "owner/repo", "--head", "h", "--base", "b"], lambda *a, **k: "")
        self.assertEqual(mocked.call_args.args[:3], ("owner/repo", "h", "b"))

    def test_failure_exits_nonzero_without_notes(self):
        def fail(*_args, **_kwargs):
            raise release.Failure("API failure HTTP 401")
        code, _, stdout, stderr = self.run_main(["--head", "h"], fail)
        self.assertEqual(code, 1)
        self.assertEqual(stdout, "")
        self.assertIn("release issue lookup failed: API failure HTTP 401", stderr)


class LimitsTests(unittest.TestCase):
    def test_attempt_cap_binds_before_the_aggregate_deadline(self):
        # A large range must end at max_requests, not at the clock: every allowed attempt at a slow
        # but normal 0.75 s gh latency still fits inside the aggregate deadline.
        limits = release.Limits()
        slow_attempt_s = 0.75
        self.assertGreaterEqual(limits.deadline, limits.max_requests * slow_attempt_s)


class ProvenanceTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix="release-issues-")
        self.addCleanup(self.tmp.cleanup)
        self.path = Path(self.tmp.name)
        self.git("init", "-q")
        self.base = self.commit("initial")
        self.fixture = {}
        self.fake = self.path / "fake_gh.py"
        self.fake.write_text(FAKE_GH)
        self.fixture_path = self.path / "fixture.json"
        self.log = self.path / "gh.log"
        self.env = {"FAKE_GH_FIXTURE": str(self.fixture_path), "FAKE_GH_LOG": str(self.log)}
        self.old = {key: os.environ.get(key) for key in self.env}
        os.environ.update(self.env)
        self.addCleanup(self.restore_env)

    def restore_env(self):
        for key, value in self.old.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value

    def git(self, *args):
        env = dict(os.environ, GIT_AUTHOR_NAME="Test", GIT_AUTHOR_EMAIL="test@example.invalid",
                   GIT_COMMITTER_NAME="Test", GIT_COMMITTER_EMAIL="test@example.invalid")
        return subprocess.check_output(["git", *args], cwd=self.path, env=env, text=True).strip()

    def commit(self, message):
        self.git("-c", "commit.gpgsign=false", "commit", "--allow-empty", "-qm", message)
        return self.git("rev-parse", "HEAD")

    def association(self, sha, numbers=(), page=1, next_page=False):
        self.fixture[f"repos/owner/repo/commits/{sha}/pulls?per_page=100&page={page}"] = {
            "body": [{"number": pull_number} for pull_number in numbers], "next": next_page}

    def pull_request(self, number, sha, issues, cursor="", next_cursor=None, merged=True):
        self.fixture[f"pr:owner/repo:{number}:{cursor}"] = {"body": {"data": {"repository": {
            "pullRequest": {"number": number, "merged": merged, "mergeCommit": {"oid": sha},
                            "repository": {"nameWithOwner": "owner/repo"},
                            "closingIssuesReferences": connection([
                                {"number": issue_number, "repository": {"nameWithOwner": "owner/repo"}}
                                for issue_number in issues], next_cursor)}}}}}

    def issue(self, number, closers, title=None, cursor="", next_cursor=None, typename="Issue"):
        self.fixture[f"issue:owner/repo:{number}:{cursor}"] = {"body": {"data": {"repository": {
            "issueOrPullRequest": {"__typename": typename, "number": number,
                "title": title or f"Issue {number}", "repository": {"nameWithOwner": "owner/repo"},
                "timelineItems": connection([{"__typename": "ClosedEvent", "closer": closer} for closer in closers], next_cursor)}}}}}

    def collect(self, head=None, base=None, limits=None):
        self.fixture_path.write_text(json.dumps(self.fixture))
        api = release.Api(command=[sys.executable, str(self.fake)], limits=limits)
        return release.collect("owner/repo", head or self.git("rev-parse", "HEAD"),
                               self.base if base is None else base, api=api, cwd=self.path)

    def test_merge_multiple_dedup_and_graphql_closer(self):
        # Merge commits, not just displayed nonmerge subjects, carry shipped closure.
        self.git("checkout", "-qb", "topic")
        feature = self.commit("fix: feature")
        self.git("checkout", "-q", "-")
        self.commit("main advance")
        self.git("-c", "commit.gpgsign=false", "merge", "--no-ff", "-qm", "merge", "topic")
        head = self.git("rev-parse", "HEAD")
        for sha in self.git("rev-list", f"{self.base}..{head}").splitlines():
            self.association(sha, [1342])
        self.pull_request(1342, head, [1339, 1340, 1341])
        for issue_number in (1339, 1340, 1341):
            self.issue(issue_number, [pr_closer(1342, head)])
        notes = self.collect()
        for issue_number in (1339, 1340, 1341):
            self.assertEqual(notes.count(f"[#{issue_number}]"), 1)
        self.assertIn("/owner/repo/issues/1339", notes)
        self.assertEqual(self.log.read_text().splitlines().count("pr:owner/repo:1342:"), 1)
        self.assertIn(feature, self.git("rev-list", head))

    def test_squash_and_rebase(self):
        # Actual squash/rebase histories close through mergeCommit, not old topic SHAs.
        main_branch = self.git("branch", "--show-current")
        for mode in ("squash", "rebase"):
            with self.subTest(mode=mode):
                boundary = self.git("rev-parse", "HEAD")
                self.git("checkout", "-qb", mode)
                self.commit(f"{mode} part one")
                self.commit(f"{mode} part two")
                self.git("checkout", "-q", main_branch)
                if mode == "squash":
                    self.git("merge", "--squash", mode)
                    last = self.commit("squashed feature")
                else:
                    self.commit("advance main")
                    self.git("checkout", "-q", mode)
                    self.git("-c", "commit.gpgsign=false", "rebase", "--empty=keep", main_branch)
                    self.git("checkout", "-q", main_branch)
                    self.git("merge", "--ff-only", mode)
                    last = self.git("rev-parse", "HEAD")
                for sha in self.git("rev-list", f"{boundary}..{last}").splitlines():
                    self.association(sha, [42])
                self.pull_request(42, last, [7])
                self.issue(7, [pr_closer(42, last)])
                self.assertIn("[#7]", self.collect(base=boundary))

    def test_direct_keywords_mentions_identity_and_prior(self):
        # A keyword nominates a candidate; only a same-range closing event proves it.
        head = self.commit("Fixes #1, closes #2; resolves owner/repo#3\nRefs #4\nCloses #5\nFixes #6")
        self.association(head)
        self.issue(1, [commit_closer(head)])
        self.issue(2, [commit_closer(head)])
        self.issue(3, [commit_closer(head)])
        self.issue(5, [], typename="PullRequest")
        self.issue(6, [commit_closer(self.base)])
        notes = self.collect()
        for issue_number in (1, 2, 3):
            self.assertIn(f"[#{issue_number}]", notes)
        for issue_number in (4, 5, 6):
            self.assertNotIn(f"[#{issue_number}]", notes)

    def test_pr_merges_outside_range_and_prior_reclosures_are_not_new(self):
        # An association is only a hint, including later merges and repeated closures.
        head = self.commit("Fixes #1")
        self.association(head, [42, 43])
        self.pull_request(42, self.base, [2])
        self.pull_request(43, "f" * 40, [3])
        self.issue(1, [commit_closer(self.base), commit_closer(head)])
        self.assertIn("No linked issues", self.collect())
        log = self.log.read_text()
        self.assertNotIn("issue:owner/repo:2:", log)
        self.assertNotIn("issue:owner/repo:3:", log)

    def test_mutable_pr_links_do_not_prove_closure(self):
        # Editing a merged PR's links or closing an issue later cannot backdate a fix.
        head = self.commit("fix")
        self.association(head, [42])
        self.pull_request(42, head, [1, 2])
        self.issue(1, [commit_closer(self.base)])
        self.issue(2, [commit_closer("f" * 40)])
        self.assertIn("No linked issues", self.collect())

    def test_canonical_revert_and_revert_of_revert(self):
        # Canonical Git markers cancel fixes; reversing that revert restores them.
        fix = self.commit("Fixes #1")
        revert = self.commit(f'Revert "fix"\n\nThis reverts commit {fix}.')
        self.association(fix)
        self.association(revert)
        self.issue(1, [commit_closer(fix)])
        self.assertIn("No linked issues", self.collect())
        restore = self.commit(f'Revert "revert"\n\nThis reverts commit {revert}.')
        self.association(restore)
        self.assertIn("[#1]", self.collect())

    def test_merge_revert_cancels_introduced_commits(self):
        # Reverting a merge also removes direct-closing commits introduced by it.
        self.git("checkout", "-qb", "topic")
        fix = self.commit("Fixes #1")
        self.git("checkout", "-q", "-")
        self.git("-c", "commit.gpgsign=false", "merge", "--no-ff", "-qm", "merge", "topic")
        merge = self.git("rev-parse", "HEAD")
        revert = self.commit(f"revert merge\n\nThis reverts commit {merge}, reversing\nchanges made to {self.base}.")
        for sha in (fix, merge, revert):
            self.association(sha)
        self.issue(1, [commit_closer(fix)])
        self.assertIn("No linked issues", self.collect())

    def test_merge_revert_uses_recorded_mainline(self):
        # Git's reversing marker names the retained parent; it need not be parent one.
        fix = self.commit("Fixes #1")
        self.git("checkout", "-qb", "side", self.base)
        side = self.commit("side change")
        self.git("checkout", "-q", "-")
        self.git("-c", "commit.gpgsign=false", "merge", "--no-ff", "-qm", "merge", "side")
        merge = self.git("rev-parse", "HEAD")
        revert = self.commit(f"undo merge\n\nThis reverts commit {merge}, reversing\nchanges made to {side}.")
        for sha in (fix, side, merge, revert):
            self.association(sha)
        self.issue(1, [commit_closer(fix)])
        self.assertIn("No linked issues", self.collect())

    def test_partial_pr_revert_is_not_reported_as_shipped(self):
        # Reverting a rebased constituent must not leave the PR's final SHA claiming its fix.
        first = self.commit("feature first")
        last = self.commit("feature last")
        revert = self.commit(f"undo first\n\nThis reverts commit {first}.")
        self.association(first, [42])
        self.association(last, [42])
        self.association(revert)
        self.pull_request(42, last, [1])
        self.issue(1, [pr_closer(42, last)])
        self.assertIn("No linked issues", self.collect())

    def test_semantic_revert_is_not_inferred(self):
        # A prose-only revert title cannot identify which change was undone.
        fix = self.commit("Fixes #1")
        head = self.commit("Revert the thing because it broke")
        self.association(fix)
        self.association(head)
        self.issue(1, [commit_closer(fix)])
        self.assertIn("[#1]", self.collect())

    def test_first_release_and_empty_associations(self):
        # First-release selection includes every ancestor, without a 200-commit cutoff.
        self.association(self.base)
        self.assertIn("No linked issues", self.collect(base=""))

    def test_pagination_all_connections_and_hostile_titles(self):
        # All three connections page explicitly; titles never become links or shell code.
        head = self.commit("fix")
        self.association(head, [], next_page=True)
        self.association(head, [42], page=2)
        self.pull_request(42, head, [], next_cursor="next")
        self.pull_request(42, head, [1], cursor="next")
        title = '[evil](https://bad.invalid) `$(touch PWNED)` <img>\n## injected & \\ |'
        self.issue(1, [], title, next_cursor="later")
        self.issue(1, [pr_closer(42, head)], title, cursor="later")
        notes = self.collect()
        self.assertIn("[#1]", notes)
        self.assertNotIn("[evil](", notes)
        self.assertNotIn("<img>", notes)
        self.assertNotIn("\n## injected", notes)
        self.assertFalse((self.path / "PWNED").exists())
        self.assertEqual(len(self.log.read_text().splitlines()), 6)

    def test_manual_closure_is_disclosed_separately_within_release_dates(self):
        # A human close is date-bounded disclosure, never commit-linked resolution proof.
        with patch.dict(os.environ, GIT_COMMITTER_DATE="2026-09-01T00:00:00Z"):
            base = self.commit("release boundary")
        with patch.dict(os.environ, GIT_COMMITTER_DATE="2026-09-10T00:00:00Z"):
            head = self.commit("Fixes #1, closes #2, closes #3, closes #4")
        self.association(head)
        for issue_number, date in [(1, "2026-09-05T00:00:00Z"), (2, "2026-08-31T00:00:00Z"),
                        (3, "2026-09-11T00:00:00Z")]:
            self.issue(issue_number, [None], title="Manual [closure]")
            item = self.fixture[f"issue:owner/repo:{issue_number}:"]["body"]["data"]["repository"]["issueOrPullRequest"]
            item.update(state="CLOSED", closedAt=date)
            item["timelineItems"]["nodes"][0]["createdAt"] = date
        self.issue(4, [commit_closer(head)])
        notes = self.collect(head=head, base=base)
        verified, disclosed = notes.split("## Manually closed issues (unverified release linkage)")
        self.assertIn("[#4]", verified)
        self.assertNotIn("[#1]", verified)
        self.assertIn("[#1]", disclosed)
        self.assertIn("2026-09-05T00:00:00Z", disclosed)
        self.assertIn(r"Manual \[closure\]", disclosed)
        self.assertNotIn("[#2]", notes)
        self.assertNotIn("[#3]", notes)

    def test_manual_closure_needs_valid_metadata_and_current_closed_event(self):
        # Missing dates remain errors; reopened, prior-shipped, or non-current manual closures are not new disclosures.
        head = self.commit("Fixes #1")
        self.association(head)
        date = self.git("show", "-s", "--format=%cI", head)
        self.association(self.base)
        for state, closed, event_date, expected in [
            ("OPEN", None, date, False),
            ("CLOSED", date, "2000-01-01T00:00:00Z", False),
            ("CLOSED", date, date, True),
        ]:
            self.issue(1, [None])
            item = self.fixture["issue:owner/repo:1:"]["body"]["data"]["repository"]["issueOrPullRequest"]
            item.update(state=state, closedAt=closed)
            item["timelineItems"]["nodes"][0]["createdAt"] = event_date
            self.assertEqual("[#1]" in self.collect(base=""), expected)
        self.issue(1, [commit_closer(self.base), None])
        item = self.fixture["issue:owner/repo:1:"]["body"]["data"]["repository"]["issueOrPullRequest"]
        item.update(state="CLOSED", closedAt=date)
        item["timelineItems"]["nodes"][-1]["createdAt"] = date
        self.assertNotIn("[#1]", self.collect())
        for invalid in [None, "not-a-date", "2026-09-05T00:00:00"]:
            item["closedAt"] = invalid
            with self.assertRaises(release.Failure):
                self.collect()

    def test_manual_closure_timestamp_precision_and_ambiguity(self):
        # GitHub can stamp closedAt one second before the event, but multiple matches are ambiguous.
        with patch.dict(os.environ, GIT_COMMITTER_DATE="2026-09-10T00:00:00Z"):
            head = self.commit("Fixes #1")
        self.association(head)
        self.association(self.base)
        self.issue(1, [None])
        item = self.fixture["issue:owner/repo:1:"]["body"]["data"]["repository"]["issueOrPullRequest"]
        item.update(state="CLOSED", closedAt="2026-09-05T00:00:00Z")
        events = item["timelineItems"]["nodes"]
        events[0]["createdAt"] = "2026-09-05T00:00:01Z"
        self.assertIn("[#1]", self.collect(base=""))
        events.append(dict(events[0]))
        with self.assertRaisesRegex(release.Failure, "ambiguous"):
            self.collect(base="")

    def test_metadata_auth_schema_and_null_closer_fail(self):
        # Missing metadata and unknown provenance are errors, never empty successes.
        head = self.commit("Fixes #1")
        self.association(head)
        key = "issue:owner/repo:1:"
        for response in ({"status": 401, "body": {"message": "Bad credentials"}},
                         {"status": 404, "body": {"message": "Not Found"}},
                         {"body": {"data": {"repository": {"issueOrPullRequest": None}}}},
                         {"body": {"errors": [{"type": "FORBIDDEN", "message": "no access"}]}},
                         {"raw": "not JSON"}):
            with self.subTest(response=response):
                self.fixture[key] = response
                with self.assertRaises(release.Failure):
                    self.collect()
        self.issue(1, [None])
        with self.assertRaisesRegex(release.Failure, "provenance"):
            self.collect()

    def test_transient_retries_only_and_exhaustion(self):
        # HTTP throttling/server errors retry within bounds; auth fails immediately.
        head = self.commit("unlinked")
        key = f"repos/owner/repo/commits/{head}/pulls?per_page=100&page=1"
        limits = release.Limits(retry_delay=0)
        for status in (429, 500, 503):
            self.log.unlink(missing_ok=True)
            self.fixture[key] = [{"status": status, "body": {"message": "temporary"}}, {"body": []}]
            self.assertIn("No linked issues", self.collect(limits=limits))
            self.assertEqual(len(self.log.read_text().splitlines()), 2)
        self.fixture[key] = {"status": 403, "body": {"message": "API rate limit exceeded"}}
        self.log.unlink()
        with self.assertRaises(release.Failure):
            self.collect(limits=limits)
        self.assertEqual(len(self.log.read_text().splitlines()), 3)
        self.fixture[key] = {"status": 403, "body": {"message": "Forbidden"}}
        self.log.unlink()
        with self.assertRaises(release.Failure):
            self.collect(limits=limits)
        self.assertEqual(len(self.log.read_text().splitlines()), 1)

    def test_caps_timeout_and_repeated_cursor_fail(self):
        # Every resource ceiling aborts instead of publishing a partial issue list.
        head = self.commit("fix")
        key = f"repos/owner/repo/commits/{head}/pulls?per_page=100&page=1"
        self.association(head)
        for limits in (release.Limits(max_requests=0), release.Limits(max_output=8),
                       release.Limits(deadline=0), release.Limits(max_commits=0)):
            with self.subTest(limits=limits):
                with self.assertRaises(release.Failure):
                    self.collect(limits=limits)
        self.fixture[key] = {"sleep": 0.2, "body": []}
        with self.assertRaisesRegex(release.Failure, "timeout"):
            self.collect(limits=release.Limits(request_timeout=0.03, retry_delay=0))
        self.association(head, [42])
        self.pull_request(42, head, [], next_cursor="same")
        self.pull_request(42, head, [], cursor="same", next_cursor="same")
        with self.assertRaisesRegex(release.Failure, "cursor"):
            self.collect()

    def test_http_server_error_with_non_json_body_retries(self):
        # Gateways often return HTML for 5xx; retry classification must precede JSON parsing.
        head = self.commit("fix")
        key = f"repos/owner/repo/commits/{head}/pulls?per_page=100&page=1"
        self.fixture[key] = [{"raw": "HTTP/2.0 502 Bad Gateway\n\n<html>gateway down</html>", "exit": 1},
                             {"body": []}]
        self.assertIn("No linked issues", self.collect(limits=release.Limits(retry_delay=0)))
        self.assertEqual(len(self.log.read_text().splitlines()), 2)

    def test_direct_url_and_case_insensitive_dedup(self):
        # GitHub supports full issue URLs and repository names are case insensitive.
        head = self.commit("Fixes #1, OWNER/REPO#1\nCloses https://github.com/owner/repo/issues/2")
        self.association(head)
        self.issue(1, [commit_closer(head)])
        self.issue(2, [commit_closer(head)])
        notes = self.collect()
        self.assertEqual(notes.count("[#1]"), 1)
        self.assertIn("[#2]", notes)

    def test_every_page_and_aggregate_byte_cap(self):
        # Truncating any metadata connection must fail rather than hide its later items.
        head = self.commit("fix")
        self.association(head, [], next_page=True)
        with self.assertRaisesRegex(release.Failure, "page cap"):
            self.collect(limits=release.Limits(max_pages=1))
        self.association(head, [42])
        self.pull_request(42, head, [], next_cursor="next")
        with self.assertRaisesRegex(release.Failure, "page cap"):
            self.collect(limits=release.Limits(max_pages=1))
        self.pull_request(42, head, [1])
        self.issue(1, [], next_cursor="next")
        with self.assertRaisesRegex(release.Failure, "page cap"):
            self.collect(limits=release.Limits(max_pages=1))
        with self.assertRaisesRegex(release.Failure, "aggregate output"):
            self.collect(limits=release.Limits(max_total_output=1))

    def test_graphql_rate_limit_only_retries_rate_limit_errors(self):
        # GraphQL can report throttling in a successful HTTP response.
        head = self.commit("fix")
        self.association(head, [42])
        key = "pr:owner/repo:42:"
        self.fixture[key] = {"body": {"errors": [{"type": "RATE_LIMITED", "message": "rate limited"}]}}
        with self.assertRaisesRegex(release.Failure, "retries exhausted"):
            self.collect(limits=release.Limits(retry_delay=0))
        self.assertEqual(self.log.read_text().splitlines().count(key), 3)
        self.log.unlink()
        self.fixture[key] = {"body": {"errors": [{"type": "FORBIDDEN", "message": "denied"}]}}
        with self.assertRaises(release.Failure):
            self.collect(limits=release.Limits(retry_delay=0))
        self.assertEqual(self.log.read_text().splitlines().count(key), 1)

    @unittest.skipIf(os.name == "nt", "POSIX process-group lifecycle assertion")
    def test_timeout_reaps_descendant_holding_pipe(self):
        # A exited parent must not leave a grandchild holding the capture open forever.
        import time
        marker = self.path / "child-survived"
        child = "import time,pathlib;time.sleep(0.4);pathlib.Path(" + repr(str(marker)) + ").touch()"
        parent = "import subprocess,sys;subprocess.Popen([sys.executable,'-c'," + repr(child) + "])"
        with self.assertRaises(TimeoutError):
            release.capture([sys.executable, "-c", parent], 0.1, 4096)
        time.sleep(0.45)
        self.assertFalse(marker.exists())

    def test_first_release_selects_issue_beyond_display_limit(self):
        # The display bound must not truncate issue discovery; keep real Git and parsing without fake-gh startup cost.
        early = self.commit("Fixes #1")
        for index in range(200):
            self.commit(f"unlinked {index}")
        commits = self.git("rev-list", "HEAD").splitlines()
        self.assertNotIn(early, self.git("rev-list", "--max-count=200", "HEAD").splitlines())
        for sha in commits:
            self.association(sha)
        self.issue(1, [commit_closer(early)])
        original_capture = release.capture
        association_keys = []

        def fixture_capture(command, timeout, cap, cwd=None):
            if command[:2] != [sys.executable, str(self.fake)]:
                return original_capture(command, timeout, cap, cwd)
            args = command[2:]
            self.assertEqual(args[0], "api")
            fields = {}
            for index, arg in enumerate(args):
                if arg in ("-f", "-F"):
                    key, value = args[index + 1].split("=", 1)
                    fields[key] = value
            endpoint = args[1]
            if endpoint == "graphql":
                kind = "pr" if "ReleasePullRequest" in fields["query"] else "issue"
                key = kind + ":" + fields["owner"] + "/" + fields["name"] + ":" + fields["number"] + ":" + fields.get("cursor", "")
            else:
                key = endpoint
                association_keys.append(key)
            response = self.fixture[key]
            self.assertEqual(set(response) - {"body", "next"}, set())
            self.assertFalse(response.get("next", False))
            return 0, "HTTP/2.0 200\n\n" + json.dumps(response["body"]) + "\n", ""

        with patch.object(release, "capture", side_effect=fixture_capture):
            self.assertIn("[#1]", self.collect(base=""))
        self.assertCountEqual(
            association_keys,
            [f"repos/owner/repo/commits/{sha}/pulls?per_page=100&page=1" for sha in commits],
        )

    def test_invalid_repo_and_nonancestor_base_fail_before_network(self):
        # User-supplied ref and repository strings cannot turn into command options/URLs.
        head = self.commit("fix")
        self.git("checkout", "--orphan", "unrelated")
        other = self.commit("other")
        with self.assertRaises(release.Failure):
            self.collect(head=head, base=other)
        with self.assertRaises(release.Failure):
            release.collect("owner/repo/../../evil", head, self.base, cwd=self.path)
        self.assertFalse(self.log.exists())


if __name__ == "__main__":
    unittest.main(verbosity=2)
