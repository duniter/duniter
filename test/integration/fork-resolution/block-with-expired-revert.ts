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

import {
  assertDeepEqual,
  assertEqual,
  assertFalse, assertNull,
  assertTrue,
  writeBasicTestWithConfAnd2Users
} from "../tools/test-framework"
import {CommonConstants} from "../../../app/lib/common-libs/constants"
import {Server} from "../../../server";

const es = require('event-stream');

const currentVersion = CommonConstants.BLOCK_GENESIS_VERSION

describe('Block revert with an identity expiry in it', () => writeBasicTestWithConfAnd2Users({
  sigQty: 2,
  sigReplay: 0,
  sigPeriod: 0,
  sigValidity: 10,
  msValidity: 5,
  dtDiffEval: 1,
  forksize: 0,
}, (test) => {

  const now = 1500000000

  test('(t = 0) should init with a 3 members WoT with bidirectionnal certs', async (s1, cat, tac, toc) => {
    CommonConstants.BLOCK_GENESIS_VERSION = 11
    await cat.createIdentity()
    await tac.createIdentity()
    await toc.createIdentity()
    await cat.cert(tac)
    await cat.cert(toc)
    await tac.cert(cat)
    await tac.cert(toc)
    await toc.cert(cat)
    await toc.cert(tac)
    await cat.join()
    await tac.join()
    await toc.join()
    const b0 = await s1.commit({ time: now })
    assertEqual(b0.certifications.length, 6)
    const b1 = await s1.commit({ time: now })
    assertEqual(b1.membersCount, 3)
  })

  test('(t = 3) cat & tac renew their membership, but NOT toc', async (s1, cat, tac, toc) => {
    await s1.commit({ time: now + 3 })
    await s1.commit({ time: now + 3 })
    // cat and tac renew their membership to stay in the WoT
    await tac.join()
    await cat.join()
    const b1 = await s1.commit({ time: now + 3 })
    assertEqual(b1.actives.length, 2)
    // The index expects toc to expire at time = 1500000005
    assertDeepEqual(await s1.getMindexExpiresOnIndexer().getOrNull('1500000005'),
      ['DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo'])
  })

  test('(t = 6) toc membership expires', async (s1, cat, tac, toc) => {
    await s1.commit({ time: now + 6 })
    const b = await s1.commit({ time: now + 6 })
    const mindexChanges = await s1.dal.mindexDAL.getWrittenOn([b.number, b.hash].join('-'))
    assertEqual(mindexChanges.length, 1)
    assertEqual(mindexChanges[0].pub, toc.pub)
    assertEqual(mindexChanges[0].expired_on as number, 1500000006)
    assertEqual(b.excluded.length, 0) // Not excluded right now, but at next block
    // The index no more expires anyone to expire at 1500000005
    assertDeepEqual(await s1.getMindexExpiresOnIndexer().getOrNull('1500000005'), null)
  })

  test('block t = 6 reverted successfully', async (s1) => {
    await s1.revert()
    const b = await s1.dal.getBlockCurrent()
    assertEqual(b.number, 5)
    assertDeepEqual(await s1.getMindexExpiresOnIndexer().getOrNull('1500000005'),
      ['DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo'])
  })

  test('resolution should put back block t = 6 successfully', async (s1) => {
    const err = await s1.resolveForError()
    assertNull(err)
    const b = await s1.dal.getBlockCurrent()
    assertEqual(b.number, 6)
  })

  after(() => {
    CommonConstants.BLOCK_GENESIS_VERSION = currentVersion
  })
}))

