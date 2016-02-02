"use strict";

var co = require('co');
var _         = require('underscore');
var rp        = require('request-promise');
var httpTest  = require('./tools/http');
var node      = require('./tools/node');

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
        res.should.have.property('root').equal('C5929A95E17D36A89939E8657F3947B21210A1D904124B401ECB4ABEB9863F8C');
        res.should.have.property('leaves').length(1);
        res.leaves[0].should.equal('C5929A95E17D36A89939E8657F3947B21210A1D904124B401ECB4ABEB9863F8C');
      });
    });

    it('/peers?leaf=C5929A95E17D36A89939E8657F3947B21210A1D904124B401ECB4ABEB9863F8C', function() {
      return expectAnswer(rp('http://127.0.0.1:20501/network/peering/peers?leaf=C5929A95E17D36A89939E8657F3947B21210A1D904124B401ECB4ABEB9863F8C', { json: true }), (res) => {
        res.should.have.property('depth').equal(0);
        res.should.have.property('nodesCount').equal(0);
        res.should.have.property('leavesCount').equal(1);
        res.should.have.property('root').equal('C5929A95E17D36A89939E8657F3947B21210A1D904124B401ECB4ABEB9863F8C');
        res.should.have.property('leaves').length(0);
        res.should.have.property('leaf').have.property('hash').equal('C5929A95E17D36A89939E8657F3947B21210A1D904124B401ECB4ABEB9863F8C');
        res.should.have.property('leaf').have.property('value');
        res.should.have.property('leaf').have.property('value').have.property('pubkey').equal('HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd');
        res.should.have.property('leaf').have.property('value').have.property('block').equal('0-E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855');
        res.should.have.property('leaf').have.property('value').have.property('signature').equal('/xd4g6NtvZ6M1T/gRh/S72Esj15fH4U4Lcr3KfKRBq+n0g8G0FlOg7hHVhJ5UMjoqvO/WEAILKR0Zb9ur5rjCg==');
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
        res.should.have.property('root').equal('B1250488EEAC3AB64F65EBAF7EB49D6DF43D7AF81BFA76E1BD41AC4132FE63F6');
        res.should.have.property('leaves').length(2);
        res.leaves[0].should.equal('E2B4182EBF3DE126BFB99755A357C4194B7162EF7D4351495A49BE1224E492E5');
        res.leaves[1].should.equal('C5929A95E17D36A89939E8657F3947B21210A1D904124B401ECB4ABEB9863F8C');
      });
    });

    it('/peers?leaf=E2B4182EBF3DE126BFB99755A357C4194B7162EF7D4351495A49BE1224E492E5', function() {
      return expectAnswer(rp('http://127.0.0.1:20502/network/peering/peers?leaf=E2B4182EBF3DE126BFB99755A357C4194B7162EF7D4351495A49BE1224E492E5', { json: true }), (res) => {
        res.should.have.property('depth').equal(1);
        res.should.have.property('nodesCount').equal(1);
        res.should.have.property('leavesCount').equal(2);
        res.should.have.property('root').equal('B1250488EEAC3AB64F65EBAF7EB49D6DF43D7AF81BFA76E1BD41AC4132FE63F6');
        res.should.have.property('leaves').length(0);
        res.should.have.property('leaf').have.property('hash').equal('E2B4182EBF3DE126BFB99755A357C4194B7162EF7D4351495A49BE1224E492E5');
        res.should.have.property('leaf').have.property('value');
        res.should.have.property('leaf').have.property('value').have.property('pubkey').equal('DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo');
        res.should.have.property('leaf').have.property('value').have.property('block').equal('0-E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855');
        res.should.have.property('leaf').have.property('value').have.property('signature').equal('BhrZzTJb28/FTqAuIfFsVX1muCMqqNaT1RYMVUaKsryuELbchN1pJ09mwB7gcuLgrZ84ZA5lwernS/JL2RUPBQ==');
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
