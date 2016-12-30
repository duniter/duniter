"use strict";

const co = require('co');
const _  = require('underscore');
const Q  = require('q');
const rp = require('request-promise');

module.exports = function makeBlockAndPost(fromBlock, toBlock, fromServer, toServer) {
  // Sync blocks
  return _.range(fromBlock, toBlock + 1).reduce((p, number) => co(function*(){
    yield p;
    const json = yield rp('http://' + fromServer.conf.ipv4 + ':' + fromServer.conf.port + '/blockchain/block/' + number, { json: true });
    yield toServer.singleWritePromise(_.extend(json, { documentType: 'block' }));
  }), Q());
};
