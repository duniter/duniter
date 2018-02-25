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

import {BasicBlockchain} from "../../app/lib/blockchain/BasicBlockchain"
import {ArrayBlockchain} from "./lib/ArrayBlockchain"
import {SQLBlockchain} from "../../app/lib/blockchain/SqlBlockchain"
import {SQLiteDriver} from "../../app/lib/dal/drivers/SQLiteDriver"
import {BIndexDAL} from "../../app/lib/dal/sqliteDAL/index/BIndexDAL";
import {MetaDAL} from "../../app/lib/dal/sqliteDAL/MetaDAL";
import {ConfDTO} from "../../app/lib/dto/ConfDTO";

const assert = require('assert')

let blockchain:BasicBlockchain,
  emptyBlockchain:BasicBlockchain

describe('Basic Memory Blockchain', () => {

  before(() => {
    blockchain = new BasicBlockchain(new ArrayBlockchain())
    emptyBlockchain = new BasicBlockchain(new ArrayBlockchain())
  })

  it('should be able to push 3 blocks and read them', async () => {
    await blockchain.pushBlock({ name: 'A' })
    await blockchain.pushBlock({ name: 'B' })
    await blockchain.pushBlock({ name: 'C' })
    const HEAD0 = await blockchain.head()
    const HEAD1 = await blockchain.head(1)
    const HEAD2 = await blockchain.head(2)
    const BLOCK0 = await blockchain.getBlock(0)
    const BLOCK1 = await blockchain.getBlock(1)
    const BLOCK2 = await blockchain.getBlock(2)
    assert.equal(HEAD0.name, 'C')
    assert.equal(HEAD1.name, 'B')
    assert.equal(HEAD2.name, 'A')
    assert.deepEqual(HEAD2, BLOCK0)
    assert.deepEqual(HEAD1, BLOCK1)
    assert.deepEqual(HEAD0, BLOCK2)
  })

  it('should be able to read a range', async () => {
    const range1 = await blockchain.headRange(2)
    assert.equal(range1.length, 2)
    assert.equal(range1[0].name, 'C')
    assert.equal(range1[1].name, 'B')
    const range2 = await blockchain.headRange(6)
    assert.equal(range2.length, 3)
    assert.equal(range2[0].name, 'C')
    assert.equal(range2[1].name, 'B')
    assert.equal(range2[2].name, 'A')
  })

  it('should have a good height', async () => {
    const height1 = await blockchain.height()
    await blockchain.pushBlock({ name: 'D' })
    const height2 = await blockchain.height()
    const height3 = await emptyBlockchain.height()
    assert.equal(height1, 3)
    assert.equal(height2, 4)
    assert.equal(height3, 0)
  })

  it('should be able to revert blocks', async () => {
    const reverted = await blockchain.revertHead()
    const height2 = await blockchain.height()
    assert.equal(height2, 3)
    assert.equal(reverted.name, 'D')
  })

})

describe('Basic SQL Blockchain', () => {

  before(async () => {

    {
      const db = new SQLiteDriver(':memory:')

      const bindexDAL = new BIndexDAL(db)
      const metaDAL = new MetaDAL(db)

      await bindexDAL.init()
      await metaDAL.init()
      await metaDAL.exec('CREATE TABLE txs (id INTEGER null);')
      await metaDAL.exec('CREATE TABLE idty (id INTEGER null);')
      await metaDAL.exec('CREATE TABLE cert (id INTEGER null);')
      await metaDAL.exec('CREATE TABLE membership (id INTEGER null);')
      await metaDAL.exec('CREATE TABLE block (fork INTEGER null);')
      await metaDAL.upgradeDatabase(ConfDTO.mock());

      const dal = { bindexDAL }

      blockchain = new BasicBlockchain(new SQLBlockchain(dal))
    }
    {
      const db = new SQLiteDriver(':memory:')

      const bindexDAL = new BIndexDAL(db)
      const metaDAL = new MetaDAL(db)

      await bindexDAL.init()
      await metaDAL.init()
      await metaDAL.exec('CREATE TABLE txs (id INTEGER null);')
      await metaDAL.exec('CREATE TABLE idty (id INTEGER null);')
      await metaDAL.exec('CREATE TABLE cert (id INTEGER null);')
      await metaDAL.exec('CREATE TABLE membership (id INTEGER null);')
      await metaDAL.exec('CREATE TABLE block (fork INTEGER null);')
      await metaDAL.upgradeDatabase(ConfDTO.mock());

      const dal = { bindexDAL }

      emptyBlockchain = new BasicBlockchain(new SQLBlockchain(dal))
    }
  })

  it('should be able to push 3 blocks and read them', async () => {
    await blockchain.pushBlock({ number: 0, version: 1, bsize: 0, hash: 'H', issuer: 'I', time: 1, membersCount: 1, issuersCount: 1, issuersFrame: 1, issuersFrameVar: 1, avgBlockSize: 0, medianTime: 1, dividend: 10, mass: 100, unitBase: 0, powMin: 0, udTime: 0, udReevalTime: 0, diffNumber: 1, speed: 1, massReeval: 1 })
    await blockchain.pushBlock({ number: 1, version: 1, bsize: 0, hash: 'H', issuer: 'I', time: 1, membersCount: 1, issuersCount: 1, issuersFrame: 1, issuersFrameVar: 1, avgBlockSize: 0, medianTime: 1, dividend: 10, mass: 100, unitBase: 0, powMin: 0, udTime: 0, udReevalTime: 0, diffNumber: 1, speed: 1, massReeval: 1 })
    await blockchain.pushBlock({ number: 2, version: 1, bsize: 0, hash: 'H', issuer: 'I', time: 1, membersCount: 1, issuersCount: 1, issuersFrame: 1, issuersFrameVar: 1, avgBlockSize: 0, medianTime: 1, dividend: 10, mass: 100, unitBase: 0, powMin: 0, udTime: 0, udReevalTime: 0, diffNumber: 1, speed: 1, massReeval: 1 })
    const HEAD0 = await blockchain.head()
    const HEAD1 = await blockchain.head(1)
    const HEAD2 = await blockchain.head(2)
    const BLOCK0 = await blockchain.getBlock(0)
    const BLOCK1 = await blockchain.getBlock(1)
    const BLOCK2 = await blockchain.getBlock(2)
    assert.equal(HEAD0.number, 2)
    assert.equal(HEAD1.number, 1)
    assert.equal(HEAD2.number, 0)
    assert.deepEqual(HEAD2, BLOCK0)
    assert.deepEqual(HEAD1, BLOCK1)
    assert.deepEqual(HEAD0, BLOCK2)
  })

  it('should be able to read a range', async () => {
    const range1 = await blockchain.headRange(2)
    assert.equal(range1.length, 2)
    assert.equal(range1[0].number, 2)
    assert.equal(range1[1].number, 1)
    const range2 = await blockchain.headRange(6)
    assert.equal(range2.length, 3)
    assert.equal(range2[0].number, 2)
    assert.equal(range2[1].number, 1)
    assert.equal(range2[2].number, 0)
  })

  it('should have a good height', async () => {
    const height1 = await blockchain.height()
    await blockchain.pushBlock({ number: 3, version: 1, bsize: 0, hash: 'H', issuer: 'I', time: 1, membersCount: 1, issuersCount: 1, issuersFrame: 1, issuersFrameVar: 1, avgBlockSize: 0, medianTime: 1, dividend: 10, mass: 100, unitBase: 0, powMin: 0, udTime: 0, udReevalTime: 0, diffNumber: 1, speed: 1, massReeval: 1 })
    const height2 = await blockchain.height()
    const height3 = await emptyBlockchain.height()
    assert.equal(height1, 3)
    assert.equal(height2, 4)
    assert.equal(height3, 0)
  })

  it('should be able to revert blocks', async () => {
    const reverted = await blockchain.revertHead()
    const height2 = await blockchain.height()
    assert.equal(height2, 3)
    assert.equal(reverted.number, 3)
  })

})
