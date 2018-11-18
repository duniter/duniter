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

import {WS2PConstants} from "../../../app/modules/ws2p/lib/constants"
import {assertEqual, assertNotNull, createCurrencyWith2Blocks, writeBasicTestWith2Users} from "../tools/test-framework"
import {NewTestingServer, TestWS2PAPI} from "../tools/toolbox"
import {CrawlerDependency} from "../../../app/modules/crawler/index"

describe('WS2P sync', () => writeBasicTestWith2Users((test) => {


  // We want the test to fail quickly
  WS2PConstants.CONNEXION_TIMEOUT = 1000
  WS2PConstants.REQUEST_TIMEOUT = 1000

  let ws2p: TestWS2PAPI

  test('should be able to init with 2 blocks', async (s1, cat, tac) => {
    await createCurrencyWith2Blocks(s1, cat, tac)
    await s1.disableBMA()
  })

  test('we should be able to connect for SYNC', async (s1, cat, tac) => {
    ws2p = await s1.enableWS2P()
    const ws = ws2p.connectForSync(tac.keypair, '12345678')
    const current = await ws.getCurrent()
    assertNotNull(current)
    assertEqual(2, current.number)
  })

  test('we should be able to reconnect for SYNC', async (s1, cat, tac) => {
    const ws = ws2p.connectForSync(tac.keypair, '22222222')
    await assertNotNull(ws.getCurrent())
  })

  test('we should be able to connect for SYNC with toc', async (s1, cat, tac, toc) => {
    const ws = ws2p.connectForSync(toc.keypair, '33333333')
    const current = await ws.getCurrent()
    assertNotNull(current)
    assertEqual(2, current.number)
  })

  test('we should be able to make a full sync with cat', async (s1, cat, tac, toc) => {
    const s2 = NewTestingServer({ pair: cat.keypair })
    await s2.initWithDAL()
    // We sync on s1
    await CrawlerDependency.duniter.methods.synchronize(s2._server, ws2p.host, ws2p.port, 2, 2, true).syncPromise
    assertNotNull(await s2.dal.getCurrentBlockOrNull())
  })
}))
