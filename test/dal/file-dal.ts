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

import {assertEqual, assertFalse, assertTrue, writeBasicTestWith2Users} from "../integration/tools/test-framework"
import {TestingServer} from "../integration/tools/toolbox"
import {CommonConstants} from "../../app/lib/common-libs/constants"

describe('File Data Access Layer', () => writeBasicTestWith2Users((test) => {

  let initialValue = CommonConstants.BLOCKS_COLLECT_THRESHOLD

  before(() => {
    // Let's trim loki data every 3 blocks
    CommonConstants.BLOCKS_COLLECT_THRESHOLD = 3
  })

  after(() => {
    // Revert
    CommonConstants.BLOCKS_COLLECT_THRESHOLD = initialValue
  })

  test('if we disable the changes API', async (s1: TestingServer) => {
    s1.dal.disableChangesAPI()
    assertTrue(s1.dal.iindexDAL.lokiCollection.disableChangesApi)
    assertTrue(s1.dal.iindexDAL.lokiCollection.disableDeltaChangesApi)
  })

  test('if we enable back the changes API', async (s1: TestingServer) => {
    s1.dal.enableChangesAPI()
    assertFalse(s1.dal.iindexDAL.lokiCollection.disableChangesApi)
    assertFalse(s1.dal.iindexDAL.lokiCollection.disableDeltaChangesApi)
  })

  test('we should have no changes after commit of b#0', async (s1, cat, tac) => {
    assertEqual(s1.dal.iindexDAL.lokiCollection.collection.data.length, 0)
    assertEqual(s1.dal.iindexDAL.lokiCollection.collection.changes.length, 0)
    await cat.createIdentity()
    await tac.createIdentity()
    await cat.cert(tac)
    await tac.cert(cat)
    await cat.join()
    await tac.join()
    await s1.commit()
    // No changes after a commit, but new data
    assertEqual(s1.dal.iindexDAL.lokiCollection.collection.data.length, 2)
    assertEqual(s1.dal.iindexDAL.lokiCollection.collection.changes.length, 0)
    // Without changes files (since block#0 triggers the lokijs data commit)
    assertEqual((await s1.dal.loki.listChangesFilesPending()).length, 0)
  })

  test('we should have changes files after commit of b#1', async (s1, cat, tac) => {
    await tac.revoke()
    await s1.commit()
    // Some changes, as block#1 does not provoke a lokijs data commit
    assertEqual(s1.dal.iindexDAL.lokiCollection.collection.data.length, 3)
    assertEqual(s1.dal.iindexDAL.lokiCollection.collection.changes.length, 0)
    // With changes files (since block#1 does not trigger the lokijs data commit)
    assertEqual((await s1.dal.loki.listChangesFilesPending()).length, 1)
  })

  test('we should have one more changes files after commit of b#2', async (s1) => {
    await s1.commit()
    // Some changes, as block#1 does not provoke a lokijs data commit
    assertEqual(s1.dal.iindexDAL.lokiCollection.collection.data.length, 3)
    assertEqual(s1.dal.iindexDAL.lokiCollection.collection.changes.length, 0)
    // With changes files (since block#1 does not trigger the lokijs data commit)
    assertEqual((await s1.dal.loki.listChangesFilesPending()).length, 2)
  })

  test('we should have no more changes files after commit of b#3', async (s1) => {
    await s1.commit()
    // Some changes, as block#1 does not provoke a lokijs data commit
    assertEqual(s1.dal.iindexDAL.lokiCollection.collection.data.length, 3)
    assertEqual(s1.dal.iindexDAL.lokiCollection.collection.changes.length, 0)
    // With changes files (since block#1 does not trigger the lokijs data commit)
    assertEqual((await s1.dal.loki.listChangesFilesPending()).length, 0)
  })
}))
