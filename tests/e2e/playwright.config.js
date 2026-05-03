'use strict';

const path = require('path');
const { devices } = require('@playwright/test');

// NOTE: Do NOT read process.env.E2E_BASE_URL here. This config file is
// evaluated BEFORE globalSetup runs, so any env var written by the setup
// would be `undefined` at config-load time. baseURL is exposed to specs
// via the fixture in `./fixtures.js`, which reads the env var at test
// time (workers are spawned AFTER globalSetup and inherit env writes).

module.exports = {
  testDir: '.',
  globalSetup: require.resolve('./global-setup.js'),
  workers: process.env.CI ? 2 : undefined,
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ['list'],
    ['html', {
      outputFolder: path.resolve(__dirname, 'playwright-report'),
      open: 'never',
    }],
  ],
  outputDir: path.resolve(__dirname, 'test-results'),
  use: {
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
};
