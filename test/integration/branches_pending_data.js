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
const _         = require('underscore');
const duniter   = require('../../index');
const bma       = require('../../app/modules/bma').BmaDependency.duniter.methods.bma;
const TestUser  = require('./tools/TestUser').TestUser
const rp        = require('request-promise');
const httpTest  = require('./tools/http');
const commit    = require('./tools/commit');
const shutDownEngine  = require('./tools/shutDownEngine');

const expectJSON     = httpTest.expectJSON;
const expectAnswer   = httpTest.expectAnswer;

const MEMORY_MODE = true;
const commonConf = {
  ipv4: '127.0.0.1',
  currency: 'bb',
  httpLogs: true,
  forksize: 3,
  sigQty: 1
};

let s1, cat, toc, tic, tuc

describe("Pending data", function() {

  before(function() {

    s1 = duniter(
      '/bb6',
      MEMORY_MODE,
      _.extend({
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

    const commitS1 = commit(s1);

    return co(function *() {
      yield s1.initWithDAL().then(bma).then((bmapi) => bmapi.openConnections());
      yield cat.createIdentity();
      yield toc.createIdentity();
      yield toc.cert(cat);
      yield cat.cert(toc);
      yield cat.join();
      yield toc.join();
      yield commitS1();
      yield commitS1();
      yield tic.createIdentity();
      yield cat.cert(tic);
      yield toc.cert(tic);
      yield tuc.createIdentity();
      yield tuc.join();
      yield commitS1();
      yield commitS1();
      yield commitS1();
      yield commitS1();
    });
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
      return expectAnswer(rp('http://127.0.0.1:7783/wot/lookup/tic', { json: true }), function(res) {
        res.should.have.property('results').length(1);
        res.results[0].should.have.property('uids').length(1);
        res.results[0].uids[0].should.have.property('others').length(2);
      });
    });

    it('should have forwarded pending identities + ceritifications of tuc', function() {
      return expectAnswer(rp('http://127.0.0.1:7783/wot/lookup/tuc', { json: true }), function(res) {
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
