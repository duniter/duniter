"use strict";

var co = require('co');
var _         = require('underscore');
var ucoin     = require('./../../index');
var bma       = require('./../../app/lib/streams/bma');
var user      = require('./tools/user');
var rp        = require('request-promise');
var httpTest  = require('./tools/http');
var commit    = require('./tools/commit');
var sync      = require('./tools/sync');
var node      = require('./tools/node');

var expectJSON     = httpTest.expectJSON;
var expectHttpCode = httpTest.expectHttpCode;
var expectAnswer = httpTest.expectAnswer;

var MEMORY_MODE = true;
var commonConf = {
  ipv4: '127.0.0.1',
  remoteipv4: '127.0.0.1',
  currency: 'bb',
  httpLogs: true,
  forksize: 3,
  parcatipate: false, // TODO: to remove when startGeneration will be an explicit call
  sigQty: 1
};

var s1 = node({
  memory: MEMORY_MODE,
  name: 'bb33'
}, _.extend({
  port: '20501',
  remoteport: '20501',
  pair: {
    pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd',
    sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'
  },
  participate: false, rootoffset: 10,
  sigQty: 1, dt: 0, ud0: 120
}, commonConf));

var s2 = node({
  memory: MEMORY_MODE,
  name: 'bb12'
}, _.extend({
  port: '20502',
  remoteport: '20502',
  pair: {
    pub: 'DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo',
    sec: '64EYRvdPpTfLGGmaX5nijLXRqWXaVz8r1Z1GtaahXwVSJGQRn7tqkxLb288zwSYzELMEG5ZhXSBYSxsTsz1m9y8F'
  }
}, commonConf));

var cat = user('cat', { pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'}, { server: s1 });
var toc = user('toc', { pub: 'DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo', sec: '64EYRvdPpTfLGGmaX5nijLXRqWXaVz8r1Z1GtaahXwVSJGQRn7tqkxLb288zwSYzELMEG5ZhXSBYSxsTsz1m9y8F'}, { server: s1 });

var now = Math.round(new Date().getTime()/1000);

describe("Network Merkle", function() {

  before(function() {

    return co(function *() {
      yield s1.startTesting();
      yield s2.startTesting();
      let peer1 = yield s1.peeringP();
      yield s2.submitPeerP(peer1);
    });
  });

  describe("Server 1 /network/peering", function() {

    it('/peers?leaves=true', function() {
      return expectAnswer(rp('http://127.0.0.1:20501/network/peering/peers?leaves=true', { json: true }), (res) => {
        res.should.have.property('depth').equal(0);
        res.should.have.property('nodesCount').equal(0);
        res.should.have.property('leavesCount').equal(1);
        res.should.have.property('root').equal('CB9F165229579D66447F4C5A0EABAD6F51985387');
        res.should.have.property('leaves').length(1);
        res.leaves[0].should.equal('CB9F165229579D66447F4C5A0EABAD6F51985387');
      });
    });

    it('/peers?leaf=CB9F165229579D66447F4C5A0EABAD6F51985387', function() {
      return expectAnswer(rp('http://127.0.0.1:20501/network/peering/peers?leaf=CB9F165229579D66447F4C5A0EABAD6F51985387', { json: true }), (res) => {
        res.should.have.property('depth').equal(0);
        res.should.have.property('nodesCount').equal(0);
        res.should.have.property('leavesCount').equal(1);
        res.should.have.property('root').equal('CB9F165229579D66447F4C5A0EABAD6F51985387');
        res.should.have.property('leaves').length(0);
        res.should.have.property('leaf').have.property('hash').equal('CB9F165229579D66447F4C5A0EABAD6F51985387');
        res.should.have.property('leaf').have.property('value');
        res.should.have.property('leaf').have.property('value').have.property('pubkey').equal('HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd');
        res.should.have.property('leaf').have.property('value').have.property('block').equal('0-DA39A3EE5E6B4B0D3255BFEF95601890AFD80709');
        res.should.have.property('leaf').have.property('value').have.property('signature').equal('iH35xyF95GMvXWKewJHhShkXNppU2/0p1EbQErgSbBipq6A2Ux9YwzSoPXXnCQCTrBSMKbc/KSDgtRuCmAIoBQ==');
        res.should.have.property('leaf').have.property('value').have.property('status').equal('UP');
        res.should.have.property('leaf').have.property('value').have.property('currency').equal('bb');
        res.should.have.property('leaf').have.property('value').have.property('endpoints').length(1);
        res.leaf.value.endpoints[0].should.equal('BASIC_MERKLED_API 127.0.0.1 20501');
      });
    });
  });

  describe("Server 2 /network/peering", function() {

    it('/peers?leaves=true', function() {
      return expectAnswer(rp('http://127.0.0.1:20502/network/peering/peers?leaves=true', { json: true }), (res) => {
        res.should.have.property('depth').equal(1);
        res.should.have.property('nodesCount').equal(1);
        res.should.have.property('leavesCount').equal(2);
        res.should.have.property('root').equal('EA6180FE4B924AFC64D3EE7D42C2C58CC4AF244B');
        res.should.have.property('leaves').length(2);
        res.leaves[0].should.equal('6F9D30999682338B713CEB3175C2406B5A438A65');
        res.leaves[1].should.equal('CB9F165229579D66447F4C5A0EABAD6F51985387');
      });
    });

    it('/peers?leaf=6F9D30999682338B713CEB3175C2406B5A438A65', function() {
      return expectAnswer(rp('http://127.0.0.1:20502/network/peering/peers?leaf=6F9D30999682338B713CEB3175C2406B5A438A65', { json: true }), (res) => {
        res.should.have.property('depth').equal(1);
        res.should.have.property('nodesCount').equal(1);
        res.should.have.property('leavesCount').equal(2);
        res.should.have.property('root').equal('EA6180FE4B924AFC64D3EE7D42C2C58CC4AF244B');
        res.should.have.property('leaves').length(0);
        res.should.have.property('leaf').have.property('hash').equal('6F9D30999682338B713CEB3175C2406B5A438A65');
        res.should.have.property('leaf').have.property('value');
        res.should.have.property('leaf').have.property('value').have.property('pubkey').equal('DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo');
        res.should.have.property('leaf').have.property('value').have.property('block').equal('0-DA39A3EE5E6B4B0D3255BFEF95601890AFD80709');
        res.should.have.property('leaf').have.property('value').have.property('signature').equal('bSWLDHDPUs7U8+tgVFcny5li3FBeTXeNhf7jkAeFBHG9B1SUWs75vPoHE4TUQVNyxfZ9vjx6U8lf8HAPxTcLAw==');
        res.should.have.property('leaf').have.property('value').have.property('status').equal('UP');
        res.should.have.property('leaf').have.property('value').have.property('currency').equal('bb');
        res.should.have.property('leaf').have.property('value').have.property('endpoints').length(1);
        res.leaf.value.endpoints[0].should.equal('BASIC_MERKLED_API 127.0.0.1 20502');
      });
    });
  });

  it('/peers?leaf=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', function() {
    return expectHttpCode(404, rp('http://127.0.0.1:20502/network/peering/peers?leaf=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', { json: true }));
  });
});
