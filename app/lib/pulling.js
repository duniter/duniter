"use strict";

var co = require('co');
var _ = require('underscore');
var constant = require('./constants');
var logger = require('./logger')('pulling');

module.exports = (conf, dao) => co(function *() {

  let forks = [];
  let localCurrent = yield dao.localCurrent();
  let peers = yield dao.remoteBlockchains();
  // Try to get new legit blocks for local blockchain
  for (let i = 0, len = peers.length; i < len; i++) {
    let peer = peers[i];
    let remoteNext = yield dao.getRemoteBlock(peer, localCurrent.number + 1);
    if (remoteNext) {
      let isFork = !(remoteNext.previousHash == localCurrent.hash && remoteNext.number == localCurrent.number + 1);
      if (!isFork) {
        let appliedSuccessfully;
        do {
          yield dao.applyMainBranch(remoteNext);
          localCurrent = yield dao.localCurrent();
          appliedSuccessfully = localCurrent.number == remoteNext.number && localCurrent.hash == remoteNext.hash;
          remoteNext = yield dao.getRemoteBlock(peer, localCurrent.number + 1);
        } while (appliedSuccessfully && remoteNext);
      } else {
        let remoteCurrent = yield dao.remoteCurrent(peer);
        forks.push({
          peer: peer,
          block: remoteNext,
          current: remoteCurrent
        });
      }
    }
  }
  // Filter forks: do not include mirror peers (non-member peers)
  let memberForks = [];
  for (let i = 0, len = forks.length; i < len; i++) {
    let fork = forks[i];
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
    return blockDistance >= constant.BRANCHES.SWITCH_ON_BRANCH_AHEAD_BY_X_MINUTES
      && timeDistance >= constant.BRANCHES.SWITCH_ON_BRANCH_AHEAD_BY_X_MINUTES;
  });
  // Remove any previous fork block
  yield dao.removeForks();
  // Find the common root block
  let j = 0, successFork = false;
  do {
    let fork = memberForks[j];
    let commonRootBlock = yield dao.findCommonRoot(fork, conf.forksize);
    if (commonRootBlock) {
      let blocksToApply = yield dao.downloadBlocks(commonRootBlock.number, conf.forksize);
      successFork = yield dao.applyBranch(blocksToApply);
    } else {
      logger.debug('No common root block with peer %s', fork.peer.pubkey.substr(0, 6));
    }
    j++;
  } while (!successFork && j < memberForks.length);
  return dao.localCurrent();
});

function compare(f1, f2, field) {
  if (f1[field] > f2[field]) {
    return 1;
  }
  if (f1[field] < f2[field]) {
    return -1;
  }
  return 0;
}
