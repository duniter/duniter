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

import {BlockchainDAO} from "../../app/lib/dal/indexDAL/abstract/BlockchainDAO"
import {assertEqual, writeBasicTestWithConfAnd2Users} from "../integration/tools/test-framework"
import {CommonConstants} from "../../app/lib/common-libs/constants"

describe('BlockchainDAO', () => writeBasicTestWithConfAnd2Users({
  sigReplay: 3,
  sigPeriod: 0,
  sigValidity: 10,
  udTime0: 1500000000,
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

  test('tic & toc join', async (s1, cat, tac, toc, tic) => {
    await toc.createIdentity()
    await tic.createIdentity()
    await tac.cert(toc)
    await cat.cert(tic)
    await toc.join()
    await tic.join()
    await s1.commit({ time: now })
    const idtyBlocks = await s1.dal.blockDAL.findWithIdentities()
    assertEqual(idtyBlocks.length, 2)
    assertEqual(idtyBlocks[0], 0)
    assertEqual(idtyBlocks[1], 2)
    const certBlocks = await s1.dal.blockDAL.findWithCertifications()
    assertEqual(certBlocks.length, 2)
    assertEqual(certBlocks[0], 0)
    assertEqual(certBlocks[1], 2)
    const mssBlocks = await s1.dal.blockDAL.findWithJoiners()
    assertEqual(mssBlocks.length, 2)
    assertEqual(mssBlocks[0], 0)
    assertEqual(mssBlocks[1], 2)
    const udBlocks = await s1.dal.blockDAL.findWithUD()
    assertEqual(udBlocks.length, 1)
    assertEqual(udBlocks[0], 1)
  })

  test('some cert join', async (s1, cat, tac, toc, tic) => {
    await tic.cert(toc)
    await s1.commit({ time: now })
    const idtyBlocks = await s1.dal.blockDAL.findWithIdentities()
    assertEqual(idtyBlocks.length, 2)
    assertEqual(idtyBlocks[0], 0)
    assertEqual(idtyBlocks[1], 2)
    const certBlocks = await s1.dal.blockDAL.findWithCertifications()
    assertEqual(certBlocks.length, 3)
    assertEqual(certBlocks[0], 0)
    assertEqual(certBlocks[1], 2)
    assertEqual(certBlocks[2], 3)
    const mssBlocks = await s1.dal.blockDAL.findWithJoiners()
    assertEqual(mssBlocks.length, 2)
    assertEqual(mssBlocks[0], 0)
    assertEqual(mssBlocks[1], 2)
  })

  test('send money', async (s1, cat, tac, toc, tic) => {
    await cat.sendMoney(100, toc)
    await tac.sendMoney(100, toc)
    await s1.commit({ time: now }) // b#4
    await toc.sendMoney(100, cat)
    await s1.commit({ time: now }) // b#5
    const idtyBlocks = await s1.dal.blockDAL.findWithIdentities()
    assertEqual(idtyBlocks.length, 2)
    assertEqual(idtyBlocks[0], 0)
    assertEqual(idtyBlocks[1], 2)
    const certBlocks = await s1.dal.blockDAL.findWithCertifications()
    assertEqual(certBlocks.length, 3)
    assertEqual(certBlocks[0], 0)
    assertEqual(certBlocks[1], 2)
    assertEqual(certBlocks[2], 3)
    const mssBlocks = await s1.dal.blockDAL.findWithJoiners()
    assertEqual(mssBlocks.length, 2)
    assertEqual(mssBlocks[0], 0)
    assertEqual(mssBlocks[1], 2)
    const txBlocks = await s1.dal.blockDAL.findWithTXs()
    assertEqual(txBlocks.length, 2)
    assertEqual(txBlocks[0], 4)
    assertEqual(txBlocks[1], 5)
  })

  test('revert block containing a cert', async (s1) => {
    await s1.revert()
    await s1.revert()
    await s1.revert()
    const idtyBlocks = await s1.dal.blockDAL.findWithIdentities()
    assertEqual(idtyBlocks.length, 2)
    assertEqual(idtyBlocks[0], 0)
    assertEqual(idtyBlocks[1], 2)
    const certBlocks = await s1.dal.blockDAL.findWithCertifications()
    assertEqual(certBlocks.length, 2)
    assertEqual(certBlocks[0], 0)
    assertEqual(certBlocks[1], 2)
    const mssBlocks = await s1.dal.blockDAL.findWithJoiners()
    assertEqual(mssBlocks.length, 2)
    assertEqual(mssBlocks[0], 0)
    assertEqual(mssBlocks[1], 2)
  })

  test('revert block containing toc and tic', async (s1) => {
    await s1.revert()
    const idtyBlocks = await s1.dal.blockDAL.findWithIdentities()
    assertEqual(idtyBlocks.length, 1)
    assertEqual(idtyBlocks[0], 0)
    const certBlocks = await s1.dal.blockDAL.findWithCertifications()
    assertEqual(certBlocks.length, 1)
    assertEqual(certBlocks[0], 0)
    const mssBlocks = await s1.dal.blockDAL.findWithJoiners()
    assertEqual(mssBlocks.length, 1)
    assertEqual(mssBlocks[0], 0)
  })

  test('revert all', async (s1) => {
    await s1.revert()
    await s1.revert()
    assertEqual((await s1.dal.blockDAL.findWithIdentities()).length, 0)
    assertEqual((await s1.dal.blockDAL.findWithCertifications()).length, 0)
    assertEqual((await s1.dal.blockDAL.findWithJoiners()).length, 0)
  })

  after(() => {
    CommonConstants.BLOCK_NEW_GENERATED_VERSION = 10
  })
}))