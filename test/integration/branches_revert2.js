"use strict";

const co = require('co');
const _         = require('underscore');
const ucoin     = require('../../index');
const bma       = require('../../app/lib/streams/bma');
const user      = require('./tools/user');
const rp        = require('request-promise');
const httpTest  = require('./tools/http');
const commit    = require('./tools/commit');

const expectJSON     = httpTest.expectJSON;
const expectHttpCode = httpTest.expectHttpCode;
const expectAnswer = httpTest.expectAnswer;

const MEMORY_MODE = true;
const commonConf = {
  ipv4: '127.0.0.1',
  currency: 'bb',
  httpLogs: true,
  forksize: 3,
  parcatipate: false, // TODO: to remove when startGeneration will be an explicit call
  sigQty: 1
};

const s1 = ucoin({
  memory: MEMORY_MODE,
  name: 'bb11'
}, _.extend({
  port: '7712',
  pair: {
    pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd',
    sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'
  },
  participate: false, rootoffset: 10,
  sigQty: 1, dt: 1, ud0: 120
}, commonConf));

const cat = user('cat', { pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'}, { server: s1 });
const toc = user('toc', { pub: 'DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo', sec: '64EYRvdPpTfLGGmaX5nijLXRqWXaVz8r1Z1GtaahXwVSJGQRn7tqkxLb288zwSYzELMEG5ZhXSBYSxsTsz1m9y8F'}, { server: s1 });

describe("Revert two blocks", function() {

  const now = Math.floor(Date.now() / 1000);

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
      yield commit(s1)({ time: now + 10 });
      yield commit(s1)({ time: now + 10 });
      yield cat.sendP(51, toc);
      yield commit(s1)({ time: now + 10 });
      yield s1.revert();
    });
  });

  describe("Server 1 /blockchain", function() {

    it('/block/0 should exist', function() {
      return expectJSON(rp('http://127.0.0.1:7712/blockchain/block/0', { json: true }), {
        number: 0
      });
    });

    it('/block/1 should exist', function() {
      return expectJSON(rp('http://127.0.0.1:7712/blockchain/block/2', { json: true }), {
        number: 2,
        dividend: 120
      });
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
  });
});
