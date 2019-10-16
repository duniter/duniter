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

import {NewTestingServer, TestingServer} from "../tools/toolbox"
import {TestUser} from "../tools/TestUser"
import {HttpPeer, HttpPeers} from "../../../app/modules/bma/lib/dtos"
import {PeerDTO} from "../../../app/lib/dto/PeerDTO"
import {RouterDependency} from "../../../app/modules/router"
import {Multicaster} from "../../../app/lib/streams/multicaster"
import {until} from "../tools/test-until"

const should    = require('should');
const es        = require('event-stream');

let s1:TestingServer, s2:TestingServer, cat:TestUser, toc:TestUser

describe("Peer document expiry", function() {

  let peer1V1:HttpPeer

  before(async () => {

    s1 = NewTestingServer({
      pair: {
        pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd',
        sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'
      }
    });

    s2 = NewTestingServer({
      pair: {
        pub: 'DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo',
        sec: '64EYRvdPpTfLGGmaX5nijLXRqWXaVz8r1Z1GtaahXwVSJGQRn7tqkxLb288zwSYzELMEG5ZhXSBYSxsTsz1m9y8F'
      }
    });

    cat = new TestUser('cat', { pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'}, { server: s1 });
    toc = new TestUser('toc', { pub: 'DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo', sec: '64EYRvdPpTfLGGmaX5nijLXRqWXaVz8r1Z1GtaahXwVSJGQRn7tqkxLb288zwSYzELMEG5ZhXSBYSxsTsz1m9y8F'}, { server: s1 });

    await [s1, s2].reduce(async (p:Promise<any>, server:TestingServer) => {
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
    peer1V1 = await s1.get('/network/peering');
    await s1.commit(); // block#2
    await s1.recomputeSelfPeer(); // peer#2
    await s2.syncFrom(s1._server, 0, 2);
    await s2.waitToHaveBlock(2)
  })

  after(() => {
    return Promise.all([
      s1.closeCluster(),
      s2.closeCluster()
    ])
  })

  it('sending back V1 peer document should return the latest known one', async () => {
    let res;
    try {
      await s1.post('/network/peering/peers', { peer: PeerDTO.fromJSONObject(peer1V1).getRawSigned() });
    } catch (e) {
      res = e;
    }
    should.exist(res);
    res.should.have.property("error").property("peer").property("block").match(/^2-/);
  })

  it('routing V1 peer document should raise an "outdated" event', async () => {
    const caster = new Multicaster();
    return new Promise((resolve) => {
      caster
        .pipe(es.mapSync((obj:any) => {
          obj.should.have.property("outdated").equal(true);
          resolve();
        }));
      caster.sendPeering(PeerDTO.fromJSONObject(peer1V1), PeerDTO.fromJSONObject(peer1V1));
    });
  })

  it('mirror should have 3 known blocks', () => s2.expectJSON('/blockchain/current', {
    number: 2
  }));

  it('mirror should have 1 known peers', () => s2.expect('/network/peers', (res:HttpPeers) => {
    res.should.have.property("peers").length(1);
    res.peers[0].should.have.property("pubkey").equal('DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo');
  }));

  it('routing V1 peer document should inject newer peer', async () => {
    await Promise.all([
      s2.writePeer(peer1V1),
      until(s2, 'peer', 2)
    ])
  })

  it('mirror should now have 2 known peers', () => s2.expect('/network/peers', (res:HttpPeers) => {
    res.should.have.property("peers").length(2);
    res.peers[0].should.have.property("pubkey").equal('DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo');
    res.peers[0].should.have.property("block").match(/^0-/);
    res.peers[1].should.have.property("pubkey").equal('HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd');
    res.peers[1].should.have.property("block").match(/^2-/);
  }))
})
