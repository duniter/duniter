"use strict";
const async           = require('async');
const co              = require('co');
const Q               = require('q');
const constants       = require('../constants');
const base58          = require('../crypto/base58');
const childProcess    = require('child_process');
const path            = require('path');
const Block           = require('../entity/block');

module.exports = () => new BlockGenerator();

function BlockGenerator() {

  let conf, dal, pair, logger;

  this.setConfDAL = (newConf, newDAL, newPair) => {
    dal = newDAL;
    conf = newConf;
    pair = newPair;
    logger = require('../logger')(dal.profile);
  };

  const cancels = [];

  const debug = process.execArgv.toString().indexOf('--debug') !== -1;
  if(debug) {
    //Set an unused port number.
    process.execArgv = [];
  }
  let powWorker;

  const powFifo = async.queue(function (task, callback) {
    task(callback);
  }, 1);

  // Callback used to start again computation of next PoW
  let computeNextCallback = null;

  // Flag indicating the PoW has begun
  let computing = false;

  this.computing = () => computing = true;

  this.notComputing = () => computing = false;

  this.waitForContinue = () => Q.Promise(function(resolve){
    computeNextCallback = resolve;
  });

  this.cancel = () => {
    // If PoW computation process is waiting, trigger it
    if (computeNextCallback)
      computeNextCallback();
    if (conf.participate && !cancels.length && computing) {
      powFifo.push(function (taskDone) {
        cancels.push(taskDone);
      });
    }
  };

  this.waitBeforePoW = () => Q.Promise(function(resolve, reject){
    const timeoutToClear = setTimeout(function() {
      clearTimeout(timeoutToClear);
      computeNextCallback = null;
      resolve();
    }, (conf.powDelay) * 1000);
    // Offer the possibility to break waiting
    computeNextCallback = function() {
      clearTimeout(timeoutToClear);
      reject('Waiting canceled.');
    };
  });

  this.prove = function (block, difficulty, forcedTime) {

    const remainder = difficulty % 16;
    const nbZeros = (difficulty - remainder) / 16;
    const highMark = constants.PROOF_OF_WORK.UPPER_BOUND[remainder];

    return Q.Promise(function(resolve, reject){
      if (!powWorker) {
        powWorker = new Worker();
      }
      if (block.number == 0) {
        // On initial block, difficulty is the one given manually
        block.powMin = difficulty;
      }
      // Start
      powWorker.setOnPoW(function(err, powBlock) {
        const theBlock = (powBlock && new Block(powBlock)) || null;
        logger.info('FOUND proof-of-work with %s leading zeros followed by [0-' + highMark + ']!', nbZeros);
        resolve(theBlock);
      });

      powWorker.setOnError((err) => {
        reject(err);
      });

      block.nonce = 0;
      powWorker.powProcess.send({ conf: conf, block: block, zeros: nbZeros, highMark: highMark, forcedTime: forcedTime,
        pair: pair.json()
      });
      logger.info('Generating proof-of-work with %s leading zeros followed by [0-' + highMark + ']... (CPU usage set to %s%)', nbZeros, (conf.cpu * 100).toFixed(0));
    });
  };

  function Worker() {

    let stopped = true;
    const that = this;
    let onPoWFound = function() { throw 'Proof-of-work found, but no listener is attached.'; };
    let onPoWError = function() { throw 'Proof-of-work error, but no listener is attached.'; };
    that.powProcess = childProcess.fork(path.join(__dirname, '../proof.js'));
    let start = null;
    let speedMesured = false;

    that.powProcess.on('message', function(msg) {
      const block = msg.block;
      if (msg.error) {
        onPoWError(msg.error);
        stopped = true;
      }
      if (stopped) {
        // Started...
        start = new Date();
        stopped = false;
      }
      if (!stopped && msg.found) {
        const end = new Date();
        const duration = (end.getTime() - start.getTime());
        const testsPerSecond = (1000 / duration * msg.testsCount).toFixed(2);
        logger.info('Done: %s in %ss (%s tests, ~%s tests/s)', msg.pow, (duration / 1000).toFixed(2), msg.testsCount, testsPerSecond);
        stopped = true;
        start = null;
        block.hash = msg.pow;
        onPoWFound(null, block);
      } else if (!stopped && msg.testsPerRound) {
        logger.info('Mesured max speed is ~%s tests/s. Proof will try with ~%s tests/s.', msg.testsPerSecond, msg.testsPerRound);
        speedMesured = true;
      } else if (!stopped && msg.nonce > block.nonce + constants.PROOF_OF_WORK.RELEASE_MEMORY) {
        // Reset fork process (release memory)...
        logger.trace('Release mem... lastCount = %s, nonce = %s', block.nonce);
        block.nonce = msg.nonce;
        speedMesured = false;
        that.powProcess.kill();
        powWorker = new Worker();
        that.powProcess.send({ conf: conf, block: block, zeros: msg.nbZeros, pair: pair.json()});
      } else if (!stopped) {

        if (!msg.found) {
          const pow = msg.pow;
          for (let i = 5; i >= 3; i--) {
            const lowPowRegexp = new RegExp('^0{' + (i) + '}[^0]');
            if (pow.match(lowPowRegexp)) {
              logger.info('Matched %s zeros %s with Nonce = %s for block#%s', i, pow, msg.block.nonce, msg.block.number);
              break;
            }
          }
        }
        // Continue...
        //console.log('Already made: %s tests...', msg.nonce);
        // Look for incoming block
        if (speedMesured && cancels.length) {
          speedMesured = false;
          stopped = true;
          that.powProcess.kill();
          that.powProcess = null;
          powWorker = null;
          onPoWFound();
          logger.debug('Proof-of-work computation canceled.');
          start = null;
          const cancelConfirm = cancels.shift();
          cancelConfirm();
        }
      }
    });

    this.kill = function() {
      if (that.powProcess) {
        that.powProcess.kill();
        that.powProcess = null;
      }
    };

    this.setOnPoW = function(onPoW) {
      onPoWFound = onPoW;
    };

    this.setOnError = function(onError) {
      onPoWError = onError;
    };
  }
}
