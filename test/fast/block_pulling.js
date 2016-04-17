"use strict";
var should = require('should');
var co = require('co');
var Q = require('q');
var pulling = require('../../app/lib/pulling');
var constants = require("../../app/lib/constants.js");

let commonConf = {
  avgGenTime: constants.BRANCHES.SWITCH_ON_BRANCH_AHEAD_BY_X_MINUTES * 60,
  forksize: 100
};

describe('Pulling blocks', () => {

  it('from genesis with good sidechain should work', pullinTest({
    blockchain: [
      newBlock(0, 'A')
    ],
    sidechains: [
      [
        newBlock(0, 'A'),
        newBlock(1, 'A')
      ]
    ],
    expectHash: 'A1'
  }));

  it('from genesis with fork sidechain should not work', pullinTest({
    blockchain: [
      newBlock(0, 'A')
    ],
    sidechains: [
      [
        newBlock(0, 'B'),
        newBlock(1, 'B')
      ]
    ],
    expectHash: 'A0'
  }));

  it('from genesis with multiple good sidechains should work', pullinTest({
    blockchain: [
      newBlock(0, 'A')
    ],
    sidechains: [
      [
        newBlock(0, 'A'),
        newBlock(1, 'A'),
        newBlock(2, 'A')
      ],
      [
        newBlock(0, 'A'),
        newBlock(1, 'A')
      ],
      [
        newBlock(0, 'A'),
        newBlock(1, 'A'),
        newBlock(2, 'A'),
        newBlock(3, 'A')
      ],
      [
        newBlock(0, 'A'),
        newBlock(1, 'A')
      ]
    ],
    expectHash: 'A3'
  }));

  it('sync with a single fork', pullinTest({
    blockchain: [
      newBlock(0, 'A'),
      newBlock(1, 'A'),
      newBlock(2, 'A'),
      newBlock(3, 'A')
    ],
    sidechains: [
      [
        newBlock(0, 'A'),
        newBlock(1, 'A'),
        newBlock(2, 'B'),
        newBlock(3, 'B'),
        newBlock(4, 'B'),
        newBlock(5, 'B')
      ]
    ],
    expectHash: 'B5'
  }));
});

function newBlock(number, branch, rootBranch) {
  let previousNumber = number - 1;
  let previousBranch = rootBranch || branch;
  let previousHash = previousNumber >= 0 ? previousBranch + previousNumber : '';
  return {
    number: number,
    medianTime: number * constants.BRANCHES.SWITCH_ON_BRANCH_AHEAD_BY_X_MINUTES * 60,
    hash: branch + number,
    previousHash: previousHash
  };
}

function pullinTest(testConfiguration) {
  return () => co(function *() {
    let blockchain = testConfiguration.blockchain;
    let sidechains = testConfiguration.sidechains;
    let dao = mockDao(blockchain, sidechains);
    (yield dao.localCurrent()).should.have.property('number').equal(blockchain[blockchain.length - 1].number);
    yield pulling(commonConf, dao);
    let localCurrent = yield dao.localCurrent();
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
    isMemberPeer: () => Q(true),
    // Not required in this test
    // TODO: make a real algorithm like binary tree search
    findCommonRoot: (fork, forksize) => Q(blockchain[1]),
    downloadBlocks: (bc, fromNumber, count) => Q(bc.slice(fromNumber, fromNumber + count)),
    applyBranch: (blocks) => {
      blockchain = blockchain.concat(blocks);
      return Q(true);
    }
  };
}
