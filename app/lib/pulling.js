"use strict";

const co = require('co');
const _ = require('underscore');
const constant = require('./constants');
const logger = require('./logger')('pulling');

module.exports = {

  abstractDao: (obj) => {

    let dao = Object.create(obj);

    /**
     * Sugar function. Apply a bunch of blocks instead of one.
     * @param blocks
     */
    if (!dao.applyBranch) {
      dao.applyBranch = (blocks) => co(function *() {
        for (const block of blocks) {
          yield dao.applyMainBranch(block);
        }
        return true;
      });
    }

    /**
     * Binary search algorithm to find the common root block between a local and a remote blockchain.
     * @param fork An object containing a peer, its current block and top fork block
     * @param forksize The maximum length we can look at to find common root block.
     * @returns {*|Promise}
     */
    dao.findCommonRoot = (fork, forksize) => co(function *() {
      let commonRoot = null;
      let localCurrent = yield dao.localCurrent();

      // We look between the top block that is known as fork ...
      let topBlock = fork.block;
      // ... and the bottom which is bounded by `forksize`
      let bottomBlock = yield dao.getRemoteBlock(fork.peer, Math.max(0, localCurrent.number - forksize));
      let lookBlock = bottomBlock;
      let localEquivalent = yield dao.getLocalBlock(bottomBlock.number);
      let isCommonBlock = lookBlock.hash == localEquivalent.hash;
      if (isCommonBlock) {

        // Then common root can be found between top and bottom. We process.
        let position, wrongRemotechain = false;
        do {

          isCommonBlock = lookBlock.hash == localEquivalent.hash;
          if (!isCommonBlock) {

            // Too high, look downward
            topBlock = lookBlock;
            position = middle(topBlock.number, bottomBlock.number);
          }
          else {
            let upperBlock = yield dao.getRemoteBlock(fork.peer, lookBlock.number + 1);
            let localUpper = yield dao.getLocalBlock(upperBlock.number);
            let isCommonUpper = upperBlock.hash == localUpper.hash;
            if (isCommonUpper) {

              // Too low, look upward
              bottomBlock = lookBlock;
              position = middle(topBlock.number, bottomBlock.number);
            }
            else {

              // Spotted!
              commonRoot = lookBlock;
            }
          }

          let noSpace = topBlock.number == bottomBlock.number + 1;
          if (!commonRoot && noSpace) {
            // Remote node have inconsistency blockchain, stop search
            wrongRemotechain = true;
          }

          if (!wrongRemotechain) {
            lookBlock = yield dao.getRemoteBlock(fork.peer, position);
            localEquivalent = yield dao.getLocalBlock(position);
          }
        } while (!commonRoot && !wrongRemotechain);
      }
      // Otherwise common root is unreachable

      return commonRoot;
    });
    return dao;
  },

  /**
   * Pull algorithm. Look at given peers' blockchain and try to pull blocks from it.
   * May lead local blockchain to fork.
   * @param conf The local node configuration
   * @param dao An abstract layer to retrieve peers data (blocks).
   */
  pull: (conf, dao) => co(function *() {
    let localCurrent = yield dao.localCurrent();
    const forks = [];

    const applyCoroutine = (peer, blocks) => co(function*() {
      let shortPubkey = peer.pubkey.substr(0, 6);
      if (blocks.length > 0) {
        logger.debug("Applying from " + blocks[0].number);
        let isFork = localCurrent
            && !(blocks[0].previousHash == localCurrent.hash
            && blocks[0].number == localCurrent.number + 1);
        if (!isFork) {
          logger.debug('Peer %s is on same blockchain', shortPubkey);
          yield dao.applyBranch(blocks);
          localCurrent = yield dao.localCurrent();
          const appliedSuccessfully = localCurrent.number == blocks[blocks.length - 1].number
                                  && localCurrent.hash == blocks[blocks.length - 1].hash;
          return appliedSuccessfully;
        } else {
          logger.debug('Peer %s has forked', shortPubkey);
          let remoteCurrent = yield dao.remoteCurrent(peer);
          forks.push({
            peer: peer,
            block: blocks[0],
            current: remoteCurrent
          });
          return false;
        }
      }
      return true;
    });

    const downloadCoroutine = (peer, number) => co(function*() {
      return yield dao.downloadBlocks(peer, number);
    });

    const downloadChuncks = (peer) => co(function*() {
      let blocksToApply = [];
      const currentBlock = yield dao.localCurrent();
      let currentChunckStart;
      if (currentBlock) {
        currentChunckStart = currentBlock.number + 1;
      } else {
        currentChunckStart = 0;
      }
      let res;
      do {
        logger.debug("dl starts from " + currentChunckStart);
        if (blocksToApply.length > 0)
          logger.debug("apply starts from " + blocksToApply[0].number);
        res = yield {
          applied: applyCoroutine(peer, blocksToApply),
          downloaded: downloadCoroutine(peer, currentChunckStart)
        };
        blocksToApply = res.downloaded;
        currentChunckStart += res.downloaded.length;
        if (!res.applied) {
          logger.info("Blocks were not applied.")
        }
      } while (res.downloaded.length > 0 && res.applied);
    });

    let peers = yield dao.remotePeers();
    // Try to get new legit blocks for local blockchain
    const downloadChuncksTasks = [];
    for (const peer of peers) {
      downloadChuncksTasks.push(downloadChuncks(peer));
    }
    yield downloadChuncksTasks;
    // Filter forks: do not include mirror peers (non-member peers)
    let memberForks = [];
    for (const fork of forks) {
      let isMember = yield dao.isMemberPeer(fork.peer);
      if (isMember) {
        memberForks.push(fork);
      }
    }
    memberForks = memberForks.sort((f1, f2) => {
      let result = compare(f1, f2, "number");
      if (result == 0) {
        result = compare(f1, f2, "medianTime");
      }
      return result;
    });
    let avgGenTime = conf.avgGenTime;
    memberForks = _.filter(memberForks, (fork) => {
      let blockDistance = (fork.current.number - localCurrent.number) * avgGenTime / 60;
      let timeDistance = (fork.current.medianTime - localCurrent.medianTime) / 60;
      logger.debug('Fork of %s has blockDistance %s ; timeDistance %s ; required is >= %s for both values to try to follow the fork', fork.peer.pubkey.substr(0, 6), parseFloat(blockDistance).toFixed(2), parseFloat(timeDistance).toFixed(2), constant.BRANCHES.SWITCH_ON_BRANCH_AHEAD_BY_X_MINUTES);
      return blockDistance >= constant.BRANCHES.SWITCH_ON_BRANCH_AHEAD_BY_X_MINUTES
        && timeDistance >= constant.BRANCHES.SWITCH_ON_BRANCH_AHEAD_BY_X_MINUTES;
    });
    // Remove any previous fork block
    yield dao.removeForks();
    // Find the common root block
    let j = 0, successFork = false;
    while (!successFork && j < memberForks.length) {
      let fork = memberForks[j];
      let commonRootBlock = yield dao.findCommonRoot(fork, conf.forksize);
      if (commonRootBlock) {
        let blocksToApply = yield dao.downloadBlocks(fork.peer, commonRootBlock.number + 1, conf.forksize);
        successFork = yield dao.applyBranch(blocksToApply);
      } else {
        logger.debug('No common root block with peer %s', fork.peer.pubkey.substr(0, 6));
      }
      j++;
    }
    return dao.localCurrent();
  })
};

function compare(f1, f2, field) {
  if (f1[field] > f2[field]) {
    return 1;
  }
  if (f1[field] < f2[field]) {
    return -1;
  }
  return 0;
}

function middle(top, bottom) {
  let difference = top - bottom;
  if (difference % 2 == 1) {
    // We look one step below to not forget any block
    difference++;
  }
  return bottom + (difference / 2);
}
