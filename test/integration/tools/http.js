"use strict";

var should    = require('should');
var assert    = require('assert');
var _         = require('underscore');

module.exports = {

  expectHttpCode: function expectHttpCode(code, message, promise) {
    if (arguments.length == 2) {
      promise = arguments[1];
      message = undefined;
    }
    return promise
      .then(function(res){
        assert.equal(200, code);
      })
      .catch(function(err){
        if (err.response) {
          assert.equal(err.response.statusCode, code);
          if (message) {
            assert.equal(err.error || err.cause, message);
          }
        }
        else throw err;
      });
  },

  expectError: function expectHttpCode(code, message, promise) {
    if (arguments.length == 2) {
      promise = arguments[1];
      message = undefined;
    }
    return promise
      .then(function(){
        assert.equal(200, code);
      })
      .catch(function(err){
        if (err.response) {
          assert.equal(err.response.statusCode, code);
          if (message) {
            let errorObj = typeof err.error == "string" ? JSON.parse(err.error) : err.error;
            assert.equal(errorObj.message, message);
          }
        }
        else throw err;
      });
  },

  expectJSON: function expectJSON(promise, json) {
    return promise
      .then(function(resJson){
        _.keys(json).forEach(function(key){
          resJson.should.have.property(key).equal(json[key]);
        });
      })
      .catch(function(err){
        if (err.response) {
          assert.equal(err.response.statusCode, 200);
        }
        else throw err;
      });
  },

  expectAnswer: function expectJSON(promise, testFunc) {
    return promise
      .then(function(res) {
        return testFunc(res);
      })
      .catch(function(err){
        if (err.response) {
          console.error(err.error);
          assert.equal(err.response.statusCode, 200);
        }
        else throw err;
      });
  }
};
