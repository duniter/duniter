"use strict"

const co        = require('co')
const should    = require('should')
const toolbox = require('./tools/toolbox')

describe("Revert balance", () => {

  const now = 1480000000
  let s1, cat, tac

  const conf = {
    nbCores: 1,
    ud0: 100,
    dt: 1,
    udTime0: now,
    sigQty: 1,
    medianTimeBlocks: 1 // The medianTime always equals previous block's medianTime
  }

  before(() => co(function*() {
    const res1 = yield toolbox.simpleNodeWith2Users(conf)
    s1 = res1.s1
    cat = res1.cat
    tac = res1.tac
    yield s1.commit({ time: now })
    yield s1.commit({ time: now + 1 })
    yield s1.commit({ time: now + 1  })
  }))

  it('cat and tac should have 200 units', () => co(function*() {
    yield s1.expect('/tx/sources/' + cat.pub, (res) => {
      res.sources.should.have.length(2)
    })
    yield s1.expect('/tx/sources/' + tac.pub, (res) => {
      res.sources.should.have.length(2)
    })
  }))

  it('cat should be able to send 60 units to tac', () => co(function*() {
    yield cat.send(60, tac)
    yield s1.commit({ time: now + 1 })
    yield s1.expect('/tx/sources/' + cat.pub, (res) => {
      res.sources.should.have.length(2)
    })
    yield s1.expect('/tx/sources/' + tac.pub, (res) => {
      res.sources.should.have.length(3)
    })
    const block = yield s1.dal.blockDAL.getBlock(3)
    // yield s1.writeBlock(block)
  }))

  it('revert: cat and tac should have 100 units', () => co(function*() {
    yield s1.revert();
    yield s1.expect('/tx/sources/' + cat.pub, (res) => {
      res.sources.should.have.length(2)
    })
    yield s1.expect('/tx/sources/' + tac.pub, (res) => {
      res.sources.should.have.length(2)
    })
  }))

  it('cat should be able to RE-send 60 units to tac', () => co(function*() {
    const txsPending = yield s1.dal.txsDAL.getAllPending(1)
    txsPending.should.have.length(1)
    yield s1.commit({ time: now + 1 })
    yield s1.expect('/tx/sources/' + cat.pub, (res) => {
      // Should have 2 sources:
      // * the 2nd UD = 100
      // * the rest of the 1st UD - the money sent (60) = 40
      res.sources.should.have.length(2)
    })
    yield s1.expect('/tx/sources/' + tac.pub, (res) => {
      res.sources.should.have.length(3)
    })
    const block = yield s1.dal.blockDAL.getBlock(3)
    // yield s1.writeBlock(block)
  }))

  after(() => {
    return s1.closeCluster()
  })
})
