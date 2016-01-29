"use strict";

var co = require('co');
var _         = require('underscore');
var ucoin     = require('./../../index');
var bma       = require('./../../app/lib/streams/bma');
var user      = require('./tools/user');
var rp        = require('request-promise');
var httpTest  = require('./tools/http');
var commit    = require('./tools/commit');

var expectJSON     = httpTest.expectJSON;
var expectHttpCode = httpTest.expectHttpCode;

var MEMORY_MODE = true;
var commonConf = {
  ipv4: '127.0.0.1',
  currency: 'bb',
  httpLogs: true,
  forksize: 3,
  parcatipate: false, // TODO: to remove when startGeneration will be an explicit call
  sigQty: 1
};

var s1 = ucoin({
  memory: MEMORY_MODE,
  name: 'bb11'
}, _.extend({
  port: '7711',
  pair: {
    pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd',
    sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'
  },
  participate: false, rootoffset: 10,
  sigQty: 1, dt: 0, ud0: 120
}, commonConf));

var cat = user('cat', { pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'}, { server: s1 });
var toc = user('toc', { pub: 'DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo', sec: '64EYRvdPpTfLGGmaX5nijLXRqWXaVz8r1Z1GtaahXwVSJGQRn7tqkxLb288zwSYzELMEG5ZhXSBYSxsTsz1m9y8F'}, { server: s1 });

describe("Revert root", function() {

  before(function() {

    return co(function *() {
      yield s1.initWithServices().then(bma);
      yield cat.selfCertPromise();
      yield toc.selfCertPromise();
      yield toc.certPromise(cat);
      yield cat.certPromise(toc);
      yield cat.joinPromise();
      yield toc.joinPromise();
      yield commit(s1)();
      yield s1.revert();
      yield commit(s1)();
      yield commit(s1)();
    });
  });

  describe("Server 1 /blockchain", function() {

    it('/block/0 should exist', function() {
      return expectJSON(rp('http://127.0.0.1:7711/blockchain/block/0', { json: true }), {
        number: 0
      });
    });

    it('/block/1 should exist', function() {
      return expectJSON(rp('http://127.0.0.1:7711/blockchain/block/1', { json: true }), {
        number: 1
      });
    });

    it('/block/2 should exist', function() {
      return httpTest.expectError(404, 'Block not found', rp('http://127.0.0.1:7711/blockchain/block/2', { json: true }));
    });

    // Revert then Commit should be a neutral operation

    //it('should conserve newcomers', function() {});
    //it('should conserve identity joining back', function() {});
    //it('should conserve identity active', function() {});
    //it('should conserve identity leaving', function() {});
    //it('should conserve excluded', function() {});
  });
});
