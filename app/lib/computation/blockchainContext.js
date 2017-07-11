"use strict";
const _               = require('underscore');
const co              = require('co');
const indexer         = require('../indexer');
const constants       = require('../constants');
const Block           = require('../entity/block');

module.exports = () => { return new BlockchainContext() };

function BlockchainContext() {

  const that = this;
  let conf, dal, logger, blockchain, quickSynchronizer

  /**
   * The virtual next HEAD. Computed each time a new block is added, because a lot of HEAD variables are deterministic
   * and can be computed one, just after a block is added for later controls.
   */
  let vHEAD;

  /**
   * The currently written HEAD, aka. HEAD_1 relatively to incoming HEAD.
   */
  let vHEAD_1;

  let HEADrefreshed = Promise.resolve();

  /**
   * Refresh the virtual HEAD value for determined variables of the next coming block, avoiding to recompute them
   * each time a new block arrives to check if the values are correct. We can know and store them early on, in vHEAD.
   */
  function refreshHead() {
    HEADrefreshed = co(function*() {
      vHEAD_1 = yield dal.head(1);
      // We suppose next block will have same version #, and no particular data in the block (empty index)
      let block;
      // But if no HEAD_1 exist, we must initialize a block with default values
      if (!vHEAD_1) {
        block = {
          version: constants.BLOCK_GENERATED_VERSION,
          time: Math.round(Date.now() / 1000),
          powMin: conf.powMin || 0,
          powZeros: 0,
          powRemainder: 0,
          avgBlockSize: 0
        };
      } else {
        block = { version: vHEAD_1.version };
      }
      vHEAD = yield indexer.completeGlobalScope(Block.statics.fromJSON(block), conf, [], dal);
    });
    return HEADrefreshed;
  }

  /**
   * Gets a copy of vHEAD, extended with some extra properties.
   * @param props The extra properties to add.
   */
  this.getvHeadCopy = (props) => co(function*() {
    if (!vHEAD) {
      yield refreshHead();
    }
    const copy = {};
    const keys = Object.keys(vHEAD);
    for (const k of keys) {
      copy[k] = vHEAD[k];
    }
    _.extend(copy, props);
    return copy;
  });

  /**
   * Get currently written HEAD.
   */
  this.getvHEAD_1 = () => co(function*() {
    if (!vHEAD) {
      yield refreshHead();
    }
    return vHEAD_1;
  });

  /**
   * Utility method: gives the personalized difficulty level of a given issuer for next block.
   * @param issuer The issuer we want to get the difficulty level.
   */
  this.getIssuerPersonalizedDifficulty = (issuer) => co(function *() {
    const local_vHEAD = yield that.getvHeadCopy({ issuer });
    yield indexer.preparePersonalizedPoW(local_vHEAD, vHEAD_1, dal.range, conf);
    return local_vHEAD.issuerDiff;
  });

  this.setConfDAL = (newConf, newDAL, theBlockchain, theQuickSynchronizer) => {
    dal = newDAL;
    conf = newConf;
    blockchain = theBlockchain
    quickSynchronizer = theQuickSynchronizer
    logger = require('../logger')(dal.profile);
  };

  this.checkBlock = (block, withPoWAndSignature) => blockchain.checkBlock(block, withPoWAndSignature, conf, dal)

  this.addBlock = (obj, index, HEAD) => co(function*() {
    const block = yield blockchain.pushBlock(obj, index, HEAD, conf, dal, logger)
    vHEAD_1 = vHEAD = HEADrefreshed = null
    return block
  })

  this.addSideBlock = (obj) => blockchain.pushSideBlock(obj, dal, logger)

  this.revertCurrentBlock = () => co(function *() {
    const head_1 = yield dal.bindexDAL.head(1);
    logger.debug('Reverting block #%s...', head_1.number);
    const res = yield blockchain.revertBlock(head_1.number, head_1.hash, dal)
    logger.debug('Reverted block #%s', head_1.number);
    // Invalidates the head, since it has changed.
    yield refreshHead();
    return res;
  });

  this.applyNextAvailableFork = () => co(function *() {
    const current = yield that.current();
    logger.debug('Find next potential block #%s...', current.number + 1);
    const forks = yield dal.getForkBlocksFollowing(current);
    if (!forks.length) {
      throw constants.ERRORS.NO_POTENTIAL_FORK_AS_NEXT;
    }
    const block = forks[0];
    const { index, HEAD } = yield that.checkBlock(block, constants.WITH_SIGNATURES_AND_POW);
    yield that.addBlock(block, index, HEAD);
    logger.debug('Applied block #%s', block.number);
  });

  this.current = () => dal.getCurrentBlockOrNull();

  this.checkHaveEnoughLinks = (target, newLinks) => co(function*() {
    const links = yield dal.getValidLinksTo(target);
    let count = links.length;
    if (newLinks[target] && newLinks[target].length)
      count += newLinks[target].length;
    if (count < conf.sigQty)
      throw 'Key ' + target + ' does not have enough links (' + count + '/' + conf.sigQty + ')';
  });

  this.quickApplyBlocks = (blocks, to) => quickSynchronizer.quickApplyBlocks(blocks, to)
}
