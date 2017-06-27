"use strict";

const co = require('co');
const querablep = require('querablep');
const common = require('duniter-common');
const constants = require('./constants');
const blockProver = require('./blockProver');
const blockGenerator = require('./blockGenerator');

module.exports = (server) => new PermanentProver(server);

function PermanentProver(server) {

  const dos2unix = common.dos2unix;
  const parsers = common.parsers;
  const logger = server.logger;
  const conf = server.conf;
  const prover = this.prover = blockProver(server);
  const generator = blockGenerator(server, prover);
  const that = this;

  let blockchainChangedResolver = null,
      promiseOfWaitingBetween2BlocksOfOurs = null,
      lastComputedBlock = null;

  // Promises triggering the prooving lopp
  let resolveContinuePromise = null;
  let continuePromise = new Promise((resolve) => resolveContinuePromise = resolve);

  let pullingResolveCallback = null;
  let timeoutPullingCallback = null, timeoutPulling;
  let pullingFinishedPromise = querablep(Promise.resolve());

  this.allowedToStart = () => {
    resolveContinuePromise(true);
  };

  // When we detected a pulling, we stop the PoW loop
  this.pullingDetected = () => {
    if (pullingFinishedPromise.isResolved()) {
      pullingFinishedPromise = querablep(Promise.race([
        // We wait for end of pulling signal
        new Promise((res) => pullingResolveCallback = res),
        // Security: if the end of pulling signal is not emitted after some, we automatically trigger it
        new Promise((res) => timeoutPullingCallback = () => {
          logger.warn('Pulling not finished after %s ms, continue PoW', constants.PULLING_MAX_DURATION);
          res();
        })
      ]));
    }
    // Delay the triggering of pulling timeout
    if (timeoutPulling) {
      clearTimeout(timeoutPulling);
    }
    timeoutPulling = setTimeout(timeoutPullingCallback, constants.PULLING_MAX_DURATION);
  };

  this.pullingFinished = () => pullingResolveCallback && pullingResolveCallback();

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
          const theConf = server.conf;
          if (!selfPubkey) {
            throw 'No self pubkey found.';
          }
          let current;
          const isMember = yield dal.isMember(selfPubkey);
          if (!isMember) {
            throw 'Local node is not a member. Waiting to be a member before computing a block.';
          }
          current = yield dal.getCurrentBlockOrNull();
          if (!current) {
            throw 'Waiting for a root block before computing new blocks';
          }
          const trial = yield server.getBcContext().getIssuerPersonalizedDifficulty(selfPubkey);
          checkTrialIsNotTooHigh(trial, current, selfPubkey);
          const lastIssuedByUs = current.issuer == selfPubkey;
          if (pullingFinishedPromise && !pullingFinishedPromise.isFulfilled()) {
            logger.warn('Waiting for the end of pulling...');
            yield pullingFinishedPromise;
            logger.warn('Pulling done. Continue proof-of-work loop.');
          }
          if (lastIssuedByUs && !promiseOfWaitingBetween2BlocksOfOurs) {
            promiseOfWaitingBetween2BlocksOfOurs = new Promise((resolve) => setTimeout(resolve, theConf.powDelay));
            logger.warn('Waiting ' + theConf.powDelay + 'ms before starting to compute next block...');
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
          yield Promise.race([

            // We still listen at eventual blockchain change
            co(function*() {
              // If the blockchain changes
              yield new Promise((resolve) => blockchainChangedResolver = resolve);
              // Then cancel the generation
              yield prover.cancel();
            }),

            // The generation
            co(function*() {
              try {
                const current = yield server.dal.getCurrentBlockOrNull();
                const selfPubkey = server.keyPair.publicKey;
                const trial2 = yield server.getBcContext().getIssuerPersonalizedDifficulty(selfPubkey);
                checkTrialIsNotTooHigh(trial2, current, selfPubkey);
                lastComputedBlock = yield generator.makeNextBlock(null, trial2);
                try {
                  const obj = parsers.parseBlock.syncWrite(dos2unix(lastComputedBlock.getRawSigned()));
                  yield server.singleWritePromise(obj);
                } catch (err) {
                  logger.warn('Proof-of-work self-submission: %s', err.message || err);
                }
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
            }, conf.powSecurityRetryDelay))
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
    if (server && (!gottenBlock || !lastComputedBlock || gottenBlock.hash !== lastComputedBlock.hash)) {
      // Cancel any processing proof
      yield prover.cancel(gottenBlock);
      // If we were waiting, stop it and process the continuous generation
      blockchainChangedResolver && blockchainChangedResolver();
    }
  });

  this.stopEveryting = () => co(function*() {
    // First: avoid continuing the main loop
    continuePromise = new Promise((resolve) => resolveContinuePromise = resolve);
    // Second: stop any started proof
    yield prover.cancel();
    // If we were waiting, stop it and process the continuous generation
    blockchainChangedResolver && blockchainChangedResolver();
  });

  function checkTrialIsNotTooHigh(trial, current, selfPubkey) {
    if (trial > (current.powMin + conf.powMaxHandicap)) {
      logger.debug('Trial = %s, powMin = %s, pubkey = %s', trial, current.powMin, selfPubkey.slice(0, 6));
      throw 'Too high difficulty: waiting for other members to write next block';
    }
  }
}

