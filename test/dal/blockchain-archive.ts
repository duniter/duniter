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

import {getNanosecondsTime} from "../../app/ProcessCpuProfiler"
import * as os from "os"
import * as path from "path"
import * as assert from "assert"
import {BlockchainArchiveDAO, BlockLike} from "../../app/lib/dal/indexDAL/abstract/BlockchainArchiveDAO"
import {CFSBlockchainArchive} from "../../app/lib/dal/indexDAL/CFSBlockchainArchive"
import {CFSCore} from "../../app/lib/dal/fileDALs/CFSCore"
import {RealFS} from "../../app/lib/system/directory"

describe("Blockchain Archive data layer", () => {

  let archives:BlockchainArchiveDAO<BlockLike>
  let dbPath = path.join(os.tmpdir(), 'duniter' + getNanosecondsTime())

  before(async () => {
    archives = new CFSBlockchainArchive(new CFSCore(dbPath, RealFS()), 2)
    archives.triggerInit()
    await archives.init()
  })

  it('should be able to read last saved block when archives are empty', async () => {
    assert.equal(null, await archives.getLastSavedBlock())
  })

  it('should be able to archive 4 blocks', async () => {
    const chunksCreated = await archives.archive([
      { number: 0, hash: 'H0', previousHash: '' },
      { number: 1, hash: 'H1', previousHash: 'H0' },
      { number: 2, hash: 'H2', previousHash: 'H1' },
      { number: 3, hash: 'H3', previousHash: 'H2' },
      { number: 4, hash: 'H4', previousHash: 'H3' },
      { number: 5, hash: 'H5', previousHash: 'H4' },
    ])
    assert.equal(chunksCreated, 3)
  })

  it('should be able to read archived blocks', async () => {
    assert.notEqual(null, await archives.getBlock(0, 'H0'))
    assert.notEqual(null, await archives.getBlock(1, 'H1'))
    assert.notEqual(null, await archives.getBlock(2, 'H2'))
    assert.notEqual(null, await archives.getBlock(3, 'H3'))
    assert.notEqual(null, await archives.getBlock(4, 'H4'))
    assert.notEqual(null, await archives.getBlock(5, 'H5'))
  })

  it('should be able to read last saved block when archives are full', async () => {
    assert.notEqual(null, await archives.getLastSavedBlock())
    assert.equal(5, ((await archives.getLastSavedBlock()) as BlockLike).number)
  })

  it('should not be able to read non-archived blocks', async () => {
    assert.equal(null, await archives.getBlock(0, 'H5'))
    assert.equal(null, await archives.getBlock(8, 'H8'))
  })

  it('should refuse to store unchained blocks', async () => {
    const chunksCreated1 = await archives.archive([
      { number: 6, hash: 'H6', previousHash: 'H5' },
      { number: 7, hash: 'H7', previousHash: 'H61' },
    ])
    assert.equal(chunksCreated1, 0)
    const chunksCreated2 = await archives.archive([
      { number: 6, hash: 'H6', previousHash: 'H5' },
      { number: 8, hash: 'H7', previousHash: 'H6' },
    ])
    assert.equal(chunksCreated2, 0)
  })

  it('should refuse to store blocks that are not chunks', async () => {
    const chunksCreated = await archives.archive([
      { number: 6, hash: 'H6', previousHash: 'H5' },
    ])
    assert.equal(chunksCreated, 0)
  })
})
