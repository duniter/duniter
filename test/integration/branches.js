"use strict";

var _         = require('underscore');
var should    = require('should');
var ucoin     = require('./../../index');
var bma       = require('./../../app/lib/streams/bma');
var rp        = require('request-promise');
var httpTest  = require('./tools/http');

var expectAnswer   = httpTest.expectAnswer;

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
  name: 'bb1'
}, _.extend({
  port: '7778',
  pair: {
    pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd',
    sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'
  }
}, commonConf));

describe("Branches", function() {

  before(() => s1.initWithDAL().then(bma).then((bmapi) => bmapi.openConnections()));

  describe("Server 1 /blockchain", function() {

    it('should have a 3 blocks fork window size', function() {
      return expectAnswer(rp('http://127.0.0.1:7778/node/summary', { json: true }), function(res) {
        res.should.have.property('duniter').property('software').equal('duniter');
        res.should.have.property('duniter').property('version').equal('0.20.0a57');
        res.should.have.property('duniter').property('forkWindowSize').equal(3);
      });
    });
  });
});
