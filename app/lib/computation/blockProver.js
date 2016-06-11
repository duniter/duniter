"use strict";
var async           = require('async');
var co              = require('co');
var Q               = require('q');
var constants       = require('../constants');
var base58          = require('../crypto/base58');
var childProcess    = require('child_process');
var path            = require('path');
var Block           = require('../entity/block');

module.exports = () => new BlockGenerator();

function BlockGenerator() {

  var conf, dal, pair, logger;

  this.setConfDAL = (newConf, newDAL, newPair) => {
    dal = newDAL;
    conf = newConf;
    pair = newPair;
    logger = require('../logger')(dal.profile);
  };

  var cancels = [];

  var debug = process.execArgv.toString().indexOf('--debug') !== -1;
  if(debug) {
    //Set an unused port number.
    process.execArgv = [];
  }
  var powWorker;

  var powFifo = async.queue(function (task, callback) {
    task(callback);
  }, 1);

  // Callback used to start again computation of next PoW
  var computeNextCallback = null;

  // Flag indicating the PoW has begun
  var computing = false;

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
    var timeoutToClear = setTimeout(function() {
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

  this.prove = function (block, sigFunc, difficulty, done, forcedTime) {

    var remainder = difficulty % 16;
    var nbZeros = (difficulty - remainder) / 16;
    var highMark = constants.PROOF_OF_WORK.UPPER_BOUND[remainder];

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
        var theBlock = (powBlock && new Block(powBlock)) || null;
        resolve(theBlock);
        done && done(null, theBlock);
      });

      powWorker.setOnError((err) => {
        reject(err);
      });

      block.nonce = 0;
      powWorker.powProcess.send({ conf: conf, block: block, zeros: nbZeros, highMark: highMark, forcedTime: forcedTime,
        pair: {
          secretKeyEnc: base58.encode(pair.secretKey)
        }
      });
      logger.info('Generating proof-of-work with %s leading zeros followed by [0-' + highMark + ']... (CPU usage set to %s%)', nbZeros, (conf.cpu * 100).toFixed(0));
    });
  };

  function Worker() {

    var stopped = true;
    var that = this;
    var onPoWFound = function() { throw 'Proof-of-work found, but no listener is attached.'; };
    var onPoWError = function() { throw 'Proof-of-work error, but no listener is attached.'; };
    that.powProcess = childProcess.fork(path.join(__dirname, '../proof.js'));
    var start = null;
    var speedMesured = false;

    that.powProcess.on('message', function(msg) {
      var block = msg.block;
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
        var end = new Date();
        var duration = (end.getTime() - start.getTime());
        var testsPerSecond = (1000 / duration * msg.testsCount).toFixed(2);
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
        that.powProcess.send({ conf: conf, block: block, zeros: msg.nbZeros, pair: {
          secretKeyEnc: base58.encode(pair.secretKey)
        }
        });
      } else if (!stopped) {

        if (!msg.found) {
          var pow = msg.pow;
          for (let i = 5; i >= 3; i--) {
            var lowPowRegexp = new RegExp('^0{' + (i) + '}[^0]');
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
          var cancelConfirm = cancels.shift();
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
