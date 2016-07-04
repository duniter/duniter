"use strict";

const co = require('co');
const _         = require('underscore');
const rp        = require('request-promise');
const httpTest  = require('./tools/http');
const node      = require('./tools/node');

const expectHttpCode = httpTest.expectHttpCode;
const expectAnswer = httpTest.expectAnswer;

const MEMORY_MODE = true;
const commonConf = {
  ipv4: '127.0.0.1',
  remoteipv4: '127.0.0.1',
  currency: 'bb',
  httpLogs: true,
  forksize: 3,
  parcatipate: false, // TODO: to remove when startGeneration will be an explicit call
  sigQty: 1
};

const s1 = node({
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

const s2 = node({
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
        res.should.have.property('root').equal('DEDB9A162DC1501491E5E62960E4899D5D644F31352174414C91CB34FB1FFC35');
        res.should.have.property('leaves').length(1);
        res.leaves[0].should.equal('DEDB9A162DC1501491E5E62960E4899D5D644F31352174414C91CB34FB1FFC35');
      });
    });

    it('/peers?leaf=DEDB9A162DC1501491E5E62960E4899D5D644F31352174414C91CB34FB1FFC35', function() {
      return expectAnswer(rp('http://127.0.0.1:20501/network/peering/peers?leaf=DEDB9A162DC1501491E5E62960E4899D5D644F31352174414C91CB34FB1FFC35', { json: true }), (res) => {
        res.should.have.property('depth').equal(0);
        res.should.have.property('nodesCount').equal(0);
        res.should.have.property('leavesCount').equal(1);
        res.should.have.property('root').equal('DEDB9A162DC1501491E5E62960E4899D5D644F31352174414C91CB34FB1FFC35');
        res.should.have.property('leaves').length(0);
        res.should.have.property('leaf').have.property('hash').equal('DEDB9A162DC1501491E5E62960E4899D5D644F31352174414C91CB34FB1FFC35');
        res.should.have.property('leaf').have.property('value');
        res.should.have.property('leaf').have.property('value').have.property('pubkey').equal('HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd');
        res.should.have.property('leaf').have.property('value').have.property('block').equal('0-E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855');
        res.should.have.property('leaf').have.property('value').have.property('signature').equal('sxV6GN28vEup0pqXeJQn+l1IAoLIQFbJaW5WLvmreUZj3+kS9N5MWYnLuTze6VDd3baHbx+yZJ25ULPaDUYdDA==');
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
        res.should.have.property('root').equal('75C5C6454FB56E1E999945454EF38EFD653686E516B13A571980B0DA3F899BFB');
        res.should.have.property('leaves').length(2);
        res.leaves[0].should.equal('069EDBB63D06526422AA7BA673B69C9EC6606EA1A712D2F7304879403E4A3DE3');
        res.leaves[1].should.equal('DEDB9A162DC1501491E5E62960E4899D5D644F31352174414C91CB34FB1FFC35');
      });
    });

    it('/peers?leaf=069EDBB63D06526422AA7BA673B69C9EC6606EA1A712D2F7304879403E4A3DE3', function() {
      return expectAnswer(rp('http://127.0.0.1:20502/network/peering/peers?leaf=069EDBB63D06526422AA7BA673B69C9EC6606EA1A712D2F7304879403E4A3DE3', { json: true }), (res) => {
        res.should.have.property('depth').equal(1);
        res.should.have.property('nodesCount').equal(1);
        res.should.have.property('leavesCount').equal(2);
        res.should.have.property('root').equal('75C5C6454FB56E1E999945454EF38EFD653686E516B13A571980B0DA3F899BFB');
        res.should.have.property('leaves').length(0);
        res.should.have.property('leaf').have.property('hash').equal('069EDBB63D06526422AA7BA673B69C9EC6606EA1A712D2F7304879403E4A3DE3');
        res.should.have.property('leaf').have.property('value');
        res.should.have.property('leaf').have.property('value').have.property('pubkey').equal('DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo');
        res.should.have.property('leaf').have.property('value').have.property('block').equal('0-E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855');
        res.should.have.property('leaf').have.property('value').have.property('signature').equal('iwUI8OzkxuQPZj5rF5lCwmvaGOplNm0+J1BM90Q44uw3475g2ZafkNUqL/xy47NgsfRX2vcrVv3iClojuzPcAg==');
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
