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

var _  = require('underscore');
var co = require('co');
var rp = require('request-promise');
var logger = require('../../../app/lib/logger').NewLogger('test');
const until = require('./until')
const BlockProver = require('../../../app/modules/prover/lib/blockProver').BlockProver

module.exports = function makeBlockAndPost(theServer, extraProps, noWait) {
  return function(manualValues) {
    if (extraProps) {
      manualValues = manualValues || {};
      manualValues = _.extend(manualValues, extraProps);
    }
    return co(function *() {
      if (!theServer._utProver) {
        theServer._utProver = new BlockProver(theServer)
        theServer._utGenerator = require('../../../app/modules/prover').ProverDependency.duniter.methods.blockGenerator(theServer, theServer._utProver)
      }
      let proven = yield theServer._utGenerator.makeNextBlock(null, null, manualValues)
      const numberToReach = proven.number
      const block = yield postBlock(theServer)(proven)
      yield new Promise((res) => {
        if (noWait) {
          return res(block)
        }
        const interval = setInterval(() => co(function*() {
          const current = yield theServer.dal.getCurrentBlockOrNull()
          if (current && current.number == numberToReach) {
            res()
            clearInterval(interval)
          }
        }), 1)
      })
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
