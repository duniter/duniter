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
const duniter     = require('../../index');
const bma       = require('../../app/modules/bma').BmaDependency.duniter.methods.bma;
const TestUser  = require('./tools/TestUser').TestUser
const rp        = require('request-promise');
const httpTest  = require('./tools/http');
const commit    = require('./tools/commit');
const shutDownEngine  = require('./tools/shutDownEngine');
const CommonConstants = require('./../../app/lib/common-libs/constants').CommonConstants

require('../../app/modules/prover/lib/constants').ProverConstants.CORES_MAXIMUM_USE_IN_PARALLEL = 1
require('../../app/modules/bma').BmaDependency.duniter.methods.noLimit(); // Disables the HTTP limiter

const expectJSON     = httpTest.expectJSON;
const expectHttpCode = httpTest.expectHttpCode;
const expectAnswer = httpTest.expectAnswer;

const now = 1490000000;

const MEMORY_MODE = true;
const commonConf = {
  ipv4: '127.0.0.1',
  currency: 'bb',
  nbCores:1,
  httpLogs: true,
  forksize: 3,
  sigQty: 1
};

let s1, cat, toc

describe("Revert two blocks", function() {

  before(function() {

    CommonConstants.BLOCK_NEW_GENERATED_VERSION = 11

    s1 = duniter(
      '/bb11',
      MEMORY_MODE,
      _.extend({
        port: '7712',
        pair: {
          pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd',
          sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'
        },
        udTime0: now + 1,
        udReevalTime0: now + 1,
        medianTimeBlocks: 1,
        sigQty: 1, dt: 1, ud0: 120
      }, commonConf));

    cat = new TestUser('cat', { pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'}, { server: s1 });
    toc = new TestUser('toc', { pub: 'DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo', sec: '64EYRvdPpTfLGGmaX5nijLXRqWXaVz8r1Z1GtaahXwVSJGQRn7tqkxLb288zwSYzELMEG5ZhXSBYSxsTsz1m9y8F'}, { server: s1 });

    return co(function *() {
      yield s1.initWithDAL().then(bma).then((bmapi) => bmapi.openConnections());
      yield cat.createIdentity();
      yield toc.createIdentity();
      yield toc.cert(cat);
      yield cat.cert(toc);
      yield cat.join();
      yield toc.join();
      yield commit(s1)({ time: now });
      yield commit(s1)({ time: now + 1 });
      yield commit(s1)({ time: now + 1 });
      yield cat.sendP(51, toc);
      yield commit(s1)({ time: now + 1 });
    });
  });

  after(() => {
    return Promise.all([
      shutDownEngine(s1)
    ])
  })

  describe("before revert", () => {

    it('/block/0 should exist', function() {
      return expectJSON(rp('http://127.0.0.1:7712/blockchain/block/0', { json: true }), {
        number: 0
      });
    });

    it('/block/2 should exist', function() {
      return expectJSON(rp('http://127.0.0.1:7712/blockchain/block/2', { json: true }), {
        number: 2,
        dividend: 120
      });
    });

    it('/block/3 should exist', function() {
      return expectJSON(rp('http://127.0.0.1:7712/blockchain/block/3', { json: true }), {
        number: 3,
        dividend: null
      });
    });

    it('/tx/sources/HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd should have only UD', function() {
      return expectAnswer(rp('http://127.0.0.1:7712/tx/sources/HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd'), (body) => {
        let res = JSON.parse(body);
        res.sources.should.have.length(0)
      });
    });

    it('/tx/sources/DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo should have only UD', function() {
      return expectAnswer(rp('http://127.0.0.1:7712/tx/sources/DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo'), (body) => {
        let res = JSON.parse(body);
        res.sources.should.have.length(2);
        res.sources[0].should.have.property('identifier').equal('DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo');
        res.sources[0].should.have.property('type').equal('D');
        res.sources[0].should.have.property('noffset').equal(2);
        res.sources[0].should.have.property('amount').equal(120);
        res.sources[1].should.have.property('identifier').equal('5F91D05DD1B1C9CAFDBCF5538C63DAF770A20790D08C9A88E0625A8D5599825D');
        res.sources[1].should.have.property('type').equal('T');
        res.sources[1].should.have.property('noffset').equal(0);
        res.sources[1].should.have.property('amount').equal(51);
      });
    });

    it('/tx/sources/DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV should have only UD', function() {
      return expectAnswer(rp('http://127.0.0.1:7712/tx/sources/DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV'), (body) => {
        let res = JSON.parse(body);
        res.sources.should.have.length(0);
      });
    });
  })

  describe("after revert", () => {

    before(() => co(function*() {
      yield s1.revert();
    }))

    it('/block/0 should exist', function() {
      return expectJSON(rp('http://127.0.0.1:7712/blockchain/block/0', { json: true }), {
        number: 0
      });
    });

    it('/block/2 should exist', function() {
      return expectJSON(rp('http://127.0.0.1:7712/blockchain/block/2', { json: true }), {
        number: 2,
        dividend: 120
      });
    });

    it('/block/3 should NOT exist', function() {
      return expectHttpCode(404, rp('http://127.0.0.1:7712/blockchain/block/3', { json: true }));
    });

    it('/tx/sources/HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd should have only UD', function() {
      return expectAnswer(rp('http://127.0.0.1:7712/tx/sources/HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd'), (body) => {
        let res = JSON.parse(body);
        res.sources.should.have.length(1);
        res.sources[0].should.have.property('identifier').equal('HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd');
        res.sources[0].should.have.property('type').equal('D');
        res.sources[0].should.have.property('noffset').equal(2);
        res.sources[0].should.have.property('amount').equal(120);
      });
    });

    it('/tx/sources/DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo should have only UD', function() {
      return expectAnswer(rp('http://127.0.0.1:7712/tx/sources/DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo'), (body) => {
        let res = JSON.parse(body);
        res.sources.should.have.length(1);
        res.sources[0].should.have.property('identifier').equal('DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo');
        res.sources[0].should.have.property('type').equal('D');
        res.sources[0].should.have.property('noffset').equal(2);
        res.sources[0].should.have.property('amount').equal(120);
      });
    });

    it('/tx/sources/DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV should have only UD', function() {
      return expectAnswer(rp('http://127.0.0.1:7712/tx/sources/DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV'), (body) => {
        let res = JSON.parse(body);
        res.sources.should.have.length(0);
      });
    });
  })

  describe("commit again (but send less, to check that the account is not cleaned this time)", () => {

    before(() => co(function*() {
      yield s1.dal.txsDAL.sqlDeleteAll()
      yield cat.sendP(19, toc);
      yield s1.dal.blockDAL.exec('DELETE FROM block WHERE fork AND number = 3')
      yield commit(s1)({ time: now + 1 });
    }))

    it('/block/0 should exist', function() {
      return expectJSON(rp('http://127.0.0.1:7712/blockchain/block/0', { json: true }), {
        number: 0
      });
    });

    it('/block/2 should exist', function() {
      return expectJSON(rp('http://127.0.0.1:7712/blockchain/block/2', { json: true }), {
        number: 2,
        dividend: 120
      });
    });

    it('/block/3 should exist', function() {
      return expectJSON(rp('http://127.0.0.1:7712/blockchain/block/3', { json: true }), {
        number: 3,
        dividend: null
      });
    });

    it('/tx/sources/HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd should have only UD', function() {
      return expectAnswer(rp('http://127.0.0.1:7712/tx/sources/HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd'), (body) => {
        let res = JSON.parse(body);
        res.sources.should.have.length(1);
        res.sources[0].should.have.property('identifier').equal('EE74E456FC16888FF24C3A9749B9E3A8D5005A9CCE988B2CFF4619AFEA50F890');
        res.sources[0].should.have.property('type').equal('T');
        res.sources[0].should.have.property('noffset').equal(1);
        res.sources[0].should.have.property('amount').equal(101);
      });
    });

    it('/tx/sources/DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo should have only UD', function() {
      return expectAnswer(rp('http://127.0.0.1:7712/tx/sources/DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo'), (body) => {
        let res = JSON.parse(body);
        res.sources.should.have.length(2);
        res.sources[0].should.have.property('identifier').equal('DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo');
        res.sources[0].should.have.property('type').equal('D');
        res.sources[0].should.have.property('noffset').equal(2);
        res.sources[0].should.have.property('amount').equal(120);
        res.sources[1].should.have.property('identifier').equal('EE74E456FC16888FF24C3A9749B9E3A8D5005A9CCE988B2CFF4619AFEA50F890');
        res.sources[1].should.have.property('type').equal('T');
        res.sources[1].should.have.property('noffset').equal(0);
        res.sources[1].should.have.property('amount').equal(19);
      });
    });

    it('/tx/sources/DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV should have only UD', function() {
      return expectAnswer(rp('http://127.0.0.1:7712/tx/sources/DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV'), (body) => {
        let res = JSON.parse(body);
        res.sources.should.have.length(0);
      });
    });
  })

  after(() => {
    CommonConstants.BLOCK_NEW_GENERATED_VERSION = 10
  })
});
