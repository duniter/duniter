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

import {assertEqual, assertNull, writeBasicTestWithConfAnd2Users} from "../tools/test-framework"
import {DBWallet} from "../../../app/lib/db/DBWallet"
import {DBBlock} from "../../../app/lib/db/DBBlock"
import {CommonConstants} from "../../../app/lib/common-libs/constants"
import {TestUser} from "../tools/TestUser"
import {TestingServer} from "../tools/toolbox"

describe('Block revert with transaction sources', () => writeBasicTestWithConfAnd2Users({
  dt: 10,
  udTime0: CommonConstants.BLOCK_TX_CHAINING_ACTIVATION_MT + 10,
  ud0: 1000,
  switchOnHeadAdvance: 0,
}, (test) => {

  const now = CommonConstants.BLOCK_TX_CHAINING_ACTIVATION_MT

  test('(b#1) should init with a Dividend at block#1', async (s1, cat, tac, toc) => {
    await cat.createIdentity()
    await tac.createIdentity()
    await cat.cert(tac)
    await tac.cert(cat)
    await cat.join()
    await tac.join()
    await s1.commit({ time: now + 11 })
    await s1.commit({ time: now + 11 })
    await assertBlock1(s1, cat, tac, toc)
  })

  test('(b#2) tac sends to both tac and toc', async (s1, cat, tac, toc) => {
    // Using transaction chaining to also test this case
    const current = await s1._server.dal.getCurrentBlockOrNull() as DBBlock
    const tx1 = await cat.prepareITX(1000, cat)
    const tx2 = await cat.prepareUTX(tx1, ['SIG(0)'],
      [
        { qty: 100, base: 0, lock: 'SIG(' + tac.pub + ')' },
        { qty: 200, base: 0, lock: 'SIG(' + toc.pub + ')' }, // Send money also to toc, to test that his money is ketp safe during a revert
        { qty: 700, base: 0, lock: 'SIG(' + cat.pub + ')' }, // REST
      ],
      {
        comment: 'CHAINED TX to 2 recipients', blockstamp: [current.number, current.hash].join('-')
      }
    )
    await cat.sendTX(tx1)
    await cat.sendTX(tx2)

    await s1.commit({ time: now + 11 })
    await assertBlock2(s1, cat, tac, toc)
  })

  test('(b#3) tac gives all to cat', async (s1, cat, tac, toc) => {
    await tac.sendMoney(1100, cat)
    await s1.commit({ time: now + 11 })
    await assertBlock3(s1, cat, tac, toc)
  })

  test('(b#4) toc spends some received money', async (s1, cat, tac, toc) => {
    // Using normal transaction
    await toc.sendMoney(100, cat)
    await s1.commit({ time: now + 11 })
    await assertBlock4(s1, cat, tac, toc)
  })

  test('revert b#3-4 and re-commit block#3 should be ok', async (s1, cat, tac, toc) => {
    await s1.revert()
    await s1.revert()
    await s1.resolve(b => b.number === 3)
    await assertBlock3(s1, cat, tac, toc)
  })

  test('re-commit block#4 should be ok', async (s1, cat, tac, toc) => {
    await s1.resolve(b => b.number === 4)
    await assertBlock4(s1, cat, tac, toc)
  })
}))

async function assertBlock1(s1: TestingServer, cat: TestUser, tac: TestUser, toc: TestUser) {
  assertEqual((await s1._server.dal.dividendDAL.getUDSources(cat.pub)).length, 1)
  assertEqual((await s1._server.dal.dividendDAL.getUDSources(tac.pub)).length, 1)
  assertEqual((await s1._server.dal.dividendDAL.getUDSources(toc.pub)).length, 0) // toc is not a member
  assertEqual((await s1._server.dal.sindexDAL.getAvailableForPubkey(cat.pub)).length, 0)
  assertEqual((await s1._server.dal.sindexDAL.getAvailableForPubkey(tac.pub)).length, 0)
  assertEqual((await s1._server.dal.sindexDAL.getAvailableForPubkey(toc.pub)).length, 0)
  assertEqual((await s1._server.dal.walletDAL.getWallet('SIG(' + cat.pub + ')') as DBWallet).balance, 1000)
  assertEqual((await s1._server.dal.walletDAL.getWallet('SIG(' + tac.pub + ')') as DBWallet).balance, 1000)
  assertNull(await s1._server.dal.walletDAL.getWallet('SIG(' + toc.pub + ')'))
}

async function assertBlock2(s1: TestingServer, cat: TestUser, tac: TestUser, toc: TestUser) {
  assertEqual((await s1._server.dal.dividendDAL.getUDSources(cat.pub)).length, 0) // <-- The UD gets consumed
  assertEqual((await s1._server.dal.dividendDAL.getUDSources(tac.pub)).length, 1)
  assertEqual((await s1._server.dal.dividendDAL.getUDSources(toc.pub)).length, 0) // toc is not a member
  assertEqual((await s1._server.dal.sindexDAL.getAvailableForPubkey(cat.pub)).length, 1)
  assertEqual((await s1._server.dal.sindexDAL.getAvailableForPubkey(tac.pub)).length, 1)
  assertEqual((await s1._server.dal.sindexDAL.getAvailableForPubkey(toc.pub)).length, 1)
  assertEqual((await s1._server.dal.walletDAL.getWallet('SIG(' + cat.pub + ')') as DBWallet).balance, 700) // <-- -300 here
  assertEqual((await s1._server.dal.walletDAL.getWallet('SIG(' + tac.pub + ')') as DBWallet).balance, 1100) // <-- +100 here
  assertEqual((await s1._server.dal.walletDAL.getWallet('SIG(' + toc.pub + ')') as DBWallet).balance, 200) // <-- +200 here
}

async function assertBlock3(s1: TestingServer, cat: TestUser, tac: TestUser, toc: TestUser) {
  assertEqual((await s1._server.dal.dividendDAL.getUDSources(cat.pub)).length, 0)
  assertEqual((await s1._server.dal.dividendDAL.getUDSources(tac.pub)).length, 0) // <-- The UD gets consumed
  assertEqual((await s1._server.dal.dividendDAL.getUDSources(toc.pub)).length, 0) // toc is not a member
  assertEqual((await s1._server.dal.sindexDAL.getAvailableForPubkey(cat.pub)).length, 2) // <-- Cat receives a new source
  assertEqual((await s1._server.dal.sindexDAL.getAvailableForPubkey(tac.pub)).length, 0) // <-- Every TX source gets consumed
  assertEqual((await s1._server.dal.sindexDAL.getAvailableForPubkey(toc.pub)).length, 1)
  assertEqual((await s1._server.dal.walletDAL.getWallet('SIG(' + cat.pub + ')') as DBWallet).balance, 1800) // <-- +1100 here
  assertEqual((await s1._server.dal.walletDAL.getWallet('SIG(' + tac.pub + ')') as DBWallet).balance, 0) // <-- -1100 here
  assertEqual((await s1._server.dal.walletDAL.getWallet('SIG(' + toc.pub + ')') as DBWallet).balance, 200)
}

async function assertBlock4(s1: TestingServer, cat: TestUser, tac: TestUser, toc: TestUser) {
  assertEqual((await s1._server.dal.dividendDAL.getUDSources(cat.pub)).length, 0)
  assertEqual((await s1._server.dal.dividendDAL.getUDSources(tac.pub)).length, 0)
  assertEqual((await s1._server.dal.dividendDAL.getUDSources(toc.pub)).length, 0) // toc is not a member
  assertEqual((await s1._server.dal.sindexDAL.getAvailableForPubkey(cat.pub)).length, 3) // <-- Cat receives a new source
  assertEqual((await s1._server.dal.sindexDAL.getAvailableForPubkey(tac.pub)).length, 0)
  assertEqual((await s1._server.dal.sindexDAL.getAvailableForPubkey(toc.pub)).length, 1) // <-- Consume everything + Create a rest
  assertEqual((await s1._server.dal.walletDAL.getWallet('SIG(' + cat.pub + ')') as DBWallet).balance, 1900)// <-- +100 here
  assertEqual((await s1._server.dal.walletDAL.getWallet('SIG(' + tac.pub + ')') as DBWallet).balance, 0)
  assertEqual((await s1._server.dal.walletDAL.getWallet('SIG(' + toc.pub + ')') as DBWallet).balance, 100)// <-- -100 here
}
