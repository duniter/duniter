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
      let err = JSON.parse(e.message);
      should.not.exist(err);
    }
  })
};
