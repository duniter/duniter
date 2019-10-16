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
import {LevelDBBlockchain} from "../../app/lib/dal/indexDAL/leveldb/LevelDBBlockchain"
import {LevelDBDriver} from "../../app/lib/dal/drivers/LevelDBDriver"
import {assertEqual, assertNotNull, assertNull} from "../integration/tools/test-framework"
import {DBBlock} from "../../app/lib/db/DBBlock"

describe('BlockchainDAO', () => {

  BlockchainDAOSuite('LevelDBBlockchain', new LevelDBBlockchain(async () => LevelDBDriver.newMemoryInstance()))
})

function BlockchainDAOSuite(name: string, dao: BlockchainDAO) {

  before(async () => {
    await dao.init()
  })

  describe(name, () => {

    it('should save fork blocks', async () => {
      await dao.saveSideBlock({ number: 0, hash: 'AA0' } as any)
      await dao.saveSideBlock({ number: 0, hash: 'BB0' } as any)
      assertEqual((await dao.getPotentialRoots()).length, 2)
    })

    it('should find potential next blocks', async () => {
      await dao.saveSideBlock({ number: 1, hash: 'AA1-1', previousHash: 'AA0' } as any)
      await dao.saveSideBlock({ number: 1, hash: 'AA1-2', previousHash: 'AA0' } as any)
      await dao.saveSideBlock({ number: 1, hash: 'AA1-3', previousHash: 'AA0' } as any)
      await dao.saveSideBlock({ number: 1, hash: 'BB1-3', previousHash: 'BB0' } as any)
      // await (dao as any).forks.dump()
      assertEqual((await dao.getNextForkBlocks(0, 'AA0')).length, 3)
    })

    it('should find an absolute block (non-fork)', async () => {
      await dao.saveBlock({ number: 4984, hash: 'HHH' } as any)
      const b1 = await dao.getAbsoluteBlock(4983, 'HHH')
      const b2 = await dao.getAbsoluteBlock(4984, 'HHG')
      const b3 = await dao.getAbsoluteBlock(4984, 'HHH')
      assertNull(b1)
      assertNull(b2)
      assertNotNull(b3)
      assertEqual((b3 as DBBlock).number, 4984)
      assertEqual((b3 as DBBlock).hash, 'HHH')
    })
  })
}
