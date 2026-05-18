'use strict';

const path = require('node:path');

const { resolve } = require('./config');
const { encrypt } = require('./crypto');
const { createRenderer } = require('./template');
const { createGenerator } = require('./generator');
const { createLogger } = require('./logger');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const TEMPLATE_DIR = path.join(REPO_ROOT, 'lib');
const CSS_PATH = path.join(REPO_ROOT, 'lib', 'hbe.style.css');
const BUNDLE_PATH = path.join(REPO_ROOT, 'lib', 'hbe.bundle.js');
const BUNDLE_SOURCEMAP_PATH = path.join(REPO_ROOT, 'lib', 'hbe.bundle.js.map');

const FORMAT_VERSION = '4';

// Per-instance Symbol so user front-matter keys can never collide with our
// idempotence marker. We deliberately do NOT use Symbol.for(...) (a global
// registry) — a per-process Symbol guarantees external code cannot fabricate
// the marker even by accident.
const HBE_ENCRYPTED = Symbol('hexo-blog-encrypt.v4.encrypted');

function normalizeRoot(root) {
  if (typeof root !== 'string') return '/';
  return root.endsWith('/') ? root : root + '/';
}

function normalizePostTags(postTags) {
  // Real Hexo posts: `data.tags` is a Warehouse Query (NOT a plain array).
  // `Array.isArray(query) === false`, but `query.toArray()` and
  // `query.forEach(tag => …)` both work. v3 used `data.tags.forEach(…)`;
  // we replicate that contract here while ALSO accepting plain arrays so
  // synthetic test data and other plugins that pre-flatten still work.
  // Returning [] means "no tag-encryption applies" — the post is left
  // unencrypted IFF it also has no front-matter password (which is the
  // correct behaviour for a post that genuinely has no tags).
  if (postTags == null) return [];
  if (Array.isArray(postTags)) return postTags;
  if (typeof postTags.toArray === 'function') return postTags.toArray();
  if (typeof postTags.forEach === 'function') {
    const out = [];
    postTags.forEach((t) => out.push(t));
    return out;
  }
  return [];
}

function resolveTagPassword(hexoEncrypt, postTags) {
  if (!hexoEncrypt || !Array.isArray(hexoEncrypt.tags)) return null;
  const tags = normalizePostTags(postTags);
  if (tags.length === 0) return null;
  const map = Object.create(null);
  for (const t of hexoEncrypt.tags) {
    if (t && typeof t.name === 'string') map[t.name] = t.password;
  }
  for (const t of tags) {
    if (t && typeof t.name === 'string' && Object.prototype.hasOwnProperty.call(map, t.name)) {
      return { name: t.name, password: map[t.name] };
    }
  }
  return null;
}

function register(hexo) {
  if (!hexo) throw new Error('hexo-blog-encrypt: hexo instance is required');

  const logger = createLogger({ hexo, silent: false });
  const renderer = createRenderer({ templateDir: TEMPLATE_DIR, logger });
  // Single shared generator instance — used by both the filter (for
  // computing the script src hash) and Hexo's generator pipeline (for
  // emitting the bytes). The generator memoizes the bundle bytes/hash by
  // mtime, so all calls within one generation cycle agree on the same
  // content hash, eliminating the per-call disk re-read AND the
  // hash-mismatch window between filter and generator (see
  // `src/server/generator.js`).
  const assetGenerator = createGenerator({
    bundlePath: BUNDLE_PATH,
    cssPath: CSS_PATH,
    sourcemapPath: BUNDLE_SOURCEMAP_PATH,
  });

  hexo.extend.filter.register('after_post_render', function v4Filter(data) {
    // Idempotence: stamp a per-instance Symbol on `data` after a successful
    // pass so re-entry on the same object is a no-op. We deliberately do NOT
    // use `data.encrypt === true` (a user-set "please encrypt" front-matter
    // signal) or `data.origin` (a generic property name another plugin or
    // user could legitimately populate) as the marker — both have caused
    // silent-skip footguns in earlier designs.
    if (data[HBE_ENCRYPTED] === true) {
      return data;
    }

    // Resolve effective password from front-matter > tag > nothing.
    const fmPassword = data.password;
    if (fmPassword === '') {
      // Empty FM password explicitly disables encryption (criterion 4).
      return data;
    }

    let effectivePostData = data;
    if (fmPassword === undefined || fmPassword === null) {
      const tagMatch = resolveTagPassword(hexo.config && hexo.config.encrypt, data.tags);
      if (!tagMatch || tagMatch.password === undefined || tagMatch.password === null) {
        return data;
      }
      effectivePostData = Object.assign({}, data, { password: tagMatch.password });
      effectivePostData.__tagName = tagMatch.name;
    }

    // resolve() throws on misconfiguration (e.g. kdf.iterations below floor).
    // Let it propagate — the original stack is the most actionable thing for
    // the user, and Hexo will surface the error through its own logger.
    const cfg = resolve(hexo.config, effectivePostData, logger);
    if (cfg === null) {
      // Defensive: resolve() returns null when the resolved password collapses
      // to undefined/empty (e.g. a tag entry with `password: ''`). Bypass.
      return data;
    }

    logger.updateSilent(!!cfg.silent);

    const tagName = effectivePostData.__tagName;
    const titleText = (typeof data.title === 'string') ? data.title.trim() : '(untitled)';
    if (tagName) {
      logger.info(`hexo-blog-encrypt: encrypting "${titleText}" via tag "${tagName}" with theme ${cfg.theme}.`);
    } else {
      logger.info(`hexo-blog-encrypt: encrypting "${titleText}" via front-matter password with theme ${cfg.theme}.`);
    }

    // Preserve original plaintext so themes (TOC, etc.) can still introspect it.
    data.origin = data.content;

    const plaintext = String(data.content == null ? '' : data.content);
    const { salt, nonce, ciphertext } = encrypt(plaintext, cfg.password, {
      iterations: cfg.kdf.iterations,
    });

    const buttonShow = !cfg.decryptButton || cfg.decryptButton.show !== false;
    const buttonText = (cfg.decryptButton && typeof cfg.decryptButton.text === 'string')
      ? cfg.decryptButton.text
      : 'Decrypt';

    const themeName = String(cfg.theme || 'default').trim().toLowerCase();
    const rendered = renderer.render({
      theme: themeName,
      format: FORMAT_VERSION,
      ciphertext: ciphertext.toString('hex'),
      salt: salt.toString('hex'),
      nonce: nonce.toString('hex'),
      message: cfg.message,
      wpm: cfg.wrong_pass_message,
      whm: cfg.wrong_hash_message,
      buttonClass: buttonShow ? '' : ' hbe-button-hidden',
      buttonText,
      kdfIterations: cfg.kdf.iterations,
      autoSave: !!cfg.autoSave,
    });

    const root = normalizeRoot(hexo.config && hexo.config.root);
    const routes = assetGenerator();
    const jsRoute = routes.find((r) => /^lib\/hbe\.[0-9a-f]{10}\.js$/.test(r.path));
    const cssRoute = routes.find((r) => r.path === 'css/hbe.style.css');
    const jsHref = root + jsRoute.path;
    const cssHref = root + cssRoute.path;

    data.content = rendered +
      `<script data-pjax src="${jsHref}"></script>` +
      `<link href="${cssHref}" rel="stylesheet" type="text/css">`;
    data.encrypt = true;
    data.excerpt = data.more = cfg.abstract;
    data[HBE_ENCRYPTED] = true;

    return data;
  }, 1000);

  hexo.extend.generator.register('hexo-blog-encrypt', assetGenerator);
}

module.exports = { register };
