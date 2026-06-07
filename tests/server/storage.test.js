'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const storage = require('../../src/browser/storage');

const PAGE_KEY = '/autosave-default/';
const SALT_A = '00'.repeat(32);
const SALT_B = '11'.repeat(32);
const NONCE_A = '22'.repeat(12);
const NONCE_B = '33'.repeat(12);
const RAW_KEY = new Uint8Array(32).fill(7);

function makeLocalStorage() {
  const store = new Map();
  return {
    _store: store,
    getItem: (key) => store.has(key) ? store.get(key) : null,
    setItem: (key, value) => { store.set(key, String(value)); },
    removeItem: (key) => { store.delete(key); },
  };
}

async function makeKey() {
  return crypto.subtle.importKey(
    'raw',
    RAW_KEY,
    { name: 'AES-GCM' },
    true,
    ['decrypt']
  );
}

async function saveFixtureEntry() {
  await storage.save({
    pageKey: PAGE_KEY,
    key: await makeKey(),
    saltHex: SALT_A,
    nonceHex: NONCE_A,
    autoSave: true,
  });
}

async function assertLoadedKeyMatches(loaded) {
  assert.ok(loaded, 'expected cached key to load');
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', loaded));
  assert.deepEqual(raw, RAW_KEY);
}

test('storage.load returns cached key when salt matches, even if stored nonce is stale', async () => {
  global.localStorage = makeLocalStorage();
  await saveFixtureEntry();
  const rawEntry = JSON.parse(global.localStorage._store.get('hbe.v4.' + PAGE_KEY));
  assert.equal(rawEntry.nonce, NONCE_A);

  const loaded = await storage.load({
    pageKey: PAGE_KEY,
    expectedSaltHex: SALT_A,
    expectedNonceHex: NONCE_B,
  });

  await assertLoadedKeyMatches(loaded);
  assert.equal(global.localStorage._store.size, 1);
});

test('storage.load clears salt mismatch', async () => {
  global.localStorage = makeLocalStorage();
  await saveFixtureEntry();

  const loaded = await storage.load({
    pageKey: PAGE_KEY,
    expectedSaltHex: SALT_B,
  });

  assert.equal(loaded, null);
  assert.equal(global.localStorage._store.size, 0);
});
