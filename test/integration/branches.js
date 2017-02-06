"use strict";

const _         = require('underscore');
const co        = require('co');
const should    = require('should');
const duniter   = require('../../index');
const bma       = require('duniter-bma').duniter.methods.bma;
const rp        = require('request-promise');
const httpTest  = require('./tools/http');

const expectAnswer   = httpTest.expectAnswer;

const MEMORY_MODE = true;
const commonConf = {
  ipv4: '127.0.0.1',
  currency: 'bb',
  httpLogs: true,
  forksize: 3,
  sigQty: 1
};

const s1 = duniter(
  '/bb1',
  MEMORY_MODE,
  _.extend({
  port: '7778',
  pair: {
    pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd',
    sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'
  }
}, commonConf));

describe("Branches", () => co(function*() {

  before(() => co(function*() {
    const server = yield s1.initWithDAL();
    const bmapi = yield bma(server);
    yield bmapi.openConnections();
  }));

  describe("Server 1 /blockchain", function() {

    it('should have a 3 blocks fork window size', function() {
      return expectAnswer(rp('http://127.0.0.1:7778/node/summary', { json: true }), function(res) {
        res.should.have.property('duniter').property('software').equal('duniter');
        res.should.have.property('duniter').property('version').equal('0.90.6');
        res.should.have.property('duniter').property('forkWindowSize').equal(3);
      });
    });
  });
}));
