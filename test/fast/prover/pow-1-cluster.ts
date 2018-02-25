import {Master} from "../../../app/modules/prover/lib/powCluster"

const co = require('co')
require('should')
const logger = require('../../../app/lib/logger').NewLogger()

let master:Master

describe('PoW Cluster', () => {

  before(() => {
    master = new Master(1, logger)
  })

  after(() => {
    return master.shutDownWorkers()
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

  it('should be able to stop all the cores on cancel', async () => {
    master.proveByWorkers({
      initialTestsPerRound: 100,
      maxDuration: 1000,
      newPoW: {
        block: {
          number: 0
        },
        zeros: 10,
        highMark: 'F',
        conf: {
          medianTimeBlocks: 1,
          avgGenTime: 100,
          cpu: 0.8,
          prefix: '8',
          nbCores: 1
        },
        pair: {
          pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd',
          sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'
        }
      }
    })
    await new Promise(res => {
      master.onInfoMessage = () => res()
    })
    await master.cancelWork()
    await new Promise(res => setTimeout(res, 100))
    master.nbCancels.should.equal(1)
  })

});
