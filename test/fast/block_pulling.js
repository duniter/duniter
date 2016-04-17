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

  it('sync with multiple forks', pullinTest({
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
      ],
      // This fork should not be followed because we switch only one time per pulling, and B5 is already OK
      [
        newBlock(0, 'A'),
        newBlock(1, 'A'),
        newBlock(2, 'B'),
        newBlock(3, 'B'),
        newBlock(4, 'B'),
        newBlock(5, 'B'),
        newBlock(6, 'B')
      ]
    ],
    expectHash: 'B5'
  }));

  it('sync with multiple forks, with one invalid', pullinTest({
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
        newBlock(2, 'C'),
        newBlock(3, 'C'),
        newBlock(4, 'C'),
        newBlock(5, 'C')
      ],
      // This fork should be followed because C will be marked as wrong
      [
        newBlock(0, 'A'),
        newBlock(1, 'A'),
        newBlock(2, 'B'),
        newBlock(3, 'B'),
        newBlock(4, 'B'),
        newBlock(5, 'B'),
        newBlock(6, 'B')
      ]
    ],
    expectHash: 'B6'
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

    // The blockchains we are testing against
    let blockchain = testConfiguration.blockchain;
    let sidechains = testConfiguration.sidechains;

    // The data access object simulating network access
    let dao = mockDao(blockchain, sidechains);

    // The very last block of a blockchain should have the good number
    (yield dao.localCurrent()).should.have.property('number').equal(blockchain[blockchain.length - 1].number);

    // And after we make a pulling...
    yield pulling(commonConf, dao);

    // We test the new local blockchain current block (it should have changed in case of successful pull)
    let localCurrent = yield dao.localCurrent();
    if (testConfiguration.expectHash !== undefined && testConfiguration.expectHash !== null) {
      localCurrent.should.have.property('hash').equal(testConfiguration.expectHash);
    }
    if (testConfiguration.expectFunc !== undefined && testConfiguration.expectFunc !== null) {
      testConfiguration.expectFunc(dao);
    }
  });
}

/**
 * Network mocker
 * @param blockchain
 * @param sideChains
 * @returns {{localCurrent: (function(): (*|Q.Promise<*>|Q.Promise<T>)), remoteCurrent: (function(): (*|Q.Promise<*>|Q.Promise<T>)), remotePeers: (function(): (*|Q.Promise<*>|Q.Promise<T>)), getRemoteBlock: (function(): (*|Q.Promise<*|null>|Q.Promise<T>)), applyMainBranch: (function(): (*|Q.Promise<Number|*|_Chain<*>>|Q.Promise<T>)), removeForks: (function(): (*|Q.Promise<T>)), isMemberPeer: (function(): (*|Q.Promise<boolean>|Q.Promise<T>)), findCommonRoot: (function(): (*|Promise)), downloadBlocks: (function(): (*|Q.Promise<Buffer|ArrayBuffer|Array.<any>|string|*|_Chain<any>>|Q.Promise<T>)), applyBranch: (function())}}
 */
function mockDao(blockchain, sideChains) {
  return {

    // Get the local blockchain current block
    localCurrent: () => Q(blockchain[blockchain.length - 1]),

    // Get the remote blockchain (bc) current block
    remoteCurrent: (bc) => Q(bc[bc.length - 1]),

    // Get the remote peers to be pulled
    remotePeers: () => Q(sideChains.map((sc, index) => {
      sc.pubkey = 'PUBK' + index;
      return sc;
    })),

    // Get block of given peer with given block number
    getRemoteBlock: (bc, number) => Q(bc[number] || null),

    // Simulate the adding of a single new block on local blockchain
    applyMainBranch: (block) => Q(blockchain.push(block)),

    // Clean the eventual fork blocks already registered in DB (since real fork mechanism uses them, so we want
    // every old fork block to be removed)
    removeForks: () => Q(),

    // Tells wether given peer is a member peer
    isMemberPeer: (peer) => Q(true),

    // TODO: make a real algorithm like binary tree search
    findCommonRoot: (fork, forksize) => co(function *() {
      // No common root for sidechain 'Cx'
      if (fork.current.hash.match(/^C/)) {
        return null;
      }
      return Q(blockchain[1]);
    }),

    // Simulates the downloading of blocks from a peer
    downloadBlocks: (bc, fromNumber, count) => Q(bc.slice(fromNumber, fromNumber + count)),

    // Simulate the adding of new blocks on local blockchain
    applyBranch: (blocks) => {
      blockchain = blockchain.concat(blocks);
      return Q(true);
    }
  };
}
