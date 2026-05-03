module.exports = {
  'env': {
    'browser': true,
    'commonjs': true,
    'es6': true
  },
  'extends': 'eslint:recommended',
  'parserOptions': {
    'ecmaVersion': 10,
  },
  // The demo site under demo/ is a separate Hexo project (vendored deps + Hexo-generated
  // public assets). It carries its own node_modules and never contains source code we
  // want this lint config to enforce — exclude the whole directory.
  'ignorePatterns': [
    'demo/',
  ],
};
