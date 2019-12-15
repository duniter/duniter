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

import {assertEqual, writeBasicTestWithConfAnd2Users} from "../tools/test-framework"
import {assertThrows} from "../../unit-tools"
import {reduce} from "../../../app/lib/indexer"
import {CommonConstants} from "../../../app/lib/common-libs/constants"

describe('Certification replay', () => writeBasicTestWithConfAnd2Users({
  sigReplay: 3,
  sigPeriod: 0,
  sigValidity: 10,
}, (test) => {

  before(() => {
    CommonConstants.DUBP_NEXT_VERSION = 11
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

  test('should exist only 1 valid link from cat replyable at t + 3', async (s1, cat) => {
    const reducableFromCat = await s1.dal.cindexDAL.reducablesFrom(cat.pub)
    assertEqual(reducableFromCat.length, 1)
    assertEqual(reduce(reducableFromCat).chainable_on, now) // No delay between certifications
    assertEqual(reduce(reducableFromCat).replayable_on, now + 3) // Replay of a particular certification <-- What we want to test
    assertEqual(reduce(reducableFromCat).expires_on, now + 10) // The expiration date of the certification **INITIALLY**
  })

  test('should reject a replay from cat', async (s1, cat, tac) => {
    await assertThrows(cat.cert(tac), '{\n  "ucode": 1004,\n  "message": "Already up-to-date"\n}')
  })

  test('should accept replay if time has passed enought', async (s1, cat, tac) => {
    await s1.commit({ time: now + 4 })
    await s1.commit({ time: now + 4 })
    await cat.cert(tac)
    const b = await s1.commit({ time: now + 4 })
    assertEqual(b.certifications.length, 1)
  })

  test('should exist only 2 CINDEX entries from cat', async (s1, cat) => {
    const validLinksFromCat = await s1.dal.cindexDAL.findByIssuer(cat.pub)
    assertEqual(validLinksFromCat.length, 2)
  })

  test('should exist only 1 valid link from cat', async (s1, cat) => {
    const reducableFromCat = await s1.dal.cindexDAL.getValidLinksFrom(cat.pub)
    assertEqual(reducableFromCat.length, 1)
    assertEqual(reduce(reducableFromCat).chainable_on, now + 4)
    assertEqual(reduce(reducableFromCat).replayable_on, now + 4 + 3) // Replayable date should have changed!
    assertEqual(reduce(reducableFromCat).expires_on, now + 4 + 10) // The expiration date should have changed! (this is the interest of a replay)
  })

  test('should correctly update wotb: current state', async (s1) => {
    assertEqual(s1._server.dal.wotb.dumpWoT(), `[M] [E] [R] [I] -> Links[maxCert = 40]
[0] [1] [1] [1] -> 1 | 
[1] [1] [1] [1] -> 0 | 
`)
  })

  test('should correctly update wotb: toc joins (t + 6)', async (s1, cat, tac, toc) => {
    await s1.commit({ time: now + 6 })
    await s1.commit({ time: now + 6 })
    await toc.createIdentity()
    await cat.cert(toc)
    await tac.cert(toc)
    await toc.join()
    await s1.commit({ time: now + 6 })
    assertEqual(s1._server.dal.wotb.dumpWoT(), `[M] [E] [R] [I] -> Links[maxCert = 40]
[0] [1] [1] [2] -> 1 | 
[1] [1] [1] [2] -> 0 | 
[2] [1] [2] [0] -> 0 | 1 | 
`)
  })

  test('should correctly update wotb: toc => cat', async (s1, cat, tac, toc) => {
    await s1.commit({ time: now + 6 })
    await toc.cert(cat)
    await s1.commit({ time: now + 12 })
    assertEqual(s1._server.dal.wotb.dumpWoT(), `[M] [E] [R] [I] -> Links[maxCert = 40]
[0] [1] [2] [2] -> 1 | 2 | 
[1] [1] [1] [2] -> 0 | 
[2] [1] [2] [1] -> 0 | 1 | 
`)
  })

  test('should correctly update wotb: cat loses 1 cert', async (s1) => {
    await s1.commit({ time: now + 12 })
    assertEqual(s1._server.dal.wotb.dumpWoT(), `[M] [E] [R] [I] -> Links[maxCert = 40]
[0] [1] [1] [2] -> 2 | 
[1] [1] [1] [1] -> 0 | 
[2] [1] [2] [1] -> 0 | 1 | 
`)
  })

  test('should correctly update wotb: tac loses 1 cert and gets kicked', async (s1) => {
    await s1.commit({ time: now + 14 }) // Change `Time`
    await s1.commit({ time: now + 14 }) // Change `MedianTime`
    await s1.commit({ time: now + 14 }) // Kick
    assertEqual(s1._server.dal.wotb.dumpWoT(), `[M] [E] [R] [I] -> Links[maxCert = 40]
[0] [1] [1] [1] -> 2 | 
[1] [0] [0] [1] -> 
[2] [1] [2] [1] -> 0 | 1 | 
`)
  })

  after(() => {
    CommonConstants.DUBP_NEXT_VERSION = 10
  })
}))
