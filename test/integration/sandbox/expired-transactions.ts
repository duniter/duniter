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

import {writeBasicTestWithConfAnd2Users} from "../tools/test-framework"
import {assertThrows} from "../../unit-tools"
import {CommonConstants} from "../../../app/lib/common-libs/constants"

describe('Expired transactions', () => writeBasicTestWithConfAnd2Users({
  udTime0: 1500000000 - 1,
}, (test) => {

  let oldTxWindowValue: number

  before(() => {
    CommonConstants.DUBP_NEXT_VERSION = 11
    oldTxWindowValue = CommonConstants.TX_WINDOW
    CommonConstants.TX_WINDOW = 2 // We need a low value to pass time bounds rules
  })

  const now = 1500000000

  test('should be able to init with 2 blocks', async (s1, cat, tac) => {
    await cat.createIdentity()
    await tac.createIdentity()
    await cat.cert(tac)
    await tac.cert(cat)
    await cat.join()
    await tac.join()
    await s1.commit({ time: now, version: 10 })
    await s1.commit({ time: now })
  })

  test('should **NOT** accept an expired transaction', async (s1, cat, tac, toc) => {
    const rawTX = await cat.prepareITX(100, tac)
    await s1.commit({ time: now + CommonConstants.TX_WINDOW + 1 })
    await s1.commit({ time: now + CommonConstants.TX_WINDOW + 1 }) // <---- This is the important change! Make the TX expire
    await assertThrows(toc.sendTX(rawTX), '{\n  "ucode": 1002,\n  "message": "TRANSACTION_WINDOW_IS_PASSED"\n}')
  })

  after(() => {
    CommonConstants.DUBP_NEXT_VERSION = 10
    CommonConstants.TX_WINDOW = oldTxWindowValue
  })
}))
