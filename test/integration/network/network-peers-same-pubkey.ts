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

import {TestUser} from "../tools/TestUser"
import {NewTestingServer, serverWaitBlock, TestingServer} from "../tools/toolbox"
import {PeerDTO} from "../../../app/lib/dto/PeerDTO"
import {HttpPeer} from "../../../app/modules/bma/lib/dtos"
import {RouterDependency} from "../../../app/modules/router"
import {Underscore} from "../../../app/lib/common-libs/underscore"

const should    = require('should');
const sync      = require('../tools/sync');
const until     = require('../tools/until');

const catKeyPair = {
  pair: {
    pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd',
    sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'
  }
};

let s1:TestingServer, s2:TestingServer, s3:TestingServer, cat:TestUser, toc:TestUser

describe("Peer document", function() {

  before(async () => {

    s1 = NewTestingServer(Underscore.clone(catKeyPair));
    s2 = NewTestingServer(Underscore.clone(catKeyPair));
    s3 = NewTestingServer(Underscore.clone(catKeyPair));

    cat = new TestUser('cat', { pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'}, { server: s1 });
    toc = new TestUser('toc', { pub: 'DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo', sec: '64EYRvdPpTfLGGmaX5nijLXRqWXaVz8r1Z1GtaahXwVSJGQRn7tqkxLb288zwSYzELMEG5ZhXSBYSxsTsz1m9y8F'}, { server: s1 });

    await [s1, s2, s3].reduce(async (p, server) => {
      await p;
      await server.initDalBmaConnections()
      RouterDependency.duniter.methods.routeToNetwork(server._server)
    }, Promise.resolve())

    // Server 1
    await cat.createIdentity();
    await toc.createIdentity();
    await toc.cert(cat);
    await cat.cert(toc);
    await cat.join();
    await toc.join();
    await s1.commit(); // block#0
    await s1.commit(); // block#1
    await s1.recomputeSelfPeer(); // peer#1
    await s1.commit(); // block#2
    // // s2 syncs from s1
    await sync(0, 2, s1, s2);
    await serverWaitBlock(s1._server, 2)
    await Promise.all([
      s1.get('/network/peering').then((peer:HttpPeer) => s2.post('/network/peering/peers', { peer: PeerDTO.fromJSONObject(peer).getRawSigned() })), // peer#2
      until(s2, 'peer', 1)
    ])

    await Promise.all([
      s2.commit(), // block#3
      serverWaitBlock(s1._server, 3)
    ])

    await sync(0, 3, s1, s3);
    await serverWaitBlock(s3._server, 3)

    const peer1 = await s1.get('/network/peering');
    peer1.should.have.property("block").match(/^2-/);
    await Promise.all([
      s3.post('/network/peering/peers', { peer: PeerDTO.fromJSONObject(peer1).getRawSigned() }), // peer#3
      until(s3, 'peer', 2)
    ])
    const peer3 = await s3.get('/network/peering');
    peer3.should.have.property("block").match(/^3-/);

    await Promise.all([
      s2.commit(), // block#4
      serverWaitBlock(s1._server, 4),
      serverWaitBlock(s3._server, 4)
    ])

    await Promise.all([
      s1.commit(), // block#5
      serverWaitBlock(s2._server, 5),
      serverWaitBlock(s3._server, 5)
    ])
  })

  after(() => {
    return Promise.all([
      s1.closeCluster(),
      s2.closeCluster(),
      s3.closeCluster()
    ])
  })

  describe("Server 1", function() {

    it('should have a 1 leaves merkle for peers', () => s1.expectJSON('/network/peering/peers', {
      leavesCount: 1
    }));

    it('leaf data', async () => {
      const data = await s1.get('/network/peering/peers?leaves=true');
      const leaf = data.leaves[0];
      const res = await s1.get('/network/peering/peers?leaf=' + leaf);
      res.leaf.value.should.have.property("pubkey").equal('HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd');
      res.leaf.value.should.have.property("block").match(new RegExp('^3-'));
      res.leaf.value.should.have.property("raw").match(new RegExp('.*Block: 3-.*'));
      res.leaf.value.should.have.property("endpoints").length(3);
    })


    it('peers', () => s1.expectThat('/network/peering', (res:HttpPeer) => {
      res.should.have.property("pubkey").equal('HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd');
      res.should.have.property("block").match(new RegExp('^3-'));
      res.should.have.property("endpoints").length(3);
    }));


    it('peering should have been updated by node 1', () => s1.expectThat('/network/peering', (res:HttpPeer) => {
      res.should.have.property("pubkey").equal('HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd');
      res.should.have.property("block").match(new RegExp('^3-'));
      res.should.have.property("endpoints").length(3);
    }));

    it('current block', () => s1.expectJSON('/blockchain/current', {
      number: 5,
      issuer: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd'
    }));
  });

  describe("Server 2", function() {

    it('should have a 1 leaves merkle for peers', () => s2.expectJSON('/network/peering/peers', {
      leavesCount: 1
    }));


    it('leaf data', async () => {
      const data = await s2.get('/network/peering/peers?leaves=true');
      const leaf = data.leaves[0];
      const res = await s2.get('/network/peering/peers?leaf=' + leaf);
      res.leaf.value.should.have.property("pubkey").equal('HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd');
      res.leaf.value.should.have.property("block").match(new RegExp('^3-'));
      res.leaf.value.should.have.property("raw").match(new RegExp('.*Block: 3-.*'));
      res.leaf.value.should.have.property("endpoints").length(3);
    })


    it('peering should have been updated by node 1', () => s2.expectThat('/network/peering', (res:HttpPeer) => {
      res.should.have.property("pubkey").equal('HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd');
      res.should.have.property("block").match(new RegExp('^3-'));
      res.should.have.property("endpoints").length(3);
    }));

    it('current block', () => s2.expectJSON('/blockchain/current', {
      number: 5,
      issuer: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd'
    }));
  });

  describe("Server 3", function() {

    it('should have a 1 leaves merkle for peers', () => s3.expectJSON('/network/peering/peers', {
      leavesCount: 1
    }));

    it('leaf data', async () => {
      const data = await s3.get('/network/peering/peers?leaves=true');
      const leaf = data.leaves[0];
      const res = await s3.get('/network/peering/peers?leaf=' + leaf);
      res.leaf.value.should.have.property("pubkey").equal('HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd');
      res.leaf.value.should.have.property("block").match(new RegExp('^3-'));
      res.leaf.value.should.have.property("raw").match(new RegExp('.*Block: 3-.*'));
      res.leaf.value.should.have.property("endpoints").length(3);
    })

    it('peering should have been updated by node 1', () => s3.expectThat('/network/peering', (res:HttpPeer) => {
      res.should.have.property("pubkey").equal('HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd');
      res.should.have.property("block").match(new RegExp('^3-'));
      res.should.have.property("endpoints").length(3);
    }));

    it('current block', () => s3.expectJSON('/blockchain/current', {
      number: 5,
      issuer: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd'
    }))
  })
})
