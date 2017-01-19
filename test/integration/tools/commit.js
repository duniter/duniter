"use strict";

var _  = require('underscore');
var co = require('co');
var rp = require('request-promise');
var logger = require('../../../app/lib/logger')('test');

module.exports = function makeBlockAndPost(theServer, extraProps) {
  return function(manualValues) {
    if (extraProps) {
      manualValues = manualValues || {};
      manualValues = _.extend(manualValues, extraProps);
    }
    return co(function *() {
      let proven = yield require('duniter-prover').duniter.methods.generateAndProveTheNext(theServer, null, null, manualValues);
      return postBlock(theServer)(proven);
    });
  };
};

function postBlock(server) {
  return function(block) {
    logger.trace(block.getRawSigned());
    return post(server, '/blockchain/block')({
      block: typeof block == 'string' ? block : block.getRawSigned()
    });
  };
}

function post(server, uri) {
  return function(data) {
    return rp.post('http://' + [server.conf.ipv4, server.conf.port].join(':') + uri, {
      form: data
    });
  };
}
