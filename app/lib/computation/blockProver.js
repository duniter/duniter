"use strict";
const co              = require('co');
const Q               = require('q');
const constants       = require('../constants');
const base58          = require('../crypto/base58');
const childProcess    = require('child_process');
const path            = require('path');
const Block           = require('../entity/block');

module.exports = (server) => new BlockGenerator(server);

const CANCELED_BECAUSE_GIVEN = 'Proof-of-work computation canceled';

function BlockGenerator(notifier) {

  let conf, pair, logger, computing = false, askedStop = false;

  let workerPromise;

  function getWorker() {
    return (workerPromise || (workerPromise = co(function*() {
      return new Worker();
    })));
  }

  this.setConfDAL = (newConf, newDAL, newPair) => {
    conf = newConf;
    pair = newPair;
    logger = require('../logger')('prover');
  };

  const debug = process.execArgv.toString().indexOf('--debug') !== -1;
  if(debug) {
    //Set an unused port number.
    process.execArgv = [];
  }

  this.cancel = (gottenBlock) => co(function*() {
    if (computing && !askedStop) {
      askedStop = true;
      let worker = yield getWorker();
      let stopped = yield worker.stopPoW();
      askedStop = false;
      console.log('STOPPED!');
    }
  });

  this.prove = function (block, difficulty, forcedTime) {

    const remainder = difficulty % 16;
    const nbZeros = (difficulty - remainder) / 16;
    const highMark = constants.PROOF_OF_WORK.UPPER_BOUND[remainder];

    return co(function*() {

      let powWorker = yield getWorker();

      if (block.number == 0) {
        // On initial block, difficulty is the one given manually
        block.powMin = difficulty;
      }

      // Start
      powWorker.setOnAlmostPoW(function(pow, matches, block, found) {
        powEvent(found, pow);
        if (matches && matches[1].length >= constants.PROOF_OF_WORK.MINIMAL_TO_SHOW) {
          logger.info('Matched %s zeros %s with Nonce = %s for block#%s', matches[1].length, pow, block.nonce, block.number);
        }
      });

      block.nonce = 0;
      logger.info('Generating proof-of-work with %s leading zeros followed by [0-' + highMark + ']... (CPU usage set to %s%)', nbZeros, (conf.cpu * 100).toFixed(0));
      const start = Date.now();
      try {

        let result = yield powWorker.askNewProof({
          newPoW: { conf: conf, block: block, zeros: nbZeros, highMark: highMark, forcedTime: forcedTime,
            pair: pair.json()
          }
        });
        const proof = result.block;
        const testsCount = result.testsCount;
        const duration = (Date.now() - start);
        const testsPerSecond = (testsCount / (duration / 1000)).toFixed(2);
        logger.info('Done: %s in %ss (%s tests, ~%s tests/s)', proof.hash, (duration / 1000).toFixed(2), testsCount, testsPerSecond);
        logger.info('FOUND proof-of-work with %s leading zeros followed by [0-' + highMark + ']!', nbZeros);
        return new Block(proof);
      } catch (e) {
        if (e == CANCELED_BECAUSE_GIVEN) {
          logger.info('GIVEN proof-of-work with %s leading zeros followed by [0-' + highMark + ']!', nbZeros);
        }
        logger.warn(e);
        throw e;
      }
    });
  };

  function powEvent(found, hash) {
    notifier && notifier.push({ pow: { found, hash } });
  }

  function Worker() {

    const that = this;
    let onAlmostPoW = function() { throw 'Almost proof-of-work found, but no listener is attached.'; };
    let onPoWSuccess = function() { throw 'Proof-of-work success, but no listener is attached.'; };
    let onPoWError = function() { throw 'Proof-of-work error, but no listener is attached.'; };
    that.powProcess = childProcess.fork(path.join(__dirname, '../proof.js'));

    /**
     * Checks is the engine is ready for a new PoW
     */
    this.isReady = () => new Promise((resolve) => {
      that.powProcess.on('message', function(msg) {
        if (msg.powStatus) {
          // We look only at status messages, avoiding eventual PoW messages
          resolve(msg.powStatus == 'ready');
        }
      });
      that.powProcess.send({ command: 'ready' });
    });

    /**
     * Eventually stops the engine PoW if one was computing
     */
    this.stopPoW = () => new Promise((resolve) => {
      that.powProcess.on('message', function(msg) {
        if (msg.powStatus) {
          // We look only at status messages, avoiding eventual PoW messages
          resolve(msg.powStatus == 'ready' || msg.powStatus == 'stopped');
        }
      });
      that.powProcess.send({ command: 'stop' });
    });

    /**
     * Starts a new computation of PoW
     * @param stuff The necessary data for computing the PoW
     */
    this.askNewProof = (stuff) => new Promise((resolve, reject) => {
      return co(function*() {
        const ready = yield that.isReady();
        if (!ready) {
          throw 'PoW engine not ready';
        }

        computing = true;

        // Binds the engine to this promise
        onPoWSuccess = resolve;
        onPoWError = reject;

        // Starts the PoW
        that.powProcess.send(stuff);
      });
    });

    this.setOnAlmostPoW = function(onPoW) {
      onAlmostPoW = onPoW;
    };

    that.powProcess.on('message', function(message) {

      // A message about the PoW
      if (message.pow) {
        const msg = message.pow;
        const block = msg.block;
        if (msg.error) {
          onPoWError(msg.error);
        }
        else if (msg.found) {
          computing = false;
          block.hash = msg.pow;
          onAlmostPoW(block.hash, block.hash.match(/^(0{2,})[^0]/), block, msg.found);
          onPoWSuccess({ block: block, testsCount: msg.testsCount });
        } else {
          if (msg.canceled) {
            computing = false;
            onPoWError(CANCELED_BECAUSE_GIVEN);
          }
          else if (!msg.found) {
            const pow = msg.pow;
            const matches = pow.match(/^(0{2,})[^0]/);
            if (matches) {
              // We log only proof with at least 3 zeros
              onAlmostPoW(pow, matches, msg.block, msg.found);
            }
          }
        }
      }
    });
  }
}
