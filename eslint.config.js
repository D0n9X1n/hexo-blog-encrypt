'use strict';

// ESLint flat config. Replaces the legacy .eslintrc.js, .eslintignore and
// src/server/.eslintrc.js. Flat config lints files under dot-directories
// (e.g. a checkout inside .claude/worktrees/), which ESLint 6 skipped.

const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  {
    // demo/ is a separate Hexo site with its own node_modules and generated
    // public/ assets. The rest are build outputs and test artifacts.
    ignores: [
      'demo/',
      'coverage/',
      'lib/hbe.bundle.js',
      'tests/e2e/playwright-report/',
      'tests/e2e/test-results/',
      'tests/fixtures/hexo-site/node_modules/',
      'tests/fixtures/hexo-site/public/',
      '.claude/worktrees/',
    ],
  },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
    },
    rules: {
      // ESLint 9+ reports unused catch bindings by default. The codebase
      // marks intentionally ignored errors with a leading underscore.
      'no-unused-vars': ['error', { caughtErrorsIgnorePattern: '^_' }],
    },
  },
  {
    // Tests and other tooling: Node and browser globals (e2e specs pass
    // callbacks to page.evaluate that run in the browser). Globals merge
    // across matching blocks, so keep this off src/, build/ and index.js.
    files: ['**/*.js'],
    ignores: ['src/**', 'build/**', 'index.js', 'eslint.config.js'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
  },
  {
    // Browser bundle source: DOM context only, bundled to an IIFE by esbuild.
    files: ['src/browser/**/*.js'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.commonjs },
    },
  },
  {
    // Server runtime, build scripts and the Hexo entry point: Node only.
    // globals.node includes structuredClone (Node >= 17).
    files: ['src/server/**/*.js', 'build/**/*.js', 'index.js', 'eslint.config.js'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
];
