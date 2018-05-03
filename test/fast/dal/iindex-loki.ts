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
import {LokiIIndex} from "../../../app/lib/dal/indexDAL/loki/LokiIIndex"

const loki = require('lokijs')

let lokiIndex:LokiIIndex

describe("IIndex LokiJS", () => {

  before(async () => {
    lokiIndex = new LokiIIndex(new loki('index.db'))
    await lokiIndex.triggerInit()
    await lokiIndex.init()
  })

  it('should be able instanciate the index', async () => {
    assert.notEqual(null, lokiIndex)
    assert.notEqual(undefined, lokiIndex)
  })

  it('should be able to add new records', async () => {
    assert.equal(0, (await lokiIndex.findRaw()).length)
    await lokiIndex.insert({
      index: 'iindex',
      op: 'CREATE',
      uid: 'test-uid',
      pub: 'test-pub',
      hash: 'test-hash',
      sig: 'test-sig',
      created_on: '1-HASH_1',
      written_on: '2-HASH_2',
      writtenOn: 2,
      age: 0,
      member: true,
      wasMember: true,
      kick: false,
      wotb_id: null
    })
    await lokiIndex.insert({
      index: 'iindex',
      op: 'UPDATE',
      uid: null,
      pub: 'test-pub',
      hash: null,
      sig: null,
      created_on: '1-HASH_1',
      written_on: '3-HASH_3',
      writtenOn: 3,
      age: 0,
      member: false,
      wasMember: true,
      kick: false,
      wotb_id: null
    })
    assert.equal(2, (await lokiIndex.findRaw()).length)
  })

  it('should be able to trim records', async () => {
    assert.equal(2, (await lokiIndex.findRaw()).length)
    await lokiIndex.trimRecords(4)
    assert.equal(1, (await lokiIndex.findRaw()).length)
  })

})
