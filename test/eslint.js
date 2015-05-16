var lint = require('mocha-eslint');

// Array of paths to lint
// Note: a seperate Mocha test will be run for each path and each file which
// matches a glob pattern
var paths = [
  'app',
  'bin',
  'tests/**/*.js'
];

// Specify style of output
var options = {};
options.formatter = 'stylish';

// Run the tests
lint(paths, options);
