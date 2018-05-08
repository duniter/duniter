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

import {Underscore} from "../../../app/lib/common-libs/underscore"
import {NewTestingServer, TestingServer} from "../tools/toolbox"
import {TestUser} from "../tools/TestUser"
import {BmaDependency} from "../../../app/modules/bma/index"
import {shutDownEngine} from "../tools/shutdown-engine"
import {expectAnswer, expectJSON} from "../tools/http-expect"

const rp        = require('request-promise');

const MEMORY_MODE = true;
const commonConf = {
  ipv4: '127.0.0.1',
  currency: 'bb',
  httpLogs: true,
  forksize: 3,
  sigQty: 1
};

let s1:TestingServer, cat:TestUser, toc:TestUser, tic:TestUser, tuc:TestUser

describe("Pending data", function() {

  before(async () => {

    s1 = NewTestingServer(Underscore.extend({
      memory: MEMORY_MODE,
      name: 'bb6',
      port: '7783',
      pair: {
        pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd',
        sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'
      }
    }, commonConf));

    cat = new TestUser('cat', { pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'}, { server: s1 });
    toc = new TestUser('toc', { pub: 'DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo', sec: '64EYRvdPpTfLGGmaX5nijLXRqWXaVz8r1Z1GtaahXwVSJGQRn7tqkxLb288zwSYzELMEG5ZhXSBYSxsTsz1m9y8F'}, { server: s1 });
    tic = new TestUser('tic', { pub: 'DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV', sec: '468Q1XtTq7h84NorZdWBZFJrGkB18CbmbHr9tkp9snt5GiERP7ySs3wM8myLccbAAGejgMRC9rqnXuW3iAfZACm7'}, { server: s1 });
    tuc = new TestUser('tuc', { pub: '3conGDUXdrTGbQPMQQhEC4Ubu1MCAnFrAYvUaewbUhtk', sec: '5ks7qQ8Fpkin7ycXpxQSxxjVhs8VTzpM3vEBMqM7NfC1ZiFJ93uQryDcoM93Mj77T6hDAABdeHZJDFnkDb35bgiU'}, { server: s1 });

    await s1.initWithDAL().then(BmaDependency.duniter.methods.bma).then((bmapi) => bmapi.openConnections());
    await cat.createIdentity();
    await toc.createIdentity();
    await toc.cert(cat);
    await cat.cert(toc);
    await cat.join();
    await toc.join();
    await s1.commit();
    await s1.commit();
    await tic.createIdentity();
    await cat.cert(tic);
    await toc.cert(tic);
    await tuc.createIdentity();
    await tuc.join();
    await s1.commit();
    await s1.commit();
    await s1.commit();
    await s1.commit();
  });

  after(() => {
    return Promise.all([
      shutDownEngine(s1)
    ])
  })

  describe("Server 1 /blockchain", function() {

    it('/current should exist', function() {
      return expectJSON(rp('http://127.0.0.1:7783/blockchain/current', { json: true }), {
        number: 5
      });
    });

    it('should have forwarded pending identities + ceritifications of tic', function() {
      return expectAnswer(rp('http://127.0.0.1:7783/wot/lookup/tic', { json: true }), function(res:any) {
        res.should.have.property('results').length(1);
        res.results[0].should.have.property('uids').length(1);
        res.results[0].uids[0].should.have.property('others').length(2);
      });
    });

    it('should have forwarded pending identities + ceritifications of tuc', function() {
      return expectAnswer(rp('http://127.0.0.1:7783/wot/lookup/tuc', { json: true }), function(res:any) {
        res.should.have.property('results').length(1);
        res.results[0].should.have.property('uids').length(1);
        res.results[0].uids[0].should.have.property('others').length(0);
      });
    });

    it('should have forwarded membership demands', function() {
      return s1.dal.findNewcomers()
        .then(function(mss){
          mss.should.have.length(1);
        });
    });
  });
});
