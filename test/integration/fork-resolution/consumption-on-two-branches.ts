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

import {assertEqual, assertNotNull, writeBasicTestWithConfAnd2Users} from "../tools/test-framework"
import {BlockDTO} from "../../../app/lib/dto/BlockDTO"

describe('Parallel consumption', () => writeBasicTestWithConfAnd2Users({
  dt: 10,
  udTime0: 1500000000 + 10,
  ud0: 100,
  switchOnHeadAdvance: 0,
}, (test) => {

  const now = 1500000000

  test('should init with a Dividend at block#3', async (s1, cat, tac) => {
    await cat.createIdentity()
    await tac.createIdentity()
    await cat.cert(tac)
    await tac.cert(cat)
    await cat.join()
    await tac.join()
    await s1.commit({ time: now })
    await s1.commit({ time: now })
    await s1.commit({ time: now + 10 })
    await s1.commit({ time: now + 20 })
    await s1.commit({ time: now + 20 })
    assertEqual((await s1._server.dal.dividendDAL.getUDSources(cat.pub)).length, 2)
  })

  test('should allow cat to send its money', async (s1, cat, tac) => {
    await s1.commit({ time: now + 20 })
    await cat.sendMoney(200, tac)
    await s1.commit({ time: now + 20 })
    assertEqual((await s1._server.dal.dividendDAL.getUDSources(cat.pub)).length, 0)
    assertEqual((await s1._server.dal.dividendDAL.getUDSources(tac.pub)).length, 2)
    assertEqual((await s1._server.dal.sindexDAL.getAvailableForPubkey(tac.pub)).length, 1)
  })

  test('revert and re-commit the transaction a block earlier than main branch', async (s1, cat, tac) => {
    await s1.revert()
    await s1.revert()
    await cat.sendMoney(200, tac)
    await s1.justCommit({ time: now + 21 }) // Time with 11 is the fork
    await s1.resolve(b => b.time === now + 21)
    await s1.commit({ time: now + 21 })
    await s1.commit({ time: now + 21 })
    await s1.commit({ time: now + 21 })
    assertEqual((await s1._server.dal.dividendDAL.getUDSources(cat.pub)).length, 0)
    assertEqual((await s1._server.dal.dividendDAL.getUDSources(tac.pub)).length, 2)
    assertEqual((await s1._server.dal.sindexDAL.getAvailableForPubkey(tac.pub)).length, 1)
  })

  test('switching on main branch should succeed', async (s1, cat, tac) => {
    await s1.revert()
    await s1.revert()
    await s1.revert()
    await s1.revert()
    const resolved = await s1.resolve(b => b.time % 2 === 0)
    assertEqual(resolved.number, 6)
    assertEqual((await s1._server.dal.dividendDAL.getUDSources(cat.pub)).length, 0)
    assertEqual((await s1._server.dal.dividendDAL.getUDSources(cat.pub)).length, 0)
    assertEqual((await s1._server.dal.dividendDAL.getUDSources(tac.pub)).length, 2)
    assertEqual((await s1._server.dal.sindexDAL.getAvailableForPubkey(tac.pub)).length, 1)
  })

  test('switching on fork branch should succeed', async (s1, cat, tac) => {
    const newHead = await s1.resolveFork()
    assertNotNull(newHead)
    assertEqual((newHead as BlockDTO).number, 7)
    assertEqual((await s1._server.dal.dividendDAL.getUDSources(cat.pub)).length, 0)
    assertEqual((await s1._server.dal.dividendDAL.getUDSources(cat.pub)).length, 0)
    assertEqual((await s1._server.dal.dividendDAL.getUDSources(tac.pub)).length, 2)
    assertEqual((await s1._server.dal.sindexDAL.getAvailableForPubkey(tac.pub)).length, 1)
  })
}))
