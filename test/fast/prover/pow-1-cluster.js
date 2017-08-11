"use strict";

const co = require('co')
const should = require('should')
const PowCluster = require('../../../app/modules/prover/lib/powCluster').Master
const logger = require('../../../app/lib/logger').NewLogger()

let master

describe('PoW Cluster', () => {

  before(() => {
    master = new PowCluster(1, logger)
  })

  it('should have an empty cluster if no PoW was asked', () => {
    master.nbWorkers.should.equal(0)
  })

  it('should answer for a basic PoW in more than 50ms (cold)', () => co(function*(){
    const start = Date.now()
    yield master.proveByWorkers({
      newPoW: {
        block: {
          number: 0
        },
        zeros: 0,
        highMark: 'F',
        conf: {
          medianTimeBlocks: 1,
          avgGenTime: 100,
          cpu: 0.8,
          prefix: '8'
        },
        pair: {
          pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd',
          sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'
        },
        turnDuration: 10
      }
    })
    const delay = Date.now() - start
    delay.should.be.above(50)
  }))

  it('should have an non-empty cluster after a PoW was asked', () => {
    master.nbWorkers.should.above(0)
  })

  it('should answer within 50ms for a basic PoW (warm)', () => co(function*(){
    const start = Date.now()
    yield master.proveByWorkers({
      newPoW: {
        block: {
          number: 0
        },
        zeros: 0,
        highMark: 'F',
        conf: {
          medianTimeBlocks: 1,
          avgGenTime: 100,
          cpu: 0.8,
          prefix: '8'
        },
        pair: {
          pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd',
          sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'
        },
        turnDuration: 100
      }
    })
    const delay = Date.now() - start
    delay.should.be.below(50)
  }))

});
