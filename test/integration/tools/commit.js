"use strict";

var rp = require('request-promise');

module.exports = function makeBlockAndPost(theServer) {
  return function() {
    return theServer.makeNextBlock()
      .then(postBlock(theServer));
  };
};

function postBlock(server) {
  return function(block) {
    //console.log(block.getRawSigned());
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
