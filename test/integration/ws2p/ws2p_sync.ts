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

describe('WS2P sync', () => writeBasicTestWith2Users((test) => {

  WS2PConstants.CONNEXION_TIMEOUT = 100
  WS2PConstants.REQUEST_TIMEOUT= 100

  test('should be able to init with 2 blocks', async (s1, cat, tac) => {
    await createCurrencyWith2Blocks(s1, cat, tac)
  })

  test('if we disable the changes API', async (s1, cat, tac) => {
    const ws2p = await s1.enableWS2P()
    const ws = (await ws2p).connectForSync(tac.keypair, '12345678')
    const current = await ws.getCurrent()
    assertNotNull(current)
    assertEqual(2, current.number)
  })
}))
