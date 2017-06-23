"use strict"

const co        = require('co')
const should    = require('should')
const toolbox = require('./tools/toolbox')

describe("Membership chainability", function() {

  describe("before July 2017", () => {

    const now = 1482220000
    let s1, cat

    const conf = {
      msPeriod: 20,
      nbCores: 1,
      msValidity: 10000,
      udTime0: now,
      udReevalTime0: now,
      sigQty: 1,
      medianTimeBlocks: 1 // The medianTime always equals previous block's medianTime
    }

    before(() => co(function*() {
      const res1 = yield toolbox.simpleNodeWith2Users(conf)
      s1 = res1.s1
      cat = res1.cat
      yield s1.commit({ time: now })
      yield s1.commit({ time: now })
      yield s1.commit({ time: now, actives: [
        'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd:rppB5NEwmdMUCxw3N/QPMk+V1h2Jpn0yxTzdO2xxcNN3MACv6x8vNTChWwM6DOq+kXiQHTczFzoux+82WkMfDQ==:1-12D7B9BEBE941F6929A4A61CDC06DEEEFCB00FD1DA72E42FFF7B19A338D421E1:0-E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855:cat'
      ]})
    }))

    it('current should be the 2nd', () => s1.expect('/blockchain/current', (res) => {
      res.should.have.property('number').equal(2)
      res.should.have.property('actives').length(1)
    }))
  })

  describe("after July 2017", () => {

    const now = 1498860000
    let s1, cat

    const conf = {
      msPeriod: 20,
      nbCores: 1,
      msValidity: 10000,
      udTime0: now,
      udReevalTime0: now,
      sigQty: 1,
      medianTimeBlocks: 1 // The medianTime always equals previous block's medianTime
    }

    before(() => co(function*() {
      const res1 = yield toolbox.simpleNodeWith2Users(conf)
      s1 = res1.s1
      cat = res1.cat
      yield s1.commit({ time: now })
      yield s1.commit({ time: now + 20 })
    }))

    it('should refuse a block with a too early membership in it', () => co(function*() {
      yield toolbox.shouldFail(s1.commit({
        time: now + 20,
        actives: ['HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd:SiCD1MSyDiZKWLp/SP/2Vj5T3JMgjNnIIKMI//yvKRdWMzKjEn6/ZT+TCjyjnl85qRfmEuWv1jLmQSoe8GXSDg==:1-0DEE2A8EA05322FCC4355D5F0E7A2830F4A22ACEBDC4B62399484E091A5CCF27:0-E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855:cat']
      }), '500 - "{\\n  \\"ucode\\": 1002,\\n  \\"message\\": \\"ruleMembershipPeriod\\"\\n}"')
    }))

    it('should not be able to renew immediately', () => co(function*() {
      yield cat.join()
      yield s1.commit({ time: now + 20 })
      yield s1.expect('/blockchain/block/2', (res) => {
        res.should.have.property('number').equal(2)
        res.should.have.property('joiners').length(0)
      })
    }))

    it('should be able to renew after 20 sec', () => co(function*() {
      yield s1.commit({ time: now + 20 })
      yield s1.expect('/blockchain/block/3', (res) => {
        res.should.have.property('number').equal(3)
        res.should.have.property('actives').length(1)
      })
    }))

    it('current should be the 4th', () => s1.expect('/blockchain/current', (res) => {
      res.should.have.property('number').equal(3)
      res.should.have.property('actives').length(1)
    }))
  })
})
