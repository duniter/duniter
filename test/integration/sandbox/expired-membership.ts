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

describe('Expired membership', () => writeBasicTestWithConfAnd2Users({
  sigReplay: 3,
  sigPeriod: 0,
  sigValidity: 10,
  msWindow: 2, // <--- this is the important parameter for this test!
}, (test) => {

  before(() => {
    CommonConstants.BLOCK_NEW_GENERATED_VERSION = 11
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

  test('should accept toc, a new member at t+2', async (s1, cat, tac, toc) => {
    await s1.commit({ time: now + 2 })
    await s1.commit({ time: now + 2 })
    await toc.createIdentity()
    await cat.cert(toc)
    await toc.join()
    await s1.commit({ time: now + 2 })
  })

  test('should **NOT** be able to send an expired membership', async (s1, cat, tac, toc) => {
    await s1.commit({ time: now + 3 })
    await s1.commit({ time: now + 3 }) // <---- Time pass, so that the new membership becomes legit
    const expiredMsAtTplus6 = await toc.makeMembership('IN')
    await s1.commit({ time: now + 6 })
    await s1.commit({ time: now + 6 }) // <---- But we want to make it expire
    await assertThrows(toc.sendMembership(expiredMsAtTplus6), '{\n  "ucode": 1002,\n  "message": "MEMBERSHIP_WINDOW_IS_PASSED"\n}')
  })

  after(() => {
    CommonConstants.BLOCK_NEW_GENERATED_VERSION = 10
  })
}))
