"use strict";

const _         = require('underscore');
const co        = require('co');
const should    = require('should');
const duniter   = require('../../index');
const bma       = require('../../app/modules/bma').BmaDependency.duniter.methods.bma;
const rp        = require('request-promise');
const httpTest  = require('./tools/http');
const shutDownEngine  = require('./tools/shutDownEngine');

const expectAnswer   = httpTest.expectAnswer;

const MEMORY_MODE = true;
const commonConf = {
  ipv4: '127.0.0.1',
  currency: 'bb',
  httpLogs: true,
  forksize: 3,
  sigQty: 1
};

let s1

describe("Branches", () => co(function*() {

  before(() => co(function*() {

    s1 = duniter(
      '/bb1',
      MEMORY_MODE,
      _.extend({
        port: '7778',
        pair: {
          pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd',
          sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'
        }
      }, commonConf));

    const server = yield s1.initWithDAL();
    const bmapi = yield bma(server);
    yield bmapi.openConnections();
  }));

  after(() => {
    return shutDownEngine(s1)
  })

  describe("Server 1 /blockchain", function() {

    it('should have a 3 blocks fork window size', function() {
      return expectAnswer(rp('http://127.0.0.1:7778/node/summary', { json: true }), function(res) {
        res.should.have.property('duniter').property('software').equal('duniter');
        res.should.have.property('duniter').property('version').equal('1.4.10');
        res.should.have.property('duniter').property('forkWindowSize').equal(3);
      });
    });
  });
}));
