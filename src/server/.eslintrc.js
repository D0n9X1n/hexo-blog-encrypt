module.exports = {
  'env': {
    'node': true
  },
  'globals': {
    // structuredClone is a global since Node 17 (engines.node ≥18 once Wave 7
    // pins it in package.json). Project ESLint is on an older parser ecosystem,
    // so declare it explicitly.
    'structuredClone': 'readonly'
  }
};
