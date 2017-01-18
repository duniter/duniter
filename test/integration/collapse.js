"use strict";

const co        = require('co');
const _         = require('underscore');
const duniter     = require('../../index');
const bma       = require('duniter-bma').duniter.methods.bma;
const user      = require('./tools/user');
const commit    = require('./tools/commit');
const httpTest  = require('./tools/http');
const rp        = require('request-promise');

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
  port: '9340',
  pair: {
    pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd',
    sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'
  },
  rootoffset: 10,
  sigQty: 1, dt: 100, ud0: 120, sigValidity: 1
}, commonConf));

const cat = user('cat', { pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'}, { server: s1 });
const tac = user('tac', { pub: 'DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV', sec: '468Q1XtTq7h84NorZdWBZFJrGkB18CbmbHr9tkp9snt5GiERP7ySs3wM8myLccbAAGejgMRC9rqnXuW3iAfZACm7'}, { server: s1 });

describe("Community collapse", function() {

  const now = Math.round(Date.now() / 1000);

  before(function() {

    return co(function *() {
      yield s1.initWithDAL().then(bma).then((bmapi) => bmapi.openConnections());
      yield cat.createIdentity();
      yield tac.createIdentity();
      yield cat.join();
      yield tac.join();
      yield cat.cert(tac);
      yield tac.cert(cat);
      yield commit(s1)({ time: now });
      yield commit(s1)({ time: now + 10 });
      yield commit(s1)({ time: now + 10 });
      yield commit(s1)({ time: now + 10 });
    });
  });

  it('should be handled', function() {
    return httpTest.expectJSON(rp('http://127.0.0.1:9340/blockchain/block/2', { json: true }), {
      number: 2
    });
  });
});
