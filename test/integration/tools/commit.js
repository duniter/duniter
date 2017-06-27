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
      if (!theServer._utProver) {
        theServer._utProver = require('../../../app/modules/prover').duniter.methods.blockProver(theServer)
        theServer._utGenerator = require('../../../app/modules/prover').duniter.methods.blockGenerator(theServer, theServer._utProver)
      }
      let proven = yield theServer._utGenerator.makeNextBlock(null, null, manualValues)
      const block = yield postBlock(theServer)(proven);
      return block
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
