"use strict";

var co = require('co');
var rp = require('request-promise');
var logger = require('../../../app/lib/logger')('test');

module.exports = function makeBlockAndPost(theServer) {
  return function(manualValues) {
    return co(function *() {
      let proven = yield theServer.doMakeNextBlock(manualValues);
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
