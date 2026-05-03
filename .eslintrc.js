module.exports = {
  'env': {
    'browser': true,
    'commonjs': true,
    'es6': true,
    'node': true,
  },
  'extends': 'eslint:recommended',
  'parserOptions': {
    'ecmaVersion': 2020,
  },
  // The demo site under demo/ is a separate Hexo project (vendored deps + Hexo-generated
  // public assets). It carries its own node_modules and never contains source code we
  // want this lint config to enforce — exclude the whole directory.
  'ignorePatterns': [
    'demo/',
    'lib/hbe.bundle.js',
    'lib/hbe.bundle.js.map',
  ],
  'overrides': [
    {
      // Browser bundle source — runs in DOM context, not Node.
      'files': ['src/browser/**/*.js'],
      'env': { 'browser': true, 'commonjs': true, 'es6': true, 'node': false },
    },
    {
      // Server-only modules — Node globals only.
      'files': ['src/server/**/*.js', 'build/**/*.js', 'index.js'],
      'env': { 'browser': false, 'commonjs': true, 'es6': true, 'node': true },
    },
  ],
};
