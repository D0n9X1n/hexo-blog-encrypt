'use strict';

/**
 * Silent-aware wrapper around `hexo.log` (or `console` when running outside
 * a Hexo process — e.g. unit tests).
 *
 * Silent semantics (matches v3 behavior in legacy `index.js`):
 *   - `silent: true`  → `info` and `debug` calls are dropped
 *   - `silent: true`  → `warn` and `error` ALWAYS pass through
 *   - `silent: false` → all four levels pass through
 *
 * Rationale: `silent` was always intended to suppress build-time chatter,
 * not to hide warnings (deprecations, fallback themes) or errors. Hiding
 * warnings would let real configuration mistakes ship to production.
 *
 * @param {object}  opts
 * @param {object} [opts.hexo]   Hexo instance (uses `hexo.log.{info,warn,error,debug}`)
 * @param {boolean} [opts.silent=false]
 * @returns {{
 *   info: (msg: string) => void,
 *   warn: (msg: string) => void,
 *   error: (msg: string) => void,
 *   debug: (msg: string) => void,
 *   updateSilent: (next: boolean) => void,
 * }}
 */
function createLogger(opts) {
  const o = opts || {};
  let silent = !!o.silent;
  const log = o.hexo && o.hexo.log ? o.hexo.log : null;

  function emit(level, msg) {
    if (silent && (level === 'info' || level === 'debug')) {
      return;
    }
    if (log && typeof log[level] === 'function') {
      log[level](msg);
      return;
    }
    if (level === 'warn') {
      console.warn(msg);
    } else if (level === 'error') {
      console.error(msg);
    } else if (level === 'debug') {
      console.debug(msg);
    } else {
      console.log(msg);
    }
  }

  return {
    info: (m) => emit('info', m),
    warn: (m) => emit('warn', m),
    error: (m) => emit('error', m),
    debug: (m) => emit('debug', m),
    updateSilent: (next) => { silent = !!next; },
  };
}

module.exports = { createLogger };
