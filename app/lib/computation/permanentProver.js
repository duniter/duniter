"use strict";

const co        = require('co');
const constants = require('../constants');
const rules     = require('../rules');
const parsers   = require('../streams/parsers');

module.exports = (server) => new PermanentProver(server);

function PermanentProver(server) {

  const logger = require('../logger')('permprover');
  const that = this;

  let onBlockCallback = null,
      blockchainChangedResolver = null,
      powPromise = null,
      promiseOfWaitingBetween2BlocksOfOurs = null,
      lastComputedBlock = null;

  // Promises triggering the prooving lopp
  let resolveContinuePromise = null;
  let continuePromise = new Promise((resolve) => resolveContinuePromise = resolve);

  this.isPoWWaiting = () => !powPromise;

  this.allowedToStart = () => resolveContinuePromise(true);

  this.loops = 0;

  /******************
   * Main proof loop
   *****************/
  co(function*() {
    while (yield continuePromise) {
      try {
        const waitingRaces = [];

        // By default, we do not make a new proof
        let doProof = false;

        try {
          const selfPubkey = server.keyPair.publicKey;
          const dal = server.dal;
          const conf = server.conf;
          if (!conf.participate) {
            throw 'This node is configured for not participating to compute blocks, but this message is showing up. Weird.';
          }
          if (!selfPubkey) {
            throw 'No self pubkey found.';
          }
          let block, current;
          const isMember = yield dal.isMember(selfPubkey);
          if (!isMember) {
            throw 'Local node is not a member. Waiting to be a member before computing a block.';
          }
          current = yield dal.getCurrentBlockOrNull();
          if (!current) {
            throw 'Waiting for a root block before computing new blocks';
          }
          const version = current ? current.version : constants.BLOCK_GENERATED_VERSION;
          const trial = yield rules.HELPERS.getTrialLevel(version, selfPubkey, conf, dal);
          if (trial > (current.powMin + constants.POW_MAXIMUM_ACCEPTABLE_HANDICAP)) {
            logger.debug('Trial = %s, powMin = %s, pubkey = %s', trial, current.powMin, selfPubkey.slice(0, 6));
            throw 'Too high difficulty: waiting for other members to write next block';
          }
          const lastIssuedByUs = current.issuer == selfPubkey;
          const pullingPromise = server.PeeringService.pullingPromise();
          if (pullingPromise && !pullingPromise.isFulfilled()) {
            logger.warn('Waiting for the end of pulling...');
            yield pullingPromise;
            logger.warn('Pulling done. Continue proof-of-work loop.');
          }
          if (lastIssuedByUs && !promiseOfWaitingBetween2BlocksOfOurs) {
            promiseOfWaitingBetween2BlocksOfOurs = new Promise((resolve) => setTimeout(resolve, conf.powDelay));
            logger.warn('Waiting ' + conf.powDelay + 'ms before starting to compute next block...');
          } else {
            // We have waited enough
            promiseOfWaitingBetween2BlocksOfOurs = null;
            // But under some conditions, we can make one
            doProof = true;
          }
        } catch (e) {
          logger.warn(e);
        }

        if (doProof) {

          /*******************
           * COMPUTING A BLOCK
           ******************/
          if (!onBlockCallback) {
            throw Error('No callback has been provided to handle newly found proofs');
          }

          yield Promise.race([

            // We still listen at eventual blockchain change
            co(function*() {
              // If the blockchain changes
              yield new Promise((resolve) => blockchainChangedResolver = resolve);
              // Then cancel the generation
              yield server.BlockchainService.prover.cancel();
            }),

            // The generation
            co(function*() {
              try {
                const block2 = yield server.BlockchainService.generateNext();
                const trial2 = yield rules.HELPERS.getTrialLevel(block2.version, server.keyPair.publicKey, server.conf, server.dal);
                lastComputedBlock = yield server.BlockchainService.makeNextBlock(block2, trial2);
                yield onBlockCallback(lastComputedBlock); 
              } catch (e) {
                logger.warn('The proof-of-work generation was canceled: %s', (e && e.message) || e || 'unkonwn reason');
              }
            })
          ]);
        } else {

          /*******************
           * OR WAITING PHASE
           ******************/
          if (promiseOfWaitingBetween2BlocksOfOurs) {
            waitingRaces.push(promiseOfWaitingBetween2BlocksOfOurs);
          }

          let raceDone = false;

          yield Promise.race(waitingRaces.concat([

            // The blockchain has changed! We or someone else found a proof, we must make a gnu one
            new Promise((resolve) => blockchainChangedResolver = () => {
              logger.warn('Blockchain changed!');
              resolve();
            }),

            // Security: if nothing happens for a while, trigger the whole process again
            new Promise((resolve) => setTimeout(() => {
              if (!raceDone) {
                logger.warn('Security trigger: proof-of-work process seems stuck');
                resolve();
              }
            }, constants.POW_SECURITY_RETRY_DELAY))
          ]));

          raceDone = true;
        }
      } catch (e) {
        logger.warn(e);
      }

      that.loops++;
      // Informative variable
      logger.trace('PoW loops = %s', that.loops);
    }
  });

  this.blockchainChanged = (gottenBlock) => co(function*() {
    if (!gottenBlock || !lastComputedBlock || gottenBlock.hash !== lastComputedBlock.hash) {
      // Cancel any processing proof
      yield server.BlockchainService.prover.cancel(gottenBlock);
      // If we were waiting, stop it and process the continuous generation
      blockchainChangedResolver && blockchainChangedResolver();
    }
  });

  this.stopEveryting = () => co(function*() {
    // First: avoid continuing the main loop
    continuePromise = new Promise((resolve) => resolveContinuePromise = resolve);
    // Second: stop any started proof
    yield server.BlockchainService.prover.cancel();
    // If we were waiting, stop it and process the continuous generation
    blockchainChangedResolver && blockchainChangedResolver();
  });

  this.onBlockComputed = (callback) => onBlockCallback = callback;
}
