#!/usr/bin/env node
/* check-toc-leak.js: fail if an encrypted post's text appears in generated files.
 *
 * Usage (from the Hexo site root, after `hexo clean && hexo generate`):
 *   node check-toc-leak.js [--source source/_posts] [--public public] [--post path.md ...] [--body]
 *
 * Headings are always checked. --body also checks every prose line of at least
 * 40 characters, which catches search indexes, feeds and metadata that copy
 * the post body.
 * Posts with a non-empty front-matter `password` are checked automatically.
 * Tag-encrypted posts have no front-matter password; pass them with --post.
 * Exit code: 0 clean, 1 leak found, 2 usage or I/O error.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const MIN_HEADING_LENGTH = 4;
const MIN_BODY_LENGTH = 40;
const SCANNED_EXTENSIONS = new Set(['.html', '.xml', '.json', '.txt', '.js']);

function parseArgs(argv) {
  const args = { source: 'source/_posts', public: 'public', posts: [], body: false };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === '--body') {
      args.body = true;
      continue;
    }
    const value = argv[i + 1];
    if (!['--source', '--public', '--post'].includes(flag) || value === undefined) {
      throw new Error(`unknown or incomplete argument: ${flag}`);
    }
    if (flag === '--post') args.posts.push(value);
    else args[flag.slice(2)] = value;
    i++;
  }
  return args;
}

function frontMatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  return match ? match[1] : '';
}

function hasPassword(text) {
  const match = /^password:[ \t]*(.*)$/m.exec(frontMatter(text));
  if (!match) return false;
  const value = match[1].trim().replace(/^(['"])(.*)\1$/, '$2');
  return value !== '';
}

function plain(text) {
  return text
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[`*_~]/g, '')
    .trim();
}

function headings(text, includeBody = false) {
  const body = text.replace(/^---\r?\n[\s\S]*?\r?\n---/, '');
  const out = [];
  let fence = null;
  for (const line of body.split(/\r?\n/)) {
    const fenceMatch = /^\s*(```|~~~)/.exec(line);
    if (fenceMatch) {
      fence = fence === fenceMatch[1] ? null : (fence || fenceMatch[1]);
      continue;
    }
    if (fence) continue;
    const match = /^#{1,6}\s+(.+?)\s*#*\s*$/.exec(line);
    if (match) {
      const heading = plain(match[1]);
      if (heading.length >= MIN_HEADING_LENGTH) out.push(heading);
      continue;
    }
    if (!includeBody || /^\s*(<|\||>|[-*+]\s|\d+\.\s|<!--)/.test(line)) continue;
    const prose = plain(line);
    if (prose.length >= MIN_BODY_LENGTH) out.push(prose);
  }
  return out;
}

function walk(dir, extensions, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, extensions, files);
    else if (extensions.has(path.extname(entry.name))) files.push(full);
  }
  return files;
}

function escapeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    return 2;
  }
  if (!fs.existsSync(args.public)) {
    console.error(`generated directory not found: ${args.public} (run hexo generate first)`);
    return 2;
  }

  const posts = new Set(args.posts);
  if (fs.existsSync(args.source)) {
    for (const file of walk(args.source, new Set(['.md']))) {
      if (hasPassword(fs.readFileSync(file, 'utf8'))) posts.add(file);
    }
  }
  if (posts.size === 0) {
    console.log('No encrypted posts found. Pass tag-encrypted posts with --post.');
    return 0;
  }

  const needles = [];
  for (const post of posts) {
    for (const heading of headings(fs.readFileSync(post, 'utf8'), args.body)) {
      needles.push({ post, heading, forms: [heading, escapeHtml(heading), encodeURIComponent(heading)] });
    }
  }

  const leaks = [];
  for (const file of walk(args.public, SCANNED_EXTENSIONS)) {
    const text = fs.readFileSync(file, 'utf8');
    for (const needle of needles) {
      if (needle.forms.some((form) => text.includes(form))) leaks.push({ file, ...needle });
    }
  }

  for (const leak of leaks) {
    console.log(`LEAK ${leak.file}: "${leak.heading}" from ${leak.post}`);
  }
  console.log(`${posts.size} encrypted post(s), ${needles.length} string(s) checked, ${leaks.length} leak(s).`);
  return leaks.length ? 1 : 0;
}

if (require.main === module) process.exitCode = main();

module.exports = { hasPassword, headings };
