"use strict";

const _ = require('underscore');
const co        = require('co');
const assert    = require('assert');
const user      = require('./tools/user');
const commit    = require('./tools/commit');
const toolbox   = require('./tools/toolbox');
const CommonConstants = require('../../app/lib/common-libs/constants').CommonConstants

const now = 1500000000
const forksize = 10

let s1, s2, s3, cat1, tac1, toc1

describe("Fork blocks", function() {

  before(() => co(function*() {

    s1 = toolbox.server({

      // The common conf
      medianTimeBlocks: 1,
      avgGenTime: 11,
      udTime0: now,
      udReevalTime0: now,
      forksize,

      pair: {
        pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd',
        sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'
      }
    });

    s2 = toolbox.server({

      // Particular conf
      switchOnHeadAdvance: 5,
      forksize,

      pair: {
        pub: '2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc',
        sec: '2HuRLWgKgED1bVio1tdpeXrf7zuUszv1yPHDsDj7kcMC4rVSN9RC58ogjtKNfTbH1eFz7rn38U1PywNs3m6Q7UxE'
      }
    });

    s3 = toolbox.server({

      // Particular conf
      switchOnHeadAdvance: 5,
      forksize,

      pair: {
        pub: 'DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo',
        sec: '64EYRvdPpTfLGGmaX5nijLXRqWXaVz8r1Z1GtaahXwVSJGQRn7tqkxLb288zwSYzELMEG5ZhXSBYSxsTsz1m9y8F'
      }
    });

    cat1 = user('cat', { pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'}, { server: s1 });
    tac1 = user('tac', { pub: '2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc', sec: '2HuRLWgKgED1bVio1tdpeXrf7zuUszv1yPHDsDj7kcMC4rVSN9RC58ogjtKNfTbH1eFz7rn38U1PywNs3m6Q7UxE'}, { server: s1 });
    toc1 = user('toc', { pub: 'DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo', sec: '64EYRvdPpTfLGGmaX5nijLXRqWXaVz8r1Z1GtaahXwVSJGQRn7tqkxLb288zwSYzELMEG5ZhXSBYSxsTsz1m9y8F'}, { server: s1 });

    yield s1.prepareForNetwork();
    yield s2.prepareForNetwork();
    yield s3.prepareForNetwork();

    // Publishing identities
    yield cat1.createIdentity();
    yield tac1.createIdentity();
    yield toc1.createIdentity();
    yield cat1.cert(tac1);
    yield tac1.cert(cat1);
    yield tac1.cert(toc1);
    yield cat1.join();
    yield tac1.join();
    yield toc1.join();
  }));

  after(() => {
    return Promise.all([
      s1.closeCluster(),
      s2.closeCluster(),
      s3.closeCluster()
    ])
  })

  it('should create a common blockchain', () => co(function*() {
    const b0 = yield s1.commit({ time: now })
    const b1 = yield s1.commit({ time: now + 11 })
    const b2 = yield s1.commit({ time: now + 22 })
    yield s2.writeBlock(b0)
    yield s2.writeBlock(b1)
    yield s2.writeBlock(b2)
    yield s3.writeBlock(b0)
    yield s3.writeBlock(b1)
    yield s3.writeBlock(b2)
    yield s2.waitToHaveBlock(2)
    yield s3.waitToHaveBlock(2)
  }))

  it('should exist the same block on each node', () => co(function*() {
    yield s1.expectJSON('/blockchain/current', {
      number: 2
    })
    yield s2.expectJSON('/blockchain/current', {
      number: 2
    })
  }))

  it('should be able to fork, and notify each node', () => co(function*() {
    const b3a = yield s1.commit({ time: now + 33 })
    const b3b = yield s2.commit({ time: now + 33 })
    yield s1.writeBlock(b3b)
    yield s2.writeBlock(b3a)
    yield s1.waitToHaveBlock(3)
    yield s2.waitToHaveBlock(3)
  }))

  it('should exist a different third block on each node', () => co(function*() {
    yield s1.expectJSON('/blockchain/current', {
      number: 3,
      hash: "74AB356F0E6CD9AA6F752E58FFCD65D5F8C95CDAA93576A40457CC3598C4E3D1"
    })
    yield s2.expectJSON('/blockchain/current', {
      number: 3,
      hash: "2C3555F4009461C81F7209EAAD7DA831D8451708D06BB1173CCB40746CD0641B"
    })
  }))

  it('should exist both branches on each node', () => co(function*() {
    yield s1.expect('/blockchain/branches', (res) => {
      assert.equal(res.blocks.length, 2)
      assert.equal(res.blocks[0].number, 3)
      assert.equal(res.blocks[0].hash, '2C3555F4009461C81F7209EAAD7DA831D8451708D06BB1173CCB40746CD0641B')
      assert.equal(res.blocks[1].number, 3)
      assert.equal(res.blocks[1].hash, '74AB356F0E6CD9AA6F752E58FFCD65D5F8C95CDAA93576A40457CC3598C4E3D1')
    })
    yield s2.expect('/blockchain/branches', (res) => {
      assert.equal(res.blocks.length, 2)
      assert.equal(res.blocks[0].number, 3)
      assert.equal(res.blocks[0].hash, '74AB356F0E6CD9AA6F752E58FFCD65D5F8C95CDAA93576A40457CC3598C4E3D1')
      assert.equal(res.blocks[1].number, 3)
      assert.equal(res.blocks[1].hash, '2C3555F4009461C81F7209EAAD7DA831D8451708D06BB1173CCB40746CD0641B')
    })
  }))

  let b4a, b5a, b6a, b7a, b8a

  it('should be able to grow S1\'s blockchain', () => co(function*() {
    b4a = yield s1.commit({time: now + 44})
    b5a = yield s1.commit({time: now + 55})
    b6a = yield s1.commit({time: now + 66})
    b7a = yield s1.commit({time: now + 77})
    b8a = yield s1.commit({time: now + 88})
    yield s1.waitToHaveBlock(8)
  }))

  it('should refuse known fork blocks', () => co(function*() {
    yield s1.sharePeeringWith(s2)
    yield s2.sharePeeringWith(s1)
    yield s2.writeBlock(b4a)
    const b3c = yield s3.commit({ time: now + 33 })
    yield new Promise((res, rej) => {
      const event = CommonConstants.DocumentError
      s2.on(event, (e) => {
        try {
          assert.equal(e, 'Block already known')
          res()
        } catch (e) {
          rej(e)
        }
      })
      // Trigger the third-party fork block writing
      s2.writeBlock(b3c)
    })
  }))

  it('should be able to make one fork grow enough to make one node switch', () => co(function*() {
    yield s2.writeBlock(b5a)
    yield s2.writeBlock(b6a)
    yield s2.writeBlock(b7a)
    yield s2.writeBlock(b8a)
    yield s2.waitToHaveBlock(8)
    yield s2.waitForkResolution(8)
  }))

  it('should exist a same current block on each node', () => co(function*() {
    yield s1.expectJSON('/blockchain/current', {
      number: 8,
      hash: "B8D2AA2A5556F7A2837FB4B881FCF50595F855D0BF8F71C0B432E27216BBA40B"
    })
    yield s2.expectJSON('/blockchain/current', {
      number: 8,
      hash: "B8D2AA2A5556F7A2837FB4B881FCF50595F855D0BF8F71C0B432E27216BBA40B"
    })
  }))

  it('should exist 2 branches on each node', () => co(function*() {
    yield s1.expect('/blockchain/branches', (res) => {
      assert.equal(res.blocks.length, 3)
      assert.equal(res.blocks[0].number, 3)
      assert.equal(res.blocks[0].hash, '9A0FA1F0899124444ADC5B2C0AB66AC5B4303A0D851BED2E7382BB57E10AA2C5')
      assert.equal(res.blocks[1].number, 3)
      assert.equal(res.blocks[1].hash, '2C3555F4009461C81F7209EAAD7DA831D8451708D06BB1173CCB40746CD0641B') // This is s2 fork!
      assert.equal(res.blocks[2].number, 8)
      assert.equal(res.blocks[2].hash, 'B8D2AA2A5556F7A2837FB4B881FCF50595F855D0BF8F71C0B432E27216BBA40B')
    })
    yield s2.expect('/blockchain/branches', (res) => {
      assert.equal(res.blocks.length, 3)
      assert.equal(res.blocks[0].number, 3)
      assert.equal(res.blocks[0].hash, '9A0FA1F0899124444ADC5B2C0AB66AC5B4303A0D851BED2E7382BB57E10AA2C5')
      assert.equal(res.blocks[1].number, 3)
      assert.equal(res.blocks[1].hash, '2C3555F4009461C81F7209EAAD7DA831D8451708D06BB1173CCB40746CD0641B') // This is s2 fork!
      assert.equal(res.blocks[2].number, 8)
      assert.equal(res.blocks[2].hash, 'B8D2AA2A5556F7A2837FB4B881FCF50595F855D0BF8F71C0B432E27216BBA40B')
    })
  }))
});
