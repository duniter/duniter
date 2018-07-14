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

import * as assert from "assert"
import {LokiIndex} from "../../../app/lib/dal/indexDAL/loki/LokiIndex"
import {LokiProtocolIndex} from "../../../app/lib/dal/indexDAL/loki/LokiProtocolIndex"

const loki = require('lokijs')

interface TestEntity {
  name: string
  written_on: string
  writtenOn: number
}

let lokiIndex:LokiIndex<TestEntity>

class TheIndex extends LokiProtocolIndex<TestEntity> {
}

describe("Basic LokiJS database", () => {

  before(async () => {
    lokiIndex = new TheIndex(new loki('index.db'), 'iindex', [])
    await lokiIndex.triggerInit()
    await lokiIndex.init()
  })

  it('should be able instanciate the index', async () => {
    assert.notEqual(null, lokiIndex)
    assert.notEqual(undefined, lokiIndex)
  })

  it('should be able add new records', async () => {
    assert.equal(0, (await lokiIndex.findRaw()).length)
    await lokiIndex.insert({ written_on: '9-ABC', writtenOn: 9, name: 'A' })
    assert.equal(1, (await lokiIndex.findRaw()).length)
  })

})
