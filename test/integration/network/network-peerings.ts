// Source file from duniter: Crypto-currency software to manage libre currency such as Ğ1
// Copyright (C) 2018  Cedric Moreau <cem.moreau@gmail.com>
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.

import {NewTestingServer, serverWaitBlock, TestingServer} from "../tools/toolbox"
import {TestUser} from "../tools/TestUser"
import {CrawlerDependency} from "../../../app/modules/crawler/index"
import {Contacter} from "../../../app/modules/crawler/lib/contacter"
import {PeerDTO} from "../../../app/lib/dto/PeerDTO"
import {BmaDependency} from "../../../app/modules/bma/index"
import {RouterDependency} from "../../../app/modules/router"
import {Underscore} from "../../../app/lib/common-libs/underscore"
import {sync} from "../tools/test-sync"
import {shutDownEngine} from "../tools/shutdown-engine"
import {expectJSON} from "../tools/http-expect"

const should    = require('should');
const rp        = require('request-promise');

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

let s1:TestingServer, s2:TestingServer, s3:TestingServer, cat:TestUser, toc:TestUser, tic:TestUser

let nodeS1:Contacter
let nodeS2:Contacter
let nodeS3:Contacter

describe("Network peering", function() {

  before(function() {

    s1 = NewTestingServer(
      Underscore.extend({
        name: 'bb_net1',
        memory: MEMORY_MODE,
        port: '7784',
        pair: {
          pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd',
          sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'
        }
      }, commonConf));

    s2 = NewTestingServer(
      Underscore.extend({
        name: 'bb_net2',
        memory: MEMORY_MODE,
        port: '7785',
        pair: {
          pub: 'DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo',
          sec: '64EYRvdPpTfLGGmaX5nijLXRqWXaVz8r1Z1GtaahXwVSJGQRn7tqkxLb288zwSYzELMEG5ZhXSBYSxsTsz1m9y8F'
        }
      }, commonConf));

    s3 = NewTestingServer(
      Underscore.extend({
        name: 'bb_net3',
        memory: MEMORY_MODE,
        port: '7786',
        pair: {
          pub: 'DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV',
          sec: '468Q1XtTq7h84NorZdWBZFJrGkB18CbmbHr9tkp9snt5GiERP7ySs3wM8myLccbAAGejgMRC9rqnXuW3iAfZACm7'
        }
      }, commonConf));

    cat = new TestUser('cat', { pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'}, { server: s1 });
    toc = new TestUser('toc', { pub: 'DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo', sec: '64EYRvdPpTfLGGmaX5nijLXRqWXaVz8r1Z1GtaahXwVSJGQRn7tqkxLb288zwSYzELMEG5ZhXSBYSxsTsz1m9y8F'}, { server: s1 });
    tic = new TestUser('tic', { pub: 'DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV', sec: '468Q1XtTq7h84NorZdWBZFJrGkB18CbmbHr9tkp9snt5GiERP7ySs3wM8myLccbAAGejgMRC9rqnXuW3iAfZACm7'}, { server: s1 });

    return [s1, s2, s3].reduce(function(p, server) {
      server._server.addEndpointsDefinitions(() => BmaDependency.duniter.methods.getMainEndpoint(server.conf))
      return p
        .then(function(){
          return server
            .initWithDAL()
            .then(BmaDependency.duniter.methods.bma)
            .then(function(bmaAPI){
              return bmaAPI.openConnections()
                .then(() => {
                  server.bma = bmaAPI;
                  RouterDependency.duniter.methods.routeToNetwork(server._server);
                });
            });
        });
    }, Promise.resolve())

      .then(async () => {
        nodeS1 = CrawlerDependency.duniter.methods.contacter('127.0.0.1', s1.conf.port);
        nodeS2 = CrawlerDependency.duniter.methods.contacter('127.0.0.1', s2.conf.port);
        nodeS3 = CrawlerDependency.duniter.methods.contacter('127.0.0.1', s3.conf.port);
        // Server 1
        await cat.createIdentity();
        await toc.createIdentity();
        await tic.createIdentity();
        await toc.cert(cat);
        await cat.cert(toc);
        await cat.cert(tic);
        await cat.join();
        await toc.join();
        await tic.join();
        await s1.commit();
        // Server 2 syncs block 0
        await sync(0, 0, s1._server, s2._server);
        await serverWaitBlock(s1._server, 0)
        // Server 3 syncs block 0
        await sync(0, 0, s1._server, s3._server);
        await serverWaitBlock(s3._server, 0)
        await nodeS1.getPeer().then((peer) => nodeS2.postPeer(PeerDTO.fromJSONObject(peer).getRawSigned())).catch(e => console.error(e))
        await nodeS2.getPeer().then((peer) => nodeS1.postPeer(PeerDTO.fromJSONObject(peer).getRawSigned())).catch(e => console.error(e))
        await nodeS3.getPeer().then((peer) => nodeS1.postPeer(PeerDTO.fromJSONObject(peer).getRawSigned())).catch(e => console.error(e))
        await s1.commit();
        await Promise.all([
          serverWaitBlock(s2._server, 1),
          serverWaitBlock(s3._server, 1)
        ])
        // A block was successfully spread accross the network
        await s2.bma.closeConnections();
        await s1.commit();
        await serverWaitBlock(s3._server, 2)
        // Server 2 syncs block number 2 (it did not have it)
        await sync(2, 2, s1._server, s2._server);
        await serverWaitBlock(s2._server, 2)
        await s2.recomputeSelfPeer();
        await s2.bma.openConnections();
        await new Promise((resolve) => setTimeout(resolve, 1000));
        await Promise.all([
          serverWaitBlock(s2._server, 4),
          serverWaitBlock(s3._server, 4),
          s1.commit().then(() => s1.commit())
         ])
        await Promise.all([
          serverWaitBlock(s1._server, 5),
          serverWaitBlock(s2._server, 5),
          s3.commit()
        ])
        await Promise.all([
          serverWaitBlock(s1._server, 6),
          serverWaitBlock(s3._server, 6),
          s2.commit()
        ])
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
