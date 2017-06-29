"use strict";

const assert = require('assert')
const co = require('co')
const ArrayBlockchain = require('./lib/arrayBlockchain')
const BasicBlockchain = require('../../app/lib/blockchain/basicBlockchain')

let blockchain, emptyBlockchain

describe('Basic Memory Blockchain', () => {

  before(() => {
    blockchain = new BasicBlockchain(ArrayBlockchain())
    emptyBlockchain = new BasicBlockchain(ArrayBlockchain())
  })

  it('should be able to push 3 blocks and read them', () => co(function*() {
    yield blockchain.pushBlock({ name: 'A' })
    yield blockchain.pushBlock({ name: 'B' })
    yield blockchain.pushBlock({ name: 'C' })
    const HEAD0 = yield blockchain.head()
    const HEAD1 = yield blockchain.head(1)
    const HEAD2 = yield blockchain.head(2)
    const BLOCK0 = yield blockchain.getBlock(0)
    const BLOCK1 = yield blockchain.getBlock(1)
    const BLOCK2 = yield blockchain.getBlock(2)
    assert.equal(HEAD0.name, 'C')
    assert.equal(HEAD1.name, 'B')
    assert.equal(HEAD2.name, 'A')
    assert.deepEqual(HEAD2, BLOCK0)
    assert.deepEqual(HEAD1, BLOCK1)
    assert.deepEqual(HEAD0, BLOCK2)
  }))

  it('should be able to read a range', () => co(function*() {
    const range1 = yield blockchain.headRange(2)
    assert.equal(range1.length, 2)
    assert.equal(range1[0].name, 'B')
    assert.equal(range1[1].name, 'C')
    const range2 = yield blockchain.headRange(6)
    assert.equal(range2.length, 3)
    assert.equal(range2[0].name, 'A')
    assert.equal(range2[1].name, 'B')
    assert.equal(range2[2].name, 'C')
  }))

  it('should have a good height', () => co(function*() {
    const height1 = yield blockchain.height()
    yield blockchain.pushBlock({ name: 'D' })
    const height2 = yield blockchain.height()
    const height3 = yield emptyBlockchain.height()
    assert.equal(height1, 3)
    assert.equal(height2, 4)
    assert.equal(height3, 0)
  }))

  it('should be able to revert blocks', () => co(function*() {
    const reverted = yield blockchain.revertHead()
    const height2 = yield blockchain.height()
    assert.equal(height2, 3)
    assert.equal(reverted.name, 'D')
  }))

})
