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
const _  = require('underscore');
const rp = require('request-promise');

module.exports = function makeBlockAndPost(fromBlock, toBlock, fromServer, toServer) {
  // Sync blocks
  return _.range(fromBlock, toBlock + 1).reduce((p, number) => co(function*(){
    yield p;
    const json = yield rp('http://' + fromServer.conf.ipv4 + ':' + fromServer.conf.port + '/blockchain/block/' + number, { json: true });
    yield toServer.writeBlock(json)
  }), Promise.resolve());
};
