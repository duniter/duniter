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

import {Master} from "../../../app/modules/prover/lib/powCluster"

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

  it('should answer for a basic PoW in more than 50ms (cold)', async () => {
    const start = Date.now()
    await master.proveByWorkers({
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
  })

  it('should have an non-empty cluster after a PoW was asked', () => {
    master.nbWorkers.should.above(0)
  })

  it('should answer within 100ms for a basic PoW (warm)', async () => {
    const start = Date.now()
    await master.proveByWorkers({
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
    delay.should.be.below(100)
  })

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
