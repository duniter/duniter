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

import {simpleNodeWith2Users, TestingServer} from "./tools/toolbox"
import {Underscore} from "../../app/lib/common-libs/underscore"

const TestUser = require('./tools/TestUser').TestUser

describe("Revoked pubkey replay", function() {

  const now = 1500000000
  const DONT_WAIT_FOR_BLOCKCHAIN_CHANGE = true
  let s1:TestingServer, cat:any, tic:any

  const conf = { nbCores: 1, sigQty: 1 }

  before(async () => {
    const res1 = await simpleNodeWith2Users(conf)
    s1 = res1.s1
    cat = res1.cat
    tic = new TestUser('tic', { pub: 'DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV', sec: '468Q1XtTq7h84NorZdWBZFJrGkB18CbmbHr9tkp9snt5GiERP7ySs3wM8myLccbAAGejgMRC9rqnXuW3iAfZACm7'}, { server: s1 })
    await s1.commit({ time: now })
    await s1.commit({ time: now })
    // Create the tested identity « tic »
    await tic.createIdentity()
  })

  it('should exist tic as pending identity', () => s1.expect('/wot/lookup/tic', (res:any) => {
    res.should.have.property('results').length(1)
    res.results[0].should.have.property('uids').length(1)
    res.results[0].uids[0].should.have.property('uid').equal('tic')
  }))

  it('should be able to make tic become a member', async () => {
    await tic.join()
    await cat.cert(tic)
    await s1.commit()
    await s1.expect('/wot/members', (res:any) => {
      res.should.have.property('results').length(3)
      const ticEntries = Underscore.filter(res.results, (entry:any) => entry.uid === 'tic')
      ticEntries.should.have.length(1)
    })
  })

  it('should be able to revoke tic', async () => {
    await tic.revoke()
    await s1.expect('/wot/lookup/tic', (res:any) => {
      res.should.have.property('results').length(1)
      res.results[0].should.have.property('uids').length(1)
      res.results[0].uids[0].should.have.property('uid').equal('tic')
      res.results[0].uids[0].should.have.property('revocation_sig').not.equal(null)
    })
    await s1.commit()
    await s1.expect('/wot/members', (res:any) => {
      res.should.have.property('results').length(2)
      const ticEntries = Underscore.filter(res.results, (entry:any) => entry.uid === 'tic')
      ticEntries.should.have.length(0)
    })
  })

  it('should not try to include tic2 in a new block', async () => {
    await s1.commit()
    await tic.join()
    const block = await s1.commit(null, DONT_WAIT_FOR_BLOCKCHAIN_CHANGE)
    block.should.have.property('joiners').length(0)
  })

  after(async () => {
    await s1.closeCluster()
  })
})
