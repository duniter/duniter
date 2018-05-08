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

import {TestingServer} from "../tools/toolbox"
import {TestUser} from "../tools/TestUser"
import {BmaDependency} from "../../../app/modules/bma/index"
import {Underscore} from "../../../app/lib/common-libs/underscore"
import {HttpMembers} from "../../../app/modules/bma/lib/dtos"

const duniter     = require('../../../index');
const rp        = require('request-promise');
const httpTest  = require('../tools/http');
const commit    = require('../tools/commit');
const shutDownEngine  = require('../tools/shutDownEngine');

const expectAnswer   = httpTest.expectAnswer;

const MEMORY_MODE = true;
const commonConf = {
  ipv4: '127.0.0.1',
  currency: 'bb',
  httpLogs: true,
  forksize: 3,
  xpercent: 0.9,
  msValidity: 10000,
  sigQty: 1
};

let s1:TestingServer, cat:TestUser, tac:TestUser, tic:TestUser, toc:TestUser

describe("Identities cleaned", function() {

  before(async () => {

    s1 = duniter(
      '/bb12',
      MEMORY_MODE,
      Underscore.extend({
        port: '7733',
        pair: {
          pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd',
          sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'
        }
      }, commonConf));

    cat = new TestUser('cat', { pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'}, { server: s1 });
    tic = new TestUser('tic', { pub: 'DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV', sec: '468Q1XtTq7h84NorZdWBZFJrGkB18CbmbHr9tkp9snt5GiERP7ySs3wM8myLccbAAGejgMRC9rqnXuW3iAfZACm7'}, { server: s1 });
    toc = new TestUser('cat', { pub: 'DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo', sec: '64EYRvdPpTfLGGmaX5nijLXRqWXaVz8r1Z1GtaahXwVSJGQRn7tqkxLb288zwSYzELMEG5ZhXSBYSxsTsz1m9y8F'}, { server: s1 });
    tac = new TestUser('tac', { pub: '2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc', sec: '2HuRLWgKgED1bVio1tdpeXrf7zuUszv1yPHDsDj7kcMC4rVSN9RC58ogjtKNfTbH1eFz7rn38U1PywNs3m6Q7UxE'}, { server: s1 });

    const commitS1 = commit(s1);

    await s1.initWithDAL().then(BmaDependency.duniter.methods.bma).then((bmapi) => bmapi.openConnections());
    await cat.createIdentity();
    await tic.createIdentity();
    await toc.createIdentity();

    await expectAnswer(rp('http://127.0.0.1:7733/wot/lookup/cat', { json: true }), function(res:any) {
      res.should.have.property('results').length(2);
      res.results[0].should.have.property('uids').length(1);
      res.results[0].uids[0].should.have.property('uid').equal('cat'); // This is cat
      res.results[1].uids[0].should.have.property('uid').equal('cat'); // This is toc
    });

    await cat.cert(tic);
    await tic.cert(cat);
    await cat.join();
    await tic.join();
    await commitS1();

    // We have the following WoT (diameter 1):

    /**
     *  cat <-> tic
     */
  });

  after(() => {
    return Promise.all([
      shutDownEngine(s1)
    ])
  })

  it('should have 2 members', function() {
    return expectAnswer(rp('http://127.0.0.1:7733/wot/members', { json: true }), function(res:HttpMembers) {
      res.should.have.property('results').length(2);
      Underscore.pluck(res.results, 'uid').sort().should.deepEqual(['cat', 'tic']);
    });
  });

  it('lookup should give only 1 cat', function() {
    return expectAnswer(rp('http://127.0.0.1:7733/wot/lookup/cat', { json: true }), function(res:any) {
      res.should.have.property('results').length(1);
      res.results[0].should.have.property('uids').length(1);
      res.results[0].uids[0].should.have.property('uid').equal('cat');
    });
  });

  it('lookup should give only 1 tic', function() {
    return expectAnswer(rp('http://127.0.0.1:7733/wot/lookup/tic', { json: true }), function(res:any) {
      res.should.have.property('results').length(1);
      res.results[0].should.have.property('uids').length(1);
      res.results[0].uids[0].should.have.property('uid').equal('tic');
    });
  });
});
