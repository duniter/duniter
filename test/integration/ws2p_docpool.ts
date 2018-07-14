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

import {simpleTestingConf, simpleTestingServer, simpleUser, simpleWS2PNetwork, TestingServer} from "./tools/toolbox"
import {WS2PCluster} from "../../app/modules/ws2p/lib/WS2PCluster"
import {ProverDependency} from "../../app/modules/prover/index"
import {WS2PConstants} from "../../app/modules/ws2p/lib/constants"

const assert = require('assert')

describe("WS2P docpool pulling", function() {

  WS2PConstants.CONNEXION_TIMEOUT = 100
  WS2PConstants.REQUEST_TIMEOUT= 100

  const now = 1500000000
  let s1:TestingServer, s2:TestingServer, wss:any
  let cluster2:WS2PCluster
  let cat:any, tac:any, toc:any
  const catKeyring = { pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'}
  const tacKeyring = { pub: '2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc', sec: '2HuRLWgKgED1bVio1tdpeXrf7zuUszv1yPHDsDj7kcMC4rVSN9RC58ogjtKNfTbH1eFz7rn38U1PywNs3m6Q7UxE'}
  const tocKeyring = { pub: 'DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo', sec: '64EYRvdPpTfLGGmaX5nijLXRqWXaVz8r1Z1GtaahXwVSJGQRn7tqkxLb288zwSYzELMEG5ZhXSBYSxsTsz1m9y8F'}

  let b0, b1, b2

  before(async () => {
    const conf1 = simpleTestingConf(now, catKeyring)
    const conf2 = simpleTestingConf(now, tacKeyring)
    s1 = simpleTestingServer(conf1)
    s2 = simpleTestingServer(conf2)
    cat = simpleUser('cat', catKeyring, s1)
    tac = simpleUser('tac', tacKeyring, s1)
    toc = simpleUser('toc', tocKeyring, s1)
    await s1.initDalBmaConnections()
    await s2.initDalBmaConnections()

    await cat.createIdentity();
    await tac.createIdentity();
    await cat.cert(tac);
    await tac.cert(cat);
    await cat.join();
    await tac.join();

    b0 = await s1.commit({ time: now })
    b1 = await s1.commit({ time: now })
    b2 = await s1.commit({ time: now })

    await s2.writeBlock(b0)
    await s2.writeBlock(b1)
    await s2.writeBlock(b2)
    await s2.waitToHaveBlock(2)
  })

  after(() => wss.close())

  it('should have b#2 on s1 and s2', async () => {
    const currentS1 = await s1.BlockchainService.current()
    const currentS2 = await s2.BlockchainService.current()
    assert.equal(currentS1.number, 2)
    assert.equal(currentS2.number, 2)
  })

  it('should be able to pull the docpool', async () => {
    await toc.createIdentity();
    await cat.cert(toc);
    await toc.join();
    const network = await simpleWS2PNetwork(s1, s2)
    wss = network.wss
    cluster2 = network.cluster2
    ProverDependency.duniter.methods.hookServer(s1._server)
    await cluster2.pullDocpool()
    await s2.expect('/wot/lookup/toc', (res:any) => {
      assert.equal(res.results.length, 1)
      assert.equal(res.results[0].uids[0].others.length, 1)
    })
    const currentS1 = await s1.BlockchainService.current()
    const currentS2 = await s2.BlockchainService.current()
    assert.equal(currentS1.number, 2)
    assert.equal(currentS2.number, 2)
  })
})
