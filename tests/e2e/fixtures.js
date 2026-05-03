'use strict';

// Why a fixture: `playwright.config.js` is evaluated BEFORE `globalSetup`
// runs, so reading `process.env.E2E_BASE_URL` from `use.baseURL` in the
// config would always see `undefined`. This fixture reads the env var
// AT TEST TIME (i.e. inside the worker, after globalSetup has populated
// it), which is the supported pattern.
//
// Spec files MUST import `test`/`expect` from THIS module — not from
// `@playwright/test` directly — so they pick up the overridden baseURL.

const base = require('@playwright/test');

exports.test = base.test.extend({
  // eslint-disable-next-line no-empty-pattern
  baseURL: async ({}, use) => {
    if (!process.env.E2E_BASE_URL) {
      throw new Error(
        'E2E_BASE_URL not set — globalSetup did not run, or the worker was ' +
        'spawned without inheriting parent env.'
      );
    }
    await use(process.env.E2E_BASE_URL);
  },
});

exports.expect = base.expect;
