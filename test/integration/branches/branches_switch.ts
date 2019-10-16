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

import {Underscore} from "../../../app/lib/common-libs/underscore"
import {BmaDependency} from "../../../app/modules/bma/index"
import {CrawlerDependency} from "../../../app/modules/crawler/index"
import {NewTestingServer, TestingServer} from "../tools/toolbox"
import {TestUser} from "../tools/TestUser"
import {sync} from "../tools/test-sync"
import {shutDownEngine} from "../tools/shutdown-engine"
import {expectJSON} from "../tools/http-expect"

const rp        = require('request-promise');
const cluster   = require('cluster')

const MEMORY_MODE = true;
const commonConf = {
  ipv4: '127.0.0.1',
  currency: 'bb',
  httpLogs: true,
  forksize: 30,
  avgGenTime: 1,
  sigQty: 1
};

let s1:TestingServer, s2:TestingServer, cat:TestUser, toc:TestUser

describe("Switch", function() {

  before(async () => {

    cluster.setMaxListeners(6)

    s1 = NewTestingServer(
      Underscore.extend({
        name: 'bb11',
        memory: MEMORY_MODE,
        switchOnHeadAdvance: 0,
        port: '7788',
        pair: {
          pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd',
          sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'
        },
        rootoffset: 10,
        sigQty: 1, dt: 1, ud0: 120
      }, commonConf));

    s2 = NewTestingServer(
      Underscore.extend({
        name: 'bb12',
        memory: MEMORY_MODE,
        switchOnHeadAdvance: 0,
        port: '7789',
        pair: {
          pub: 'DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo',
          sec: '64EYRvdPpTfLGGmaX5nijLXRqWXaVz8r1Z1GtaahXwVSJGQRn7tqkxLb288zwSYzELMEG5ZhXSBYSxsTsz1m9y8F'
        }
      }, commonConf));

    cat = new TestUser('cat', { pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'}, { server: s1 });
    toc = new TestUser('toc', { pub: 'DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo', sec: '64EYRvdPpTfLGGmaX5nijLXRqWXaVz8r1Z1GtaahXwVSJGQRn7tqkxLb288zwSYzELMEG5ZhXSBYSxsTsz1m9y8F'}, { server: s1 });

    await s1.initWithDAL().then(BmaDependency.duniter.methods.bma).then((bmapi:any) => bmapi.openConnections());
    await s2.initWithDAL().then(BmaDependency.duniter.methods.bma).then((bmapi:any) => bmapi.openConnections());
    s1._server.addEndpointsDefinitions(() => BmaDependency.duniter.methods.getMainEndpoint(s1.conf))
    s2._server.addEndpointsDefinitions(() => BmaDependency.duniter.methods.getMainEndpoint(s2.conf))
    await cat.createIdentity();
    await toc.createIdentity();
    await toc.cert(cat);
    await cat.cert(toc);
    await cat.join();
    await toc.join();
    await s1.commit();
    await s1.commit();
    await s1.commit();
    await sync(0, 2, s1._server, s2._server);

    let s2p = await s2.PeeringService.peer();

    await s1.commit();
    await s1.commit();
    await s2.commit();
    await s2.commit();
    await s2.commit();
    await s2.commit();
    await s2.commit();
    await s2.commit();
    await s2.commit();
    // So we now have:
    // S1 01234
    // S2   `3456789
    await s1.writePeer(s2p)

    // Forking S1 from S2
    await CrawlerDependency.duniter.methods.pullBlocks(s1._server, s2p.pubkey);
    // S1 should have switched to the other branch
  })

  after(() => {
    cluster.setMaxListeners(3)
    return Promise.all([
      shutDownEngine(s1),
      shutDownEngine(s2)
    ])
  })

  describe("Server 1 /blockchain", function() {

    it('/block/8 should exist on S1', function() {
      return expectJSON(rp('http://127.0.0.1:7788/blockchain/block/8', { json: true }), {
        number: 8
      });
    });

    it('/block/8 should exist on S2', function() {
      return expectJSON(rp('http://127.0.0.1:7789/blockchain/block/8', { json: true }), {
        number: 8
      });
    });
  });
});
