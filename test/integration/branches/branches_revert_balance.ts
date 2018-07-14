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

import {simpleNodeWith2Users, TestingServer} from "../tools/toolbox"
import {TestUser} from "../tools/TestUser"

const should    = require('should')

describe("Revert balance", () => {

  const now = 1480000000
  let s1:TestingServer, cat:TestUser, tac:TestUser

  const conf = {
    nbCores: 1,
    ud0: 100,
    dt: 1,
    udTime0: now,
    sigQty: 1,
    medianTimeBlocks: 1 // The medianTime always equals previous block's medianTime
  }

  before(async () => {
    const res1 = await simpleNodeWith2Users(conf)
    s1 = res1.s1
    cat = res1.cat
    tac = res1.tac
    await s1.commit({ time: now })
    await s1.commit({ time: now + 1 })
    await s1.commit({ time: now + 1  })
  })

  it('cat and tac should have 200 units', async () =>  {
    await s1.expect('/tx/sources/' + cat.pub, (res:any) => {
      res.sources.should.have.length(2)
    })
    await s1.expect('/tx/sources/' + tac.pub, (res:any) => {
      res.sources.should.have.length(2)
    })
  })

  it('cat should be able to send 60 units to tac', async () =>  {
    await cat.sendMoney(60, tac)
    await s1.commit({ time: now + 1 })
    await s1.expect('/tx/sources/' + cat.pub, (res:any) => {
      res.sources.should.have.length(2)
    })
    await s1.expect('/tx/sources/' + tac.pub, (res:any) => {
      res.sources.should.have.length(3)
    })
    const block = await s1.dal.blockDAL.getBlock(3)
    // await s1.writeBlock(block)
  })

  it('revert: cat and tac should have 100 units', async () =>  {
    await s1.revert();
    await s1.expect('/tx/sources/' + cat.pub, (res:any) => {
      res.sources.should.have.length(2)
    })
    await s1.expect('/tx/sources/' + tac.pub, (res:any) => {
      res.sources.should.have.length(2)
    })
  })

  it('cat should be able to RE-send 60 units to tac', async () =>  {
    const txsPending = await s1.dal.txsDAL.getAllPending(1)
    await s1.dal.blockDAL.removeForkBlock(3)
    txsPending.should.have.length(1)
    await s1.commit({ time: now + 1 })
    await s1.expect('/tx/sources/' + cat.pub, (res:any) => {
      // Should have 2 sources:
      // * the 2nd UD = 100
      // * the rest of the 1st UD - the money sent (60) = 40
      res.sources.should.have.length(2)
    })
    await s1.expect('/tx/sources/' + tac.pub, (res:any) => {
      res.sources.should.have.length(3)
    })
    const block = await s1.dal.blockDAL.getBlock(3)
    // await s1.writeBlock(block)
  })

  after(() => {
    return s1.closeCluster()
  })
})
