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

import {NewTestingServer, TestingServer} from "../tools/toolbox"
import {TestUser} from "../tools/TestUser"
import {BmaDependency} from "../../../app/modules/bma/index"
import {Underscore} from "../../../app/lib/common-libs/underscore"
import {ProverConstants} from "../../../app/modules/prover/lib/constants"
import {shutDownEngine} from "../tools/shutdown-engine"
import {expectAnswer, expectHttpCode, expectJSON} from "../tools/http-expect"
import {CommonConstants} from "../../../app/lib/common-libs/constants"

const rp        = require('request-promise');

ProverConstants.CORES_MAXIMUM_USE_IN_PARALLEL = 1
BmaDependency.duniter.methods.noLimit(); // Disables the HTTP limiter

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

let s1:TestingServer, cat:TestUser, toc:TestUser

describe("Revert two blocks", function() {

  before(async () => {

    CommonConstants.DUBP_NEXT_VERSION = 11

    s1 = NewTestingServer(
      Underscore.extend({
        name: 'bb11',
        memory: MEMORY_MODE,
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

    await s1.initWithDAL().then(BmaDependency.duniter.methods.bma).then((bmapi) => bmapi.openConnections());
    await cat.createIdentity();
    await toc.createIdentity();
    await toc.cert(cat);
    await cat.cert(toc);
    await cat.join();
    await toc.join();
    await s1.commit({ time: now });
    await s1.commit({ time: now + 1 });
    await s1.commit({ time: now + 1 });
    await cat.sendMoney(51, toc);
    await s1.commit({ time: now + 1 });
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

    it('/tx/sources/HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd should have nothing left because of garbaging', function() {
      return expectAnswer(rp('http://127.0.0.1:7712/tx/sources/HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd'), (body:string) => {
        let res = JSON.parse(body);
        res.sources.should.have.length(0)
      });
    });

    it('/tx/sources/DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo should have both UD and TX from cat', function() {
      return expectAnswer(rp('http://127.0.0.1:7712/tx/sources/DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo'), (body:string) => {
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

    it('/tx/sources/DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV should have nothing', function() {
      return expectAnswer(rp('http://127.0.0.1:7712/tx/sources/DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV'), (body:string) => {
        let res = JSON.parse(body);
        res.sources.should.have.length(0);
      });
    });
  })

  describe("after revert of transaction", () => {

    before(async () => {
      await s1.revert();
    })

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

    it('/tx/sources/HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd should have only its UD', function() {
      return expectAnswer(rp('http://127.0.0.1:7712/tx/sources/HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd'), (body:string) => {
        let res = JSON.parse(body);
        res.sources.should.have.length(1);
        res.sources[0].should.have.property('identifier').equal('HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd');
        res.sources[0].should.have.property('type').equal('D');
        res.sources[0].should.have.property('noffset').equal(2);
        res.sources[0].should.have.property('amount').equal(120);
      });
    });

    it('/tx/sources/DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo should have only its UD', function() {
      return expectAnswer(rp('http://127.0.0.1:7712/tx/sources/DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo'), (body:string) => {
        let res = JSON.parse(body);
        res.sources.should.have.length(1);
        res.sources[0].should.have.property('identifier').equal('DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo');
        res.sources[0].should.have.property('type').equal('D');
        res.sources[0].should.have.property('noffset').equal(2);
        res.sources[0].should.have.property('amount').equal(120);
      });
    });

    it('/tx/sources/DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV should have nothing', function() {
      return expectAnswer(rp('http://127.0.0.1:7712/tx/sources/DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV'), (body:string) => {
        let res = JSON.parse(body);
        res.sources.should.have.length(0);
      });
    });
  })

  describe("after revert of UD", () => {

    before(async () => {
      await s1.revert();
    })

    it('/block/0 should exist', function() {
      return expectJSON(rp('http://127.0.0.1:7712/blockchain/block/0', { json: true }), {
        number: 0
      });
    });

    it('/block/2 should NOT exist', function() {
      return expectHttpCode(404, rp('http://127.0.0.1:7712/blockchain/block/2', { json: true }));
    });

    it('/tx/sources/HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd should have nothing', function() {
      return expectAnswer(rp('http://127.0.0.1:7712/tx/sources/HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd'), (body:string) => {
        let res = JSON.parse(body);
        res.sources.should.have.length(0)
      });
    });

    it('/tx/sources/DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo should have nothing', function() {
      return expectAnswer(rp('http://127.0.0.1:7712/tx/sources/DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo'), (body:string) => {
        let res = JSON.parse(body);
        res.sources.should.have.length(0)
      });
    });

    it('/tx/sources/DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV should have nothing', function() {
      return expectAnswer(rp('http://127.0.0.1:7712/tx/sources/DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV'), (body:string) => {
        let res = JSON.parse(body);
        res.sources.should.have.length(0)
      });
    });
  })

  describe("commit again (but send less, to check that the account is not cleaned this time)", () => {

    before(async () => {
      await s1.dal.txsDAL.removeAll()
      await s1.resolveExistingBlock(b => b.number === 2) // UD block
      await cat.sendMoney(19, toc);
      await s1.dal.blockDAL.removeForkBlock(3)
      await s1.commit({ time: now + 1 });
    })

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

    it('/tx/sources/HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd should have the rest of its sent TX', function() {
      return expectAnswer(rp('http://127.0.0.1:7712/tx/sources/HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd'), (body:string) => {
        let res = JSON.parse(body);
        res.sources.should.have.length(1);
        res.sources[0].should.have.property('identifier').equal('EE74E456FC16888FF24C3A9749B9E3A8D5005A9CCE988B2CFF4619AFEA50F890');
        res.sources[0].should.have.property('type').equal('T');
        res.sources[0].should.have.property('noffset').equal(1);
        res.sources[0].should.have.property('amount').equal(101);
      });
    });

    it('/tx/sources/DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo should have both UD and TX from cat', function() {
      return expectAnswer(rp('http://127.0.0.1:7712/tx/sources/DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo'), (body:string) => {
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
      return expectAnswer(rp('http://127.0.0.1:7712/tx/sources/DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV'), (body:string) => {
        let res = JSON.parse(body);
        res.sources.should.have.length(0);
      });
    });
  })

  after(() => {
    CommonConstants.DUBP_NEXT_VERSION = 10
  })
});
