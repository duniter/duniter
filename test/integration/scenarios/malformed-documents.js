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

const request = require('request');

module.exports = function(node1) {

  const malformedTransaction = "Version: 2\n" +
    "Type: Transaction\n" +
    "Currency: null\n" +
    "Issuers:\n" +
    "G2CBgZBPLe6FSFUgpx2Jf1Aqsgta6iib3vmDRA1yLiqU\n" +
    "Inputs:\n" +
    "0:T:1536:539CB0E60CD5F55CF1BE96F067E73BF55C052112:1.0\n" +
    "Outputs:Comment: mon comments\n";


  function sendRaw (raw) {
    return function(done) {
      post('/tx/process', {
        "transaction": raw
      }, done);
    }
  }

  function post(uri, data, done) {
    const postReq = request.post({
      "uri": 'http://' + [node1.server.conf.remoteipv4, node1.server.conf.remoteport].join(':') + uri,
      "timeout": 1000 * 10
    }, function (err, res, body) {
      done(err, res, body);
    });
    postReq.form(data);
  }
  return [
    sendRaw(malformedTransaction)
  ];
};
