// Source file from duniter: Crypto-currency software to manage libre currency such as Ğ1
// Copyright (C) 2018  Cedric Moreau <cem.moreau@gmail.com>
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.

describe('Linting', () => {

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

})