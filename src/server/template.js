'use strict';

const fs = require('node:fs');
const path = require('node:path');

const THEME_FILE_RE = /^hbe\.([a-z0-9-]+)\.html$/;

const ATTR_ESCAPE_MAP = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
  '`': '&#96;',
};

function escapeAttr(value) {
  return String(value).replace(/[&<>"'`]/g, (ch) => ATTR_ESCAPE_MAP[ch]);
}

function escapeText(value) {
  return String(value).replace(/[&<>]/g, (ch) => {
    if (ch === '&') return '&amp;';
    if (ch === '<') return '&lt;';
    return '&gt;';
  });
}

// Substitution table.
// - 'attr': escape with the attribute-context escape (covers all six special chars + backtick).
// - 'text': escape with the text-context escape (& < > only).
// - 'raw' : insert verbatim. Used ONLY for already-hex-encoded crypto material whose
//           character set is a strict subset of [0-9a-fA-F]+ (validated below).
const PLACEHOLDERS = [
  { token: '{{hbeFormat}}',            field: 'format',         mode: 'attr' },
  { token: '{{hbeWrongPassMessage}}',  field: 'wpm',            mode: 'attr' },
  { token: '{{hbeWrongHashMessage}}',  field: 'whm',            mode: 'attr' },
  { token: '{{hbeKdfIterations}}',     field: 'kdfIterations',  mode: 'attr' },
  { token: '{{hbeAutoSave}}',          field: 'autoSave',       mode: 'attr' },
  { token: '{{hbeMessage}}',           field: 'message',        mode: 'text' },
  { token: '{{hbeButtonClass}}',       field: 'buttonClass',    mode: 'attr' },
  { token: '{{hbeButtonText}}',        field: 'buttonText',     mode: 'text' },
  { token: '{{hbeSalt}}',              field: 'salt',           mode: 'hex' },
  { token: '{{hbeNonce}}',             field: 'nonce',          mode: 'hex' },
  { token: '{{hbeEncryptedData}}',     field: 'ciphertext',     mode: 'hex' },
];

function valueOf(opts, field) {
  const v = opts[field];
  if (field === 'kdfIterations') return String(v);
  if (field === 'autoSave') return v ? 'true' : 'false';
  return v === undefined || v === null ? '' : v;
}

function substitute(template, opts) {
  let out = template;
  for (const { token, field, mode } of PLACEHOLDERS) {
    const raw = valueOf(opts, field);
    let replacement;
    if (mode === 'attr') replacement = escapeAttr(raw);
    else if (mode === 'text') replacement = escapeText(raw);
    else if (mode === 'hex') {
      // Defence-in-depth: refuse to splice anything that isn't hex.
      const s = String(raw);
      if (s.length > 0 && !/^[0-9a-fA-F]+$/.test(s)) {
        throw new Error(`hexo-blog-encrypt: refusing to render non-hex value into ${field} slot`);
      }
      replacement = s;
    }
    out = out.split(token).join(replacement);
  }
  return out;
}

function discoverThemes(templateDir) {
  let entries;
  try {
    entries = fs.readdirSync(templateDir);
  } catch (_e) {
    return new Map();
  }
  const map = new Map();
  for (const name of entries) {
    const m = THEME_FILE_RE.exec(name);
    if (!m) continue;
    map.set(m[1], path.join(templateDir, name));
  }
  return map;
}

function createRenderer(args) {
  const templateDir = args && args.templateDir;
  if (!templateDir) throw new Error('createRenderer requires templateDir');
  // Only `warn` is ever called from this module (unknown-theme fallback).
  const log = (args && args.logger) || { warn: () => {} };

  const themes = discoverThemes(templateDir);
  const cache = new Map();

  function readTheme(name) {
    if (cache.has(name)) return cache.get(name);
    const file = themes.get(name);
    if (!file) return null;
    const body = fs.readFileSync(file, 'utf8');
    cache.set(name, body);
    return body;
  }

  function render(opts) {
    const requested = (opts && opts.theme) || 'default';
    let body = readTheme(requested);
    if (body === null) {
      log.warn(
        `hexo-blog-encrypt: theme "${requested}" is not in the allowlist; falling back to default. ` +
        'Available themes: ' + [...themes.keys()].sort().join(', ')
      );
      body = readTheme('default');
      if (body === null) {
        throw new Error('hexo-blog-encrypt: default theme not found in ' + templateDir);
      }
    }
    return substitute(body, opts || {});
  }

  function listThemes() {
    return [...themes.keys()].sort();
  }

  return { render, listThemes };
}

module.exports = {
  createRenderer,
  // Exported for unit testing of the escape primitives.
  _internal: { escapeAttr, escapeText, discoverThemes, THEME_FILE_RE },
};
