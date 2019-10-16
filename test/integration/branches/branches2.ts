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


import {BmaDependency} from "../../../app/modules/bma/index"
import {OtherConstants} from "../../../app/lib/other_constants"
import {NewLogger} from "../../../app/lib/logger"
import {Underscore} from "../../../app/lib/common-libs/underscore"
import {NewTestingServer, TestingServer, waitForkResolution, waitToHaveBlock} from "../tools/toolbox"
import {TestUser} from "../tools/TestUser"
import {CrawlerDependency} from "../../../app/modules/crawler/index"
import {sync} from "../tools/test-sync"
import {shutDownEngine} from "../tools/shutdown-engine"
import {expectHttpCode, expectJSON} from "../tools/http-expect"

const rp        = require('request-promise');

if (OtherConstants.MUTE_LOGS_DURING_UNIT_TESTS) {
  NewLogger().mute();
}

// Trace these errors
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection: ' + reason);
  console.error(reason);
});

const MEMORY_MODE = true;
const commonConf = {
  ipv4: '127.0.0.1',
  currency: 'bb',
  httpLogs: true,
  forksize: 10,
  switchOnHeadAdvance: 6,
  avgGenTime: 30 * 60,
  sigQty: 1
};

let s1:TestingServer, s2:TestingServer, cat:TestUser, toc:TestUser

const now = Math.round(new Date().getTime() / 1000);

describe("SelfFork", function() {

  before(async () => {

    s1 = NewTestingServer(
      Underscore.extend({
        name: 'bb4',
        memory: MEMORY_MODE,
        port: '7781',
        pair: {
          pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd',
          sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'
        }
      }, commonConf));

    s2 = NewTestingServer(
      Underscore.extend({
        name: 'bb5',
        memory: MEMORY_MODE,
        port: '7782',
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

    // Server 1
    await cat.createIdentity();
    await toc.createIdentity();
    await toc.cert(cat);
    await cat.cert(toc);
    await cat.join();
    await toc.join();

    await s1.commit({
      time: now
    });
    await s1.commit();
    await s1.commit();
    await s1.commit();

    // Server 2
    await sync(0, 2, s1._server, s2._server);
    await waitToHaveBlock(s2._server, 2)
    let s2p = await s2.PeeringService.peer();

    await s2.commit({ time: now + 37180 }); // <-- block#3 is a fork block, S2 is committing another one than S1 issued
    await s2.commit({ time: now + 37180 });
    await s2.commit({ time: now + 37180 });
    await s2.commit({ time: now + 37180 });
    await s2.commit({ time: now + 37180 });
    await s2.commit({ time: now + 37180 });
    await s2.commit({ time: now + 37180 });

    // We now have:
    //
    // S1: B0 -> B1 -> B2 -> B3
    // S2:               `-> C3 -> C4 -> C5 -> C6 -> C7 -> C8 -> C9
    //

    await s1.writePeer(s2p);
    // Forking S1 from S2
    await Promise.all([
      waitForkResolution(s1._server, 9),
      CrawlerDependency.duniter.methods.pullBlocks(s1._server, s2p.pubkey)
    ])
  })

  after(() => {
    return Promise.all([
      shutDownEngine(s1),
      shutDownEngine(s2)
    ])
  })

  describe("Server 1 /blockchain", function() {

    it('/block/0 should exist', function() {
      return expectJSON(rp('http://127.0.0.1:7781/blockchain/block/0', { json: true }), {
        number: 0,
        issuersCount: 0,
        issuersFrame: 1,
        issuersFrameVar: 0
      });
    });

    it('/block/1 should exist', function() {
      return expectJSON(rp('http://127.0.0.1:7781/blockchain/block/1', { json: true }), {
        number: 1,
        issuersCount: 1,
        issuersFrame: 1,
        issuersFrameVar: 5
      });
    });

    it('/block/2 should exist', function() {
      return expectJSON(rp('http://127.0.0.1:7781/blockchain/block/2', { json: true }), {
        number: 2,
        issuersCount: 1,
        issuersFrame: 2,
        issuersFrameVar: 4
      });
    });

    it('/block/3 should exist', function() {
      return expectJSON(rp('http://127.0.0.1:7781/blockchain/block/3', { json: true }), {
        number: 3,
        issuersCount: 1,
        issuersFrame: 3,
        issuersFrameVar: 3
      });
    });

    it('/block/4 should exist', function() {
      return expectJSON(rp('http://127.0.0.1:7781/blockchain/block/4', { json: true }), {
        number: 4,
        issuersCount: 2,
        issuersFrame: 4,
        issuersFrameVar: 7
      });
    });

    it('/block/5 should exist', function() {
      return expectJSON(rp('http://127.0.0.1:7781/blockchain/block/5', { json: true }), {
        number: 5,
        issuersCount: 2,
        issuersFrame: 5,
        issuersFrameVar: 6
      });
    });

    it('/block/6 should exist', function() {
      return expectJSON(rp('http://127.0.0.1:7781/blockchain/block/6', { json: true }), {
        number: 6,
        issuersCount: 2,
        issuersFrame: 6,
        issuersFrameVar: 5
      });
    });

    it('/block/7 should exist', function() {
      return expectJSON(rp('http://127.0.0.1:7781/blockchain/block/7', { json: true }), {
        number: 7,
        issuersCount: 2,
        issuersFrame: 7,
        issuersFrameVar: 4
      });
    });

    it('/block/88 should not exist', function() {
      return expectHttpCode(404, rp('http://127.0.0.1:7781/blockchain/block/88'));
    });

    it('/current should exist', function() {
      return expectJSON(rp('http://127.0.0.1:7781/blockchain/current', { json: true }), {
        number: 9
      });
    });

    it('should have 1 branch', async () => {
      const branches = await s1.BlockchainService.branches()
      branches.should.have.length(1)
    })
  });

  describe("Server 2 /blockchain", function() {

    it('/block/0 should exist', function() {
      return expectJSON(rp('http://127.0.0.1:7782/blockchain/block/0', { json: true }), {
        number: 0
      });
    });

    it('/block/1 should exist', function() {
      return expectJSON(rp('http://127.0.0.1:7782/blockchain/block/1', { json: true }), {
        number: 1
      });
    });

    it('/block/88 should not exist', function() {
      return expectHttpCode(404, rp('http://127.0.0.1:7782/blockchain/block/88'));
    });

    it('/current should exist', function() {
      return expectJSON(rp('http://127.0.0.1:7782/blockchain/current', { json: true }), {
        number: 9
      });
    });

    it('should have 1 branch', async () => {
      const branches = await s2.BlockchainService.branches();
      branches.should.have.length(1);
    })
  })
})
