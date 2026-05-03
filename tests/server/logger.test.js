'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { createLogger } = require('../../src/server/logger');

function captureHexoLog() {
  const calls = { info: [], warn: [], error: [], debug: [] };
  return {
    log: {
      info: (m) => calls.info.push(m),
      warn: (m) => calls.warn.push(m),
      error: (m) => calls.error.push(m),
      debug: (m) => calls.debug.push(m),
    },
    calls,
  };
}

test('createLogger forwards info to hexo.log.info when not silent', () => {
  const { log, calls } = captureHexoLog();
  const logger = createLogger({ hexo: { log }, silent: false });
  logger.info('hello');
  assert.deepEqual(calls.info, ['hello']);
  assert.deepEqual(calls.warn, []);
});

test('createLogger forwards warn to hexo.log.warn when not silent', () => {
  const { log, calls } = captureHexoLog();
  const logger = createLogger({ hexo: { log }, silent: false });
  logger.warn('careful');
  assert.deepEqual(calls.warn, ['careful']);
  assert.deepEqual(calls.info, []);
});

test('createLogger silent: true suppresses info but ALLOWS warn', () => {
  const { log, calls } = captureHexoLog();
  const logger = createLogger({ hexo: { log }, silent: true });
  logger.info('quiet');
  logger.warn('noisy');
  assert.deepEqual(calls.info, []);
  assert.deepEqual(calls.warn, ['noisy']);
});

test('createLogger silent: true allows error pass-through but suppresses debug', () => {
  const { log, calls } = captureHexoLog();
  const logger = createLogger({ hexo: { log }, silent: true });
  logger.error('bad');
  logger.debug('hmm');
  assert.deepEqual(calls.error, ['bad']);
  assert.deepEqual(calls.debug, []);
});

test('createLogger updateSilent() flips behavior for subsequent info calls', () => {
  const { log, calls } = captureHexoLog();
  const logger = createLogger({ hexo: { log }, silent: false });
  logger.info('one');
  logger.updateSilent(true);
  logger.info('two-suppressed');
  logger.updateSilent(false);
  logger.info('three');
  assert.deepEqual(calls.info, ['one', 'three']);
});

test('createLogger falls back to console when hexo.log is missing', () => {
  const realConsoleLog = console.log;
  const realConsoleWarn = console.warn;
  const calls = { log: [], warn: [] };
  console.log = (m) => calls.log.push(m);
  console.warn = (m) => calls.warn.push(m);
  try {
    const logger = createLogger({ hexo: {}, silent: false });
    logger.info('ci');
    logger.warn('cw');
    assert.deepEqual(calls.log, ['ci']);
    assert.deepEqual(calls.warn, ['cw']);
  } finally {
    console.log = realConsoleLog;
    console.warn = realConsoleWarn;
  }
});

test('createLogger falls back to console when hexo is missing entirely', () => {
  const realConsoleLog = console.log;
  const realConsoleWarn = console.warn;
  const calls = { log: [], warn: [] };
  console.log = (m) => calls.log.push(m);
  console.warn = (m) => calls.warn.push(m);
  try {
    const logger = createLogger({ silent: false });
    logger.info('x');
    logger.warn('y');
    assert.deepEqual(calls.log, ['x']);
    assert.deepEqual(calls.warn, ['y']);
  } finally {
    console.log = realConsoleLog;
    console.warn = realConsoleWarn;
  }
});

test('createLogger console fallback: silent suppresses console.log info', () => {
  const realConsoleLog = console.log;
  const realConsoleWarn = console.warn;
  const calls = { log: [], warn: [] };
  console.log = (m) => calls.log.push(m);
  console.warn = (m) => calls.warn.push(m);
  try {
    const logger = createLogger({ silent: true });
    logger.info('quiet');
    logger.warn('still-loud');
    assert.deepEqual(calls.log, []);
    assert.deepEqual(calls.warn, ['still-loud']);
  } finally {
    console.log = realConsoleLog;
    console.warn = realConsoleWarn;
  }
});

test('createLogger error falls back to console.error when hexo.log absent', () => {
  const realConsoleError = console.error;
  const calls = [];
  console.error = (m) => calls.push(m);
  try {
    const logger = createLogger({ silent: false });
    logger.error('boom');
    assert.deepEqual(calls, ['boom']);
  } finally {
    console.error = realConsoleError;
  }
});

test('createLogger debug falls back to console.debug when hexo.log absent', () => {
  const realConsoleDebug = console.debug;
  const calls = [];
  console.debug = (m) => calls.push(m);
  try {
    const logger = createLogger({ silent: false });
    logger.debug('dbg');
    assert.deepEqual(calls, ['dbg']);
  } finally {
    console.debug = realConsoleDebug;
  }
});

test('createLogger silent suppresses console.debug too', () => {
  const realConsoleDebug = console.debug;
  const calls = [];
  console.debug = (m) => calls.push(m);
  try {
    const logger = createLogger({ silent: true });
    logger.debug('hidden');
    assert.deepEqual(calls, []);
  } finally {
    console.debug = realConsoleDebug;
  }
});

test('createLogger silent ALSO suppresses hexo.log.debug (more verbose than info)', () => {
  const { log, calls } = captureHexoLog();
  const logger = createLogger({ hexo: { log }, silent: true });
  logger.debug('hidden');
  assert.deepEqual(calls.debug, []);
});

test('createLogger() with no arguments uses safe defaults (silent=false, console fallback)', () => {
  const logger = createLogger();
  // Captures the |opts || {}| short-circuit AND the no-hexo branch.
  const restore = console.log;
  let captured = null;
  console.log = (m) => { captured = m; };
  try {
    logger.info('hello');
  } finally {
    console.log = restore;
  }
  assert.equal(captured, 'hello');
});
