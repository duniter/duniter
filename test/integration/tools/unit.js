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

"use strict";

var should = require('should');
var co = require('co');

module.exports = {

  shouldFail: (promise, message) => co(function *() {
    try {
      yield promise;
      throw { "message": '{ "message": "Should have thrown an error" }' };
    } catch(e) {
      e.should.have.property('message').equal(message);
    }
  }),

  shouldNotFail: (promise) => co(function *() {
    try {
      yield promise;
    } catch(e) {
      let err = e;
      if (typeof e === 'string') {
        err = JSON.parse(e.message);
      }
      should.not.exist(err);
    }
  })
};
