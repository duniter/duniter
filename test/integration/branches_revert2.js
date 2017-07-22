"use strict";

const co = require('co');
const _         = require('underscore');
const duniter     = require('../../index');
const bma       = require('../../app/modules/bma').BmaDependency.duniter.methods.bma;
const user      = require('./tools/user');
const rp        = require('request-promise');
const httpTest  = require('./tools/http');
const commit    = require('./tools/commit');

require('../../app/modules/prover/lib/constants').Constants.CORES_MAXIMUM_USE_IN_PARALLEL = 1
require('../../app/modules/bma').BmaDependency.duniter.methods.noLimit(); // Disables the HTTP limiter

const expectJSON     = httpTest.expectJSON;
const expectHttpCode = httpTest.expectHttpCode;
const expectAnswer = httpTest.expectAnswer;

const now = 1490000000;

const MEMORY_MODE = true;
const commonConf = {
  ipv4: '127.0.0.1',
  currency: 'bb',
  httpLogs: true,
  forksize: 3,
  sigQty: 1
};

const s1 = duniter(
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

const cat = user('cat', { pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'}, { server: s1 });
const toc = user('toc', { pub: 'DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo', sec: '64EYRvdPpTfLGGmaX5nijLXRqWXaVz8r1Z1GtaahXwVSJGQRn7tqkxLb288zwSYzELMEG5ZhXSBYSxsTsz1m9y8F'}, { server: s1 });

describe("Revert two blocks", function() {

  before(function() {

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
        res.sources[1].should.have.property('identifier').equal('46D1D89CA40FBDD95A9412EF6547292CB9741DDE7D2B8A9C1D53648EFA794D44');
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
        res.sources[0].should.have.property('identifier').equal('7F951D4B73FB65995A1F343366A8CD3B0C76028120FD590170B251EB109926FB');
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
        res.sources[1].should.have.property('identifier').equal('7F951D4B73FB65995A1F343366A8CD3B0C76028120FD590170B251EB109926FB');
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
});
