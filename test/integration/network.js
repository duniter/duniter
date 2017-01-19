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
  sigQty: 1
};

const s1 = node({
  memory: MEMORY_MODE,
  name: 'bb33'
}, _.extend({
  ipv4: '127.0.0.1',
  port: '20501',
  remoteport: '20501',
  pair: {
    pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd',
    sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'
  },
  rootoffset: 10,
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
        res.should.have.property('root').equal('C3EAB939F0BEF711461A140A1BA2649C75905107FACA3BE9C5F76F7FD1C7BC5E');
        res.should.have.property('leaves').length(1);
        res.leaves[0].should.equal('C3EAB939F0BEF711461A140A1BA2649C75905107FACA3BE9C5F76F7FD1C7BC5E');
      });
    });

    it('/peers?leaf=C3EAB939F0BEF711461A140A1BA2649C75905107FACA3BE9C5F76F7FD1C7BC5E', function() {
      return expectAnswer(rp('http://127.0.0.1:20501/network/peering/peers?leaf=C3EAB939F0BEF711461A140A1BA2649C75905107FACA3BE9C5F76F7FD1C7BC5E', { json: true }), (res) => {
        res.should.have.property('depth').equal(0);
        res.should.have.property('nodesCount').equal(0);
        res.should.have.property('leavesCount').equal(1);
        res.should.have.property('root').equal('C3EAB939F0BEF711461A140A1BA2649C75905107FACA3BE9C5F76F7FD1C7BC5E');
        res.should.have.property('leaves').length(0);
        res.should.have.property('leaf').have.property('hash').equal('C3EAB939F0BEF711461A140A1BA2649C75905107FACA3BE9C5F76F7FD1C7BC5E');
        res.should.have.property('leaf').have.property('value');
        res.should.have.property('leaf').have.property('value').have.property('pubkey').equal('HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd');
        res.should.have.property('leaf').have.property('value').have.property('block').equal('0-E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855');
        res.should.have.property('leaf').have.property('value').have.property('signature').equal('V4fA6+ll3aLIkh9ixhdQyd6xJxcYGcbRQhA4P9ATp3m0jCwKq3zbU5udGstBPTUn9EgCOxt08gO7teM4EYO/DQ==');
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
        res.should.have.property('root').equal('61977D7C6EAF055F2F06D3C9DFC848C2B0E52E289DD728783FF608905002C840');
        res.should.have.property('leaves').length(2);
        res.leaves[0].should.equal('BDD850441E3CDEB9005345B425CDBDA83E7BC7E5D83E9130C6012084F93CD220');
        res.leaves[1].should.equal('C3EAB939F0BEF711461A140A1BA2649C75905107FACA3BE9C5F76F7FD1C7BC5E');
      });
    });

    it('/peers?leaf=BDD850441E3CDEB9005345B425CDBDA83E7BC7E5D83E9130C6012084F93CD220', function() {
      return expectAnswer(rp('http://127.0.0.1:20502/network/peering/peers?leaf=BDD850441E3CDEB9005345B425CDBDA83E7BC7E5D83E9130C6012084F93CD220', { json: true }), (res) => {
        res.should.have.property('depth').equal(1);
        res.should.have.property('nodesCount').equal(1);
        res.should.have.property('leavesCount').equal(2);
        res.should.have.property('root').equal('61977D7C6EAF055F2F06D3C9DFC848C2B0E52E289DD728783FF608905002C840');
        res.should.have.property('leaves').length(0);
        res.should.have.property('leaf').have.property('hash').equal('BDD850441E3CDEB9005345B425CDBDA83E7BC7E5D83E9130C6012084F93CD220');
        res.should.have.property('leaf').have.property('value');
        res.should.have.property('leaf').have.property('value').have.property('pubkey').equal('DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo');
        res.should.have.property('leaf').have.property('value').have.property('block').equal('0-E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855');
        res.should.have.property('leaf').have.property('value').have.property('signature').equal('pyQdsay3p2XUduM85A1eoUZbRu/7NnEQnMc+hWmIUpmylWTIMqoZmc3d6gIcaa/pvoVvV7QbldwXErpSy06FAQ==');
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
