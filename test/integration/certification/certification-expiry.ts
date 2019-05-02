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
import {CommonConstants} from "../../../app/lib/common-libs/constants"

describe('Certification expiry + trimming', () => writeBasicTestWithConfAnd2Users({
  sigReplay: 3,
  sigPeriod: 0,
  sigValidity: 10,
}, (test) => {

  before(() => {
    CommonConstants.BLOCK_NEW_GENERATED_VERSION = 11
  })

  const now = 1500000000

  test('should be able to init with 2 blocks', async (s1, cat, tac, toc) => {
    await cat.createIdentity()
    await tac.createIdentity()
    await toc.createIdentity()
    // Circular certs
    await cat.cert(tac)
    await tac.cert(toc)
    await toc.cert(cat)
    await cat.join()
    await tac.join()
    await toc.join()
    await s1.commit({ time: now, version: 10 })
    await s1.commit({ time: now })
    // Circular WoT
    assertEqual(s1._server.dal.wotb.dumpWoT(), `[M] [E] [R] [I] -> Links[maxCert = 40]
[0] [1] [1] [1] -> 2 | 
[1] [1] [1] [1] -> 0 | 
[2] [1] [1] [1] -> 1 | 
`)
  })

  test('some replays from tac at t+4 and t+6', async (s1, cat, tac, toc) => {
    await s1.commit({ time: now + 4 })
    await s1.commit({ time: now + 4 }) // <-- it is now t+4
    await tac.cert(toc)
    await s1.commit({ time: now + 6 })
    await s1.commit({ time: now + 6 }) // <-- it is now t+6
    await tac.cert(cat)
    await s1.commit({ time: now + 8 })
    // Wot adds a certificat for tac to cat
    assertEqual(s1._server.dal.wotb.dumpWoT(), `[M] [E] [R] [I] -> Links[maxCert = 40]
[0] [1] [2] [1] -> 2 | 1 | 
[1] [1] [1] [2] -> 0 | 
[2] [1] [1] [1] -> 1 | 
`)
  })

  test('also, toc certify cat and tac later to keep the wot safe', async (s1, cat, tac, toc) => {
    await s1.commit({ time: now + 8 }) // <-- it is now t+8
    await toc.cert(cat)
    await s1.commit({ time: now + 9 })
    await s1.commit({ time: now + 9 }) // <-- it is now t+9
    await toc.cert(tac)
    await s1.commit({ time: now + 9 })
    assertEqual(s1._server.dal.wotb.dumpWoT(), `[M] [E] [R] [I] -> Links[maxCert = 40]
[0] [1] [2] [1] -> 2 | 1 | 
[1] [1] [2] [2] -> 0 | 2 | 
[2] [1] [1] [2] -> 1 | 
`)
  })

  test('at t+10, only cat -> tac cert should be removed (it has not been replayed)', async (s1) => {
    await s1.commit({ time: now + 10 }) // Change `Time`
    await s1.commit({ time: now + 10 }) // <-- it is now t+10
    assertEqual(s1._server.dal.wotb.dumpWoT(), `[M] [E] [R] [I] -> Links[maxCert = 40]
[0] [1] [2] [0] -> 2 | 1 | 
[1] [1] [1] [2] -> 2 | 
[2] [1] [1] [2] -> 1 | 
`)
  })

  test('at t+14, tac -> toc cert should be removed', async (s1) => {
    await s1.commit({ time: now + 14 }) // Change `Time`
    await s1.commit({ time: now + 14 }) // Change `MedianTime`
    assertEqual(s1._server.dal.wotb.dumpWoT(), `[M] [E] [R] [I] -> Links[maxCert = 40]
[0] [1] [2] [0] -> 2 | 1 | 
[1] [1] [1] [1] -> 2 | 
[2] [1] [0] [2] -> 
`)
  })

  test('at t+16, tac -> cat cert should be removed without bug', async (s1) => {
    await s1._server.dal.cindexDAL.trimExpiredCerts(16) // <-- **THIS** is what was triggering the core dump
    await s1.commit({ time: now + 16 }) // Change `Time`
    await s1.commit({ time: now + 16 }) // Change `MedianTime`
    assertEqual(s1._server.dal.wotb.dumpWoT(), `[M] [E] [R] [I] -> Links[maxCert = 40]
[0] [1] [1] [0] -> 2 | 
[1] [1] [1] [0] -> 2 | 
[2] [0] [0] [2] -> 
`)
  })

  after(() => {
    CommonConstants.BLOCK_NEW_GENERATED_VERSION = 10
  })
}))
