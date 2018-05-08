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

import {TestUser} from "../tools/TestUser"
import {NewTestingServer, TestingServer} from "../tools/toolbox"
import {BmaDependency} from "../../../app/modules/bma/index"
import {Underscore} from "../../../app/lib/common-libs/underscore"

const httpTest  = require('../tools/http');
const shutDownEngine  = require('../tools/shutDownEngine');
const rp        = require('request-promise');

const MEMORY_MODE = true;
const commonConf = {
  ipv4: '127.0.0.1',
  currency: 'bb',
  httpLogs: true,
  forksize: 3,
  sigQty: 1
};

let s1:TestingServer, cat:TestUser, tac:TestUser

describe("Community collapse", function() {

  const now = Math.round(Date.now() / 1000);

  before(async () => {

    s1 = NewTestingServer(
      Underscore.extend({
        name: 'bb11',
        memory: MEMORY_MODE,
        port: '9340',
        pair: {
          pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd',
          sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'
        },
        rootoffset: 10,
        sigQty: 1, dt: 100, ud0: 120, sigValidity: 1
      }, commonConf));

    cat = new TestUser('cat', { pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'}, { server: s1 });
    tac = new TestUser('tac', { pub: 'DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV', sec: '468Q1XtTq7h84NorZdWBZFJrGkB18CbmbHr9tkp9snt5GiERP7ySs3wM8myLccbAAGejgMRC9rqnXuW3iAfZACm7'}, { server: s1 });

    await s1.initWithDAL().then(BmaDependency.duniter.methods.bma).then((bmapi) => bmapi.openConnections());
    await cat.createIdentity();
    await tac.createIdentity();
    await cat.join();
    await tac.join();
    await cat.cert(tac);
    await tac.cert(cat);
    await s1.commit({ time: now });
    await s1.commit({ time: now + 10 });
    await s1.commit({ time: now + 10 });
    await s1.commit({ time: now + 10 });
  });

  after(() => {
    return Promise.all([
      shutDownEngine(s1)
    ])
  })

  it('should be handled', function() {
    return httpTest.expectJSON(rp('http://127.0.0.1:9340/blockchain/block/2', { json: true }), {
      number: 2
    });
  });
});
