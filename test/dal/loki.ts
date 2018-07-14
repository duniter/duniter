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

import {LokiJsDriver} from "../../app/lib/dal/drivers/LokiJsDriver"
import {getNanosecondsTime} from "../../app/ProcessCpuProfiler"
import * as os from "os"
import * as path from "path"
import * as assert from "assert"
import {RealFS} from "../../app/lib/system/directory"
import {shouldThrow} from "../unit-tools"
import {DBCommit} from "../../app/lib/dal/drivers/LokiFsAdapter"

describe("Loki data layer", () => {

  let driver:LokiJsDriver
  let dbPath = path.join(os.tmpdir(), 'duniter' + getNanosecondsTime())

  it('should be able to create a new instance', async () => {
    driver = new LokiJsDriver(dbPath)
    await driver.loadDatabase()
  })

  it('should be able to commit data', async () => {
    const coll = driver.getLokiInstance().addCollection('block', { disableChangesApi: false })
    coll.insert({ a: 1 })
    coll.insert({ b: 2 })
    await driver.flushAndTrimData()
  })

  it('should be able restart the DB and read the data', async () => {
    const driver2 = new LokiJsDriver(dbPath)
    await driver2.loadDatabase()
    const coll = driver2.getLokiInstance().getCollection('block')
    assert.notEqual(null, coll)
    assert.equal(coll.find().length, 2)
  })

  it('should be able to add few changes data', async () => {
    const driver2 = new LokiJsDriver(dbPath)
    await driver2.loadDatabase()
    const coll = driver2.getLokiInstance().getCollection('block')
    coll.insert({ c: 3 })
    coll.chain().find({ c: 3 }).update((o:any) => o.c = 4)
    coll.chain().find({ a: 1 }).remove()
    const changesCount1 = await driver2.commitData()
    assert.equal(changesCount1, 3)
    const changesCount2 = await driver2.commitData()
    assert.equal(changesCount2, 0)
  })

  it('should be able restart the DB and read the commited data', async () => {
    const driver2 = new LokiJsDriver(dbPath)
    await driver2.loadDatabase()
    const coll = driver2.getLokiInstance().getCollection('block')
    assert.equal(coll.find().length, 2)
    assert.equal(coll.find({ a: 1 }).length, 0)
    assert.equal(coll.find({ b: 2 }).length, 1)
    assert.equal(coll.find({ c: 4 }).length, 1)
  })

  it('should be able to trim then restart the DB and read the commited data', async () => {
    const driverTrim = new LokiJsDriver(dbPath)
    await driverTrim.loadDatabase()
    await driverTrim.flushAndTrimData()
    const driver2 = new LokiJsDriver(dbPath)
    await driver2.loadDatabase()
    const coll = driver2.getLokiInstance().getCollection('block')
    assert.equal(coll.find().length, 2)
    assert.equal(coll.find({ a: 1 }).length, 0)
    assert.equal(coll.find({ b: 2 }).length, 1)
    assert.equal(coll.find({ c: 4 }).length, 1)
  })

  it('should not see any data if commit file is absent', async () => {
    const rfs = RealFS()
    await rfs.fsUnlink(path.join(dbPath, 'commit.json'))
    const driver3 = new LokiJsDriver(dbPath)
    await driver3.loadDatabase()
    const coll = driver3.getLokiInstance().getCollection('block')
    assert.equal(null, coll)
  })

  it('should throw if commit file contains unknown index file', async () => {
    const rfs = RealFS()
    await rfs.fsWrite(path.join(dbPath, 'commit.json'), JSON.stringify({
      indexFile: 'non-existing.index.json'
    }))
    const driver4 = new LokiJsDriver(dbPath)
    await shouldThrow(driver4.loadDatabase())
  })

  it('should throw if commit file contains unknown data files', async () => {
    const rfs = RealFS()
    await rfs.fsRemoveTree(dbPath)
    const driver4 = new LokiJsDriver(dbPath)
    const coll = driver4.getLokiInstance().addCollection('block')
    coll.insert({ a: 1 })
    coll.insert({ b: 2 })
    await driver.flushAndTrimData()
    const oldCommit:DBCommit = JSON.parse(await rfs.fsReadFile(path.join(dbPath, 'commit.json')))
    oldCommit.collections['block'] = 'wrong-file.json'
    const driver5 = new LokiJsDriver(dbPath)
    await shouldThrow(driver5.loadDatabase())
  })
})
