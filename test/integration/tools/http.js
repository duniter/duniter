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

const co = require('co');
const should    = require('should');
const assert    = require('assert');
const _         = require('underscore');

module.exports = {

  expectHttpCode: function expectHttpCode(code, message, promise) {
    if (arguments.length == 2) {
      promise = arguments[1];
      message = undefined;
    }
    return co(function*(){
      try {
        const res = yield promise;
        assert.equal(res.statusCode, code);
      } catch (err) {
        if (err.response) {
          assert.equal(err.response.statusCode, code);
          if (message) {
            assert.equal(err.error || err.cause, message);
          }
        }
        else throw err;
      }
    });
  },

  expectError: function expectHttpCode(code, message, promise) {
    if (arguments.length == 2) {
      promise = arguments[1];
      message = undefined;
    }
    return co(function*(){
      try {
        const res = yield promise;
        assert.equal(res.statusCode, code);
      } catch (err) {
        if (err.response) {
          assert.equal(err.response.statusCode, code);
          if (message) {
            let errorObj = typeof err.error == "string" ? JSON.parse(err.error) : err.error;
            assert.equal(errorObj.message, message);
          }
        }
        else throw err;
      }
    });
  },

  expectJSON: function expectJSON(promise, json) {
    return co(function*(){
      try {
        const resJson = yield promise;
        _.keys(json).forEach(function(key){
          resJson.should.have.property(key).equal(json[key]);
        });
      } catch (err) {
        if (err.response) {
          assert.equal(err.response.statusCode, 200);
        }
        else throw err;
      }
    });
  },

  expectAnswer: function expectJSON(promise, testFunc) {
    return co(function*(){
      try {
        const res = yield promise;
        return testFunc(res);
      } catch (err) {
        if (err.response) {
          console.error(err.error);
          assert.equal(err.response.statusCode, 200);
        }
        else throw err;
      }
    });
  }
};
