'use strict';

const path = require('node:path');
const esbuild = require('esbuild');

const REPO_ROOT = path.resolve(__dirname, '..');
const ENTRY = path.join(REPO_ROOT, 'src', 'browser', 'main.js');
const OUT = path.join(REPO_ROOT, 'lib', 'hbe.bundle.js');

esbuild.build({
  entryPoints: [ENTRY],
  outfile: OUT,
  bundle: true,
  format: 'iife',
  target: 'es2018',
  minify: true,
  sourcemap: true,
  legalComments: 'none',
  logLevel: 'info',
}).catch(() => {
  process.exit(1);
});
