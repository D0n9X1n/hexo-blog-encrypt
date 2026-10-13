'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..');
const skillFile = path.join(repoRoot, 'skills', 'hexo-encrypt-toc', 'SKILL.md');
const skillBody = fs.readFileSync(skillFile, 'utf8');

// The skill is a single file; its scripts are fenced blocks in appendices.
function appendix(title) {
  const match = new RegExp(`^## ${title}\\n[\\s\\S]*?^\`\`\`\`js\\n([\\s\\S]*?)^\`\`\`\`$`, 'm').exec(skillBody);
  assert.ok(match, `SKILL.md must contain a \`\`\`\`js block under "## ${title}"`);
  return match[1];
}

const checker = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'hbe-skill-')), 'check-toc-leak.js');
fs.writeFileSync(checker, appendix('Appendix B: check-toc-leak.js'));
const { hasPassword, headings } = require(checker);

function site(posts, publicFiles) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hbe-toc-'));
  for (const [name, body] of Object.entries(posts)) {
    const file = path.join(dir, 'source', '_posts', name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, body);
  }
  for (const [name, body] of Object.entries(publicFiles)) {
    const file = path.join(dir, 'public', name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, body);
  }
  return dir;
}

function run(cwd, args = []) {
  return spawnSync(process.execPath, [checker, ...args], { cwd, encoding: 'utf8' });
}

const SECRET_POST = '---\ntitle: Secret\npassword: hello\n---\n# Secret Plans\n\n```\n# not a heading\n```\n## Second *Step*\n### Hi\n';

test('hasPassword reads only non-empty front-matter passwords', () => {
  assert.equal(hasPassword('---\npassword: hello\n---\nbody'), true);
  assert.equal(hasPassword('---\npassword: "x"\n---\n'), true);
  assert.equal(hasPassword('---\npassword: ""\n---\n'), false);
  assert.equal(hasPassword('---\ntitle: t\n---\npassword: hello'), false);
  assert.equal(hasPassword('no front matter'), false);
});

test('headings skips code fences, strips inline markup, and ignores short headings', () => {
  assert.deepEqual(headings(SECRET_POST), ['Secret Plans', 'Second Step']);
  assert.deepEqual(headings('# [Linked Title](https://x) ##\n~~~\n# fenced\n~~~\n'), ['Linked Title']);
});

test('checker exits 0 when no encrypted heading is published', () => {
  const dir = site({ 'a.md': SECRET_POST }, { 'a/index.html': '<div id="hexo-blog-encrypt">cipher</div>' });
  const result = run(dir);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /1 encrypted post\(s\), 2 string\(s\) checked, 0 leak\(s\)/);
});

test('checker exits 1 on a leaked heading, including a hidden or escaped one', () => {
  const dir = site(
    { 'a.md': SECRET_POST.replace('Secret Plans', 'Plans & Notes') },
    { 'a/index.html': '<div style="display:none"><span class="toc-text">Plans &amp; Notes</span></div>' }
  );
  const result = run(dir);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /LEAK .*index\.html: "Plans & Notes"/);
});

test('checker scans tag-encrypted posts passed with --post', () => {
  const dir = site({ 'tag.md': '---\ntitle: t\ntags: [secret]\n---\n## Tagged Heading\n' }, { 'search.json': '{"text":"Tagged Heading"}' });
  assert.equal(run(dir).status, 0);
  assert.equal(run(dir, ['--post', path.join('source', '_posts', 'tag.md')]).status, 1);
});

test('--body also catches copied prose (search index, feed)', () => {
  const secret = 'The quarterly numbers are far worse than we told the board.';
  const post = SECRET_POST + '\n' + secret + '\n\n- short list item\n';
  const dir = site({ 'a.md': post }, { 'search.xml': '<content>' + secret + '</content>' });
  assert.equal(run(dir).status, 0, 'headings-only mode ignores prose');
  const result = run(dir, ['--body']);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /search\.xml: "The quarterly numbers/);
  assert.deepEqual(headings(post, true), ['Secret Plans', 'Second Step', secret]);
});

test('checker reports usage and missing-output errors with exit 2', () => {
  const dir = site({ 'a.md': SECRET_POST }, {});
  assert.equal(run(dir).status, 2);
  assert.equal(run(dir, ['--bogus']).status, 2);
});

test('skill is one self-contained file with valid frontmatter', () => {
  const fm = /^---\n([\s\S]*?)\n---\n/.exec(skillBody);
  assert.ok(fm, 'SKILL.md must start with YAML frontmatter');
  assert.match(fm[1], /^name: hexo-encrypt-toc$/m);
  assert.match(fm[1], /^description: .{40,}$/m);
  // No links to sibling files: everything the skill needs is inline.
  assert.doesNotMatch(skillBody, /\]\((?:scripts|references)\//);
  assert.doesNotMatch(skillBody, /CLAUDE_(?:SKILL_DIR|PLUGIN_ROOT)/);
  for (const anchor of ['#appendix-a-hbe-tocjs', '#appendix-b-check-toc-leakjs', '#per-theme-examples']) {
    assert.ok(skillBody.includes(`](${anchor})`), `SKILL.md must link ${anchor}`);
  }
  assert.match(appendix('Appendix A: hbe-toc.js'), /hexo-blog-decrypt/);
});

test('the skill is not shipped in the npm package', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  assert.ok(!pkg.files.some((entry) => entry.startsWith('skills')));
});

test('wiki never recommends rendering toc(post.origin)', () => {
  const wikiDir = path.join(repoRoot, 'wiki');
  for (const name of fs.readdirSync(wikiDir)) {
    const body = fs.readFileSync(path.join(wikiDir, name), 'utf8');
    for (const block of body.match(/```[\s\S]*?```/g) || []) {
      assert.doesNotMatch(block, /toc\(\s*(?:post|page)\.origin/, `${name} has a code sample rendering toc(origin)`);
    }
  }
});
