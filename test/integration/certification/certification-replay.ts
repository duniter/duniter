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
  sigValidity: 5,
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

  test('should exist only 1 valid link from cat replyable at t + 3', async (s1, cat, tac) => {
    const reducableFromTac = await s1.dal.cindexDAL.reducablesFrom(tac.pub)
    assertEqual(reducableFromTac.length, 1)
    assertEqual(reduce(reducableFromTac).chainable_on, now) // No delay between certifications
    assertEqual(reduce(reducableFromTac).replayable_on, now + 3) // Replay of a particular certification <-- What we want to test
    assertEqual(reduce(reducableFromTac).expires_on, now + 5) // The expiration date of the certification **INITIALLY**
  })

  test('should reject a replay from tac', async (s1, cat, tac) => {
    await assertThrows(tac.cert(cat), '{\n  "ucode": 1004,\n  "message": "Already up-to-date"\n}')
  })

  test('should accept replay if time has passed enought', async (s1, cat, tac) => {
    await s1.commit({ time: now + 4 })
    await s1.commit({ time: now + 4 })
    await tac.cert(cat)
    const b = await s1.commit({ time: now + 4 })
    assertEqual(b.certifications.length, 1)
  })

  test('should exist only 2 CINDEX entries from cat', async (s1, cat, tac) => {
    const validLinksFromTac = await s1.dal.cindexDAL.findByIssuer(tac.pub)
    assertEqual(validLinksFromTac.length, 2)
  })

  test('should exist only 1 valid link from cat', async (s1, cat, tac) => {
    const reducableFromTac = await s1.dal.cindexDAL.getValidLinksFrom(tac.pub)
    assertEqual(reducableFromTac.length, 1)
    assertEqual(reduce(reducableFromTac).chainable_on, now + 4)
    assertEqual(reduce(reducableFromTac).replayable_on, now + 4 + 3) // Replayable date should have changed!
    assertEqual(reduce(reducableFromTac).expires_on, now + 4 + 5) // The expiration date should have changed! (this is the interest of a replay)
  })

  test('should kick a member who lost its last certification', async (s1) => {
    const b5 = await s1.commit({ time: now + 5 })
    const b6 = await s1.commit({ time: now + 5 })
    const b7 = await s1.commit({ time: now + 5 })
    assertEqual(b5.excluded.length, 0)
    assertEqual(b6.excluded.length, 0)
    assertEqual(b7.excluded.length, 1)
  })

  test('should allow comeback if a new cert is received', async (s1, cat, tac) => {
    await cat.cert(tac)
    await tac.join()
    const b8 = await s1.commit({ time: now + 8 })
    const b9 = await s1.commit({ time: now + 8 })
    const b10 = await s1.commit({ time: now + 8 })
    assertEqual(b8.joiners.length, 1)
    assertEqual(b8.excluded.length, 0)
    assertEqual(b9.excluded.length, 0)
    assertEqual(b10.excluded.length, 0)
  })

  test('should allow to maintain again (2 certification replay)', async (s1, cat, tac) => {
    await tac.cert(cat)
    const b11 = await s1.commit({ time: now + 9 })
    const b12 = await s1.commit({ time: now + 9 })
    assertEqual(b11.certifications.length, 1)
    assertEqual(b11.excluded.length, 0)
    assertEqual(b12.excluded.length, 0)
    const reducableFromTac = await s1.dal.cindexDAL.reducablesFrom(tac.pub)
    assertEqual(reduce(reducableFromTac).expires_on, now + 4 + 5 + 4) // The expiration date should have changed! (this is the interest of a replay)
  })

  test('should kick tac again for lack of certifications', async (s1) => {
    const b13 = await s1.commit({ time: now + 10 })
    const b14 = await s1.commit({ time: now + 10 })
    const b15 = await s1.commit({ time: now + 10 })
    assertEqual(b13.excluded.length, 0)
    assertEqual(b14.excluded.length, 0)
    assertEqual(b15.excluded.length, 1)
  })

  test('should allow comeback again, and again.', async (s1, cat, tac) => {
    await cat.cert(tac)
    await tac.join()
    const b16 = await s1.commit({ time: now + 10 })
    const b17 = await s1.commit({ time: now + 10 })
    const b18 = await s1.commit({ time: now + 10 })
    assertEqual(b16.joiners.length, 1)
    assertEqual(b16.excluded.length, 0)
    assertEqual(b17.excluded.length, 0)
    assertEqual(b18.excluded.length, 0)
  })

  after(() => {
    CommonConstants.BLOCK_NEW_GENERATED_VERSION = 10
  })
}))
