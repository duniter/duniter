"use strict";
var should = require('should');
var co = require('co');
var Q = require('q');
var pulling = require('../../app/lib/pulling');

let commonConf = {
  avgGenTime: 1
};

describe('Pulling blocks', () => {

  it('from genesis with good sidechain should work', pullinTest({
    blockchain: [
      { number: 0, medianTime: 0, hash: 'H0' }
    ],
    sidechains: [
      [
        { number: 0, medianTime: 0, hash: 'H0' },
        { number: 1, medianTime: 1, hash: 'H1', previousHash: 'H0' }
      ]
    ],
    expectNumber: 1,
    expectHash: 'H1'
  }));

  it('from genesis with fork sidechain should not work', pullinTest({
    blockchain: [
      { number: 0, medianTime: 0, hash: 'H0' }
    ],
    sidechains: [
      [
        { number: 0, medianTime: 0, hash: 'H0' },
        { number: 1, medianTime: 1, hash: 'H1', previousHash: 'H0bis' }
      ]
    ],
    expectNumber: 0,
    expectHash: 'H0'
  }));

  it('from genesis with multiple good sidechains should work', pullinTest({
    blockchain: [
      { number: 0, medianTime: 0, hash: 'H0' }
    ],
    sidechains: [
      [
        { number: 0, medianTime: 0, hash: 'H0' },
        { number: 1, medianTime: 1, hash: 'H1', previousHash: 'H0' },
        { number: 2, medianTime: 2, hash: 'H2', previousHash: 'H1' }
      ],
      [
        { number: 0, medianTime: 0, hash: 'H0' },
        { number: 1, medianTime: 1, hash: 'H1', previousHash: 'H0' }
      ],
      [
        { number: 0, medianTime: 0, hash: 'H0' },
        { number: 1, medianTime: 1, hash: 'H1', previousHash: 'H0' },
        { number: 2, medianTime: 2, hash: 'H2', previousHash: 'H1' },
        { number: 3, medianTime: 3, hash: 'H3', previousHash: 'H2' }
      ],
      [
        { number: 0, medianTime: 0, hash: 'H0' },
        { number: 1, medianTime: 1, hash: 'H1', previousHash: 'H0' }
      ]
    ],
    expectNumber: 3,
    expectHash: 'H3'
  }));
});

function pullinTest(testConfiguration) {
  return () => co(function *() {
    let blockchain = testConfiguration.blockchain;
    let sidechains = testConfiguration.sidechains;
    let dao = mockDao(blockchain, sidechains);
    (yield dao.localCurrent()).should.have.property('number').equal(blockchain[blockchain.length - 1].number);
    yield pulling(commonConf, dao);
    let localCurrent = yield dao.localCurrent();
    if (testConfiguration.expectNumber !== undefined && testConfiguration.expectNumber !== null) {
      localCurrent.should.have.property('number').equal(testConfiguration.expectNumber);
    }
    if (testConfiguration.expectHash !== undefined && testConfiguration.expectHash !== null) {
      localCurrent.should.have.property('hash').equal(testConfiguration.expectHash);
    }
    if (testConfiguration.expectFunc !== undefined && testConfiguration.expectFunc !== null) {
      testConfiguration.expectFunc(dao);
    }
  });
}

function mockDao(blockchain, sideChains) {
  return {
    // This simulates a real network access
    localCurrent: () => Q(blockchain[blockchain.length - 1]),
    remoteCurrent: (bc) => Q(bc[bc.length - 1]),
    remoteBlockchains: () => Q(sideChains),
    getRemoteBlock: (bc, number) => Q(bc[number] || null),
    applyMainBranch: (block) => Q(blockchain.push(block)),
    removeForks: () => Q(),
    isMemberPeer: () => Q(),
    // Not required in this test
    // TODO: make a real algorithm like binary tree search
    findCommonRoot: () => Q(blockchain[0]),
    downloadBlocks: () => Q(),
    applyBranch: () => Q(null)
  };
}
