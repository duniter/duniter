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
