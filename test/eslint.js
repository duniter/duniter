const lint = require('mocha-eslint');

// Array of paths to lint
// Note: a seperate Mocha test will be run for each path and each file which
// matches a glob pattern
const paths = [
  'app',
  'bin/duniter',
  'test'
];

// Specify style of output
const options = {};
options.formatter = 'stylish';

// Run the tests
lint(paths, options);
