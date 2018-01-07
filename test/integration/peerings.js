"use strict";

const co        = require('co');
const _         = require('underscore');
const should    = require('should');
const duniter     = require('../../index');
const bma       = require('../../app/modules/bma').BmaDependency.duniter.methods.bma;
const TestUser  = require('./tools/TestUser').TestUser
const constants = require('../../app/lib/constants');
const rp        = require('request-promise');
const httpTest  = require('./tools/http');
const commit    = require('./tools/commit');
const sync      = require('./tools/sync');
const toolbox   = require('./tools/toolbox');
const contacter  = require('../../app/modules/crawler').CrawlerDependency.duniter.methods.contacter;
const until     = require('./tools/until');
const shutDownEngine  = require('./tools/shutDownEngine');
const multicaster = require('../../app/lib/streams/multicaster');
const PeerDTO = require('../../app/lib/dto/PeerDTO').PeerDTO

const expectJSON     = httpTest.expectJSON;

const MEMORY_MODE = true;
const commonConf = {
  bmaWithCrawler: true,
  ipv4: '127.0.0.1',
  remoteipv4: '127.0.0.1',
  currency: 'bb',
  httpLogs: true,
  forksize: 3,
  sigQty: 1
};

let s1, s2, s3, cat, toc, tic

let nodeS1;
let nodeS2;
let nodeS3;

describe("Network", function() {

  before(function() {

    s1 = duniter(
      'bb_net1',
      MEMORY_MODE,
      _.extend({
        port: '7784',
        pair: {
          pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd',
          sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'
        }
      }, commonConf));

    s2 = duniter(
      'bb_net2',
      MEMORY_MODE,
      _.extend({
        port: '7785',
        pair: {
          pub: 'DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo',
          sec: '64EYRvdPpTfLGGmaX5nijLXRqWXaVz8r1Z1GtaahXwVSJGQRn7tqkxLb288zwSYzELMEG5ZhXSBYSxsTsz1m9y8F'
        }
      }, commonConf));

    s3 = duniter(
      'bb_net3',
      MEMORY_MODE,
      _.extend({
        port: '7786',
        pair: {
          pub: 'DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV',
          sec: '468Q1XtTq7h84NorZdWBZFJrGkB18CbmbHr9tkp9snt5GiERP7ySs3wM8myLccbAAGejgMRC9rqnXuW3iAfZACm7'
        }
      }, commonConf));

    cat = new TestUser('cat', { pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'}, { server: s1 });
    toc = new TestUser('toc', { pub: 'DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo', sec: '64EYRvdPpTfLGGmaX5nijLXRqWXaVz8r1Z1GtaahXwVSJGQRn7tqkxLb288zwSYzELMEG5ZhXSBYSxsTsz1m9y8F'}, { server: s1 });
    tic = new TestUser('tic', { pub: 'DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV', sec: '468Q1XtTq7h84NorZdWBZFJrGkB18CbmbHr9tkp9snt5GiERP7ySs3wM8myLccbAAGejgMRC9rqnXuW3iAfZACm7'}, { server: s1 });

    const commitS1 = commit(s1);
    const commitS2 = commit(s2);
    const commitS3 = commit(s3);

    return [s1, s2, s3].reduce(function(p, server) {
      server.addEndpointsDefinitions(() => require('../../app/modules/bma').BmaDependency.duniter.methods.getMainEndpoint(server.conf))
      return p
        .then(function(){
          return server
            .initWithDAL()
            .then(bma)
            .then(function(bmaAPI){
              return bmaAPI.openConnections()
                .then(() => {
                  server.bma = bmaAPI;
                  require('../../app/modules/router').RouterDependency.duniter.methods.routeToNetwork(server);
                });
            });
        });
    }, Promise.resolve())

      .then(function(){
        return co(function *() {
          nodeS1 = contacter('127.0.0.1', s1.conf.port);
          nodeS2 = contacter('127.0.0.1', s2.conf.port);
          nodeS3 = contacter('127.0.0.1', s3.conf.port);
          // Server 1
          yield cat.createIdentity();
          yield toc.createIdentity();
          yield tic.createIdentity();
          yield toc.cert(cat);
          yield cat.cert(toc);
          yield cat.cert(tic);
          yield cat.join();
          yield toc.join();
          yield tic.join();
          yield commitS1();
          // Server 2 syncs block 0
          yield sync(0, 0, s1, s2);
          yield toolbox.serverWaitBlock(s1, 0)
          // Server 3 syncs block 0
          yield sync(0, 0, s1, s3);
          yield toolbox.serverWaitBlock(s3, 0)
          yield nodeS1.getPeer().then((peer) => nodeS2.postPeer(PeerDTO.fromJSONObject(peer).getRawSigned())).catch(e => console.error(e))
          yield nodeS2.getPeer().then((peer) => nodeS1.postPeer(PeerDTO.fromJSONObject(peer).getRawSigned())).catch(e => console.error(e))
          yield nodeS3.getPeer().then((peer) => nodeS1.postPeer(PeerDTO.fromJSONObject(peer).getRawSigned())).catch(e => console.error(e))
          yield commitS1();
          yield [
            toolbox.serverWaitBlock(s2, 1),
            toolbox.serverWaitBlock(s3, 1)
          ];
          // A block was successfully spread accross the network
          yield s2.bma.closeConnections();
          yield commitS1();
          yield [
            toolbox.serverWaitBlock(s3, 2)
          ];
          // Server 2 syncs block number 2 (it did not have it)
          yield sync(2, 2, s1, s2);
          yield toolbox.serverWaitBlock(s2, 2)
          yield s2.recomputeSelfPeer();
          yield s2.bma.openConnections();
          yield new Promise((resolve) => setTimeout(resolve, 1000));
          yield [
            toolbox.serverWaitBlock(s2, 4),
            toolbox.serverWaitBlock(s3, 4),
            commitS1()
              .then(commitS1)
          ];
          yield [
            toolbox.serverWaitBlock(s1, 5),
            toolbox.serverWaitBlock(s2, 5),
            commitS3()
          ];
          yield [
            toolbox.serverWaitBlock(s1, 6),
            toolbox.serverWaitBlock(s3, 6),
            commitS2()
          ];
        });
      })
      ;
  });

  after(() => {
    return Promise.all([
      shutDownEngine(s1),
      shutDownEngine(s2),
      shutDownEngine(s3)
    ])
  })

  describe("Server 1", function() {

    it('should have a 3 leaves merkle for peers', function() {
      return nodeS1.getPeers().then(function(res) {
        res.should.have.property('leavesCount').equal(3);
      });
    });

    it('/block/0 should exist', function() {
      return expectJSON(rp('http://127.0.0.1:7784/blockchain/block/0', { json: true }), {
        number: 0
      });
    });

    it('/current should exist and be 6', function() {
      return expectJSON(rp('http://127.0.0.1:7784/blockchain/current', { json: true }), {
        number: 6
      });
    });
  });

  describe("Server 2", function() {

    it('should have a 3 leaves merkle for peers', function() {
      return nodeS2.getPeers().then(function(res) {
        res.should.have.property('leavesCount').equal(3);
      });
    });

    it('/block/0 should exist', function() {
      return expectJSON(rp('http://127.0.0.1:7785/blockchain/block/0', { json: true }), {
        number: 0
      });
    });

    it('/current should exist and be 1', function() {
      return expectJSON(rp('http://127.0.0.1:7785/blockchain/current', { json: true }), {
        number: 6
      });
    });
  });

  describe("Server 3", function() {

    it('should have a 2 leaves merkle for peers', function() {
      return nodeS3.getPeers().then(function(res) {
        res.should.have.property('leavesCount').equal(2);
      });
    });

    it('/block/0 should exist', function() {
      return expectJSON(rp('http://127.0.0.1:7786/blockchain/block/0', { json: true }), {
        number: 0
      });
    });

    it('/current should exist and be 1', function() {
      return expectJSON(rp('http://127.0.0.1:7786/blockchain/current', { json: true }), {
        number: 6
      });
    });
  });
});
