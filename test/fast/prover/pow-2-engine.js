"use strict";

const co = require('co');
const should = require('should');
const PowEngine = require('../../../app/modules/prover/lib/engine').PowEngine
const logger = require('../../../app/lib/logger').NewLogger()

describe('PoW Engine', () => {

  it('should be configurable', () => co(function*(){
    const e1 = new PowEngine({ nbCores: 1 }, logger);
    (yield e1.setConf({ cpu: 0.2, prefix: '34' })).should.deepEqual({ cpu: 0.2, prefix: '34' });
    yield e1.shutDown()
  }));

  it('should be able to make a proof', () => co(function*(){
    const e1 = new PowEngine({ nbCores: 1 }, logger);
    const block = { number: 35 };
    const zeros = 2;
    const highMark = 'A';
    const pair = {
      pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd',
      sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'
    };
    const forcedTime = 1;
    const medianTimeBlocks = 20;
    const avgGenTime = 5 * 60;
    const proof = yield e1.prove({
        newPoW: {
          block,
          zeros,
          highMark,
          pair,
          forcedTime,
          conf: {
            medianTimeBlocks,
            avgGenTime
          }
        }
      }
    )
    proof.should.deepEqual({
      pow: {
        block: {
          number: 35,
          time: 1,
          inner_hash: '51937F1192447A96537D10968689F4F48859E2DD6F8F9E8DE1006C9697C6C940',
          nonce: 212,
          hash: '009A52E6E2E4EA7DE950A2DA673114FA55B070EBE350D75FF0C62C6AAE9A37E5',
          signature: 'bkmLGX7LNVkuOUMc+/HT6fXJajQtR5uk87fetIntMbGRZjychzu0whl5+AOOGlf+ilp/ara5UK6ppxyPcJIJAg=='
        },
        testsCount: 211,
        pow: '009A52E6E2E4EA7DE950A2DA673114FA55B070EBE350D75FF0C62C6AAE9A37E5'
      }
    });
    yield e1.shutDown()
  }));

  it('should be able to stop a proof', () => co(function*(){
    const e1 = new PowEngine({ nbCores: 1 }, logger);
    yield e1.forceInit()
    const block = { number: 26 };
    const zeros = 10; // Requires hundreds of thousands of tries probably
    const highMark = 'A';
    const pair = {
      pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd',
      sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'
    };
    const forcedTime = 1;
    const medianTimeBlocks = 20;
    const avgGenTime = 5 * 60;
    const proofPromise = e1.prove({
        newPoW: {
          block,
          zeros,
          highMark,
          pair,
          forcedTime,
          conf: {
            medianTimeBlocks,
            avgGenTime
          }
        }
      }
    )
    yield new Promise((res) => setTimeout(res, 10))
    yield e1.cancel()
    // const proof = yield proofPromise;
    // should.not.exist(proof);
    yield e1.shutDown()
  }));
});
