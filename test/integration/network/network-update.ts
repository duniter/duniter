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

"use strict";

import {TestUser} from "../tools/TestUser"
import {NewTestingServer, TestingServer} from "../tools/toolbox"
import {Underscore} from "../../../app/lib/common-libs/underscore"
import {RouterDependency} from "../../../app/modules/router"
import {sync} from "../tools/test-sync"

const catKeyPair = {
  pair: {
    pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd',
    sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'
  }
};

const tocKeyPair = {
  pair: {
    pub: 'DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo',
    sec: '64EYRvdPpTfLGGmaX5nijLXRqWXaVz8r1Z1GtaahXwVSJGQRn7tqkxLb288zwSYzELMEG5ZhXSBYSxsTsz1m9y8F'
  }
};

let s1:TestingServer, s2:TestingServer, cat:TestUser, toc:TestUser


describe("Network updating", function() {

  before(async () => {

    s1 = NewTestingServer(Underscore.clone(catKeyPair));
    s2 = NewTestingServer(Underscore.clone(tocKeyPair));

    cat = new TestUser('cat', { pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'}, { server: s1 });
    toc = new TestUser('toc', { pub: 'DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo', sec: '64EYRvdPpTfLGGmaX5nijLXRqWXaVz8r1Z1GtaahXwVSJGQRn7tqkxLb288zwSYzELMEG5ZhXSBYSxsTsz1m9y8F'}, { server: s1 });

    await [s1, s2].reduce(async (p, server) => {
      await p;
      await server.initDalBmaConnections()
      RouterDependency.duniter.methods.routeToNetwork(server._server);
    }, Promise.resolve())

    // Server 1
    await cat.createIdentity();
    await toc.createIdentity();
    await toc.cert(cat);
    await cat.cert(toc);
    await cat.join();
    await toc.join();
    for (const i in Underscore.range(32)) {
      await s1.commit(); // block#0
    }
    // // s2 syncs from s1
    await sync(0, 31, s1._server, s2._server);

    const b2 = await s1.makeNext({});
    await s1.postBlock(b2);
    await s2.postBlock(b2);
    await s1.recomputeSelfPeer(); // peer#1
    await s1.sharePeeringWith(s2);
    const b3 = await s1.makeNext({});
    await s1.postBlock(b3);
    await s2.postBlock(b3);
    await s2.waitToHaveBlock(b3.number);
    await s1.recomputeSelfPeer(); // peer#1
    await s1.sharePeeringWith(s2);
  });

    describe("Server 1 /network/peering", function() {

      it('/peers?leaf=LEAFDATA', async () => {
        const data = await s1.get('/network/peering/peers?leaves=true');
        const leaf = data.leaves[0];
        const res = await s1.get('/network/peering/peers?leaf=' + leaf);
        res.leaf.value.should.have.property("pubkey").equal('HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd');
        res.leaf.value.should.have.property("block").match(new RegExp('^3-'));
        res.leaf.value.should.have.property("raw").match(new RegExp('.*Block: 3-.*'));
      })
    });

    describe("Server 2 /network/peering", function() {

      it('/peers?leaf=LEAFDATA', async () => {
        const data = await s2.get('/network/peering/peers?leaves=true');
        const leaf = data.leaves[0];
        const res = await s2.get('/network/peering/peers?leaf=' + leaf);
        res.leaf.value.should.have.property("pubkey").equal('DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo');
        res.leaf.value.should.have.property("block").match(new RegExp('^0-'));
        res.leaf.value.should.have.property("raw").match(new RegExp('.*Block: 0-.*'));
      })
    })
  })
