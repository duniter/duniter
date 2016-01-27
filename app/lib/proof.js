"use strict";
var async = require('async');
var sha1 = require('sha1');
var moment = require('moment');
var localValidator = require('./localValidator');
var constants = require('./constants');
var dos2unix = require('./dos2unix');
var signature = require('./signature');
var rawer = require('./rawer');

var signatureFunc;

process.on('uncaughtException', function (err) {
  console.error(err.stack || Error(err));
  process.send({ error: err });
});

process.on('message', function(stuff){
  var conf = stuff.conf;
  var block = stuff.block;
  var nbZeros = stuff.zeros;
  var pair = stuff.pair;
  var forcedTime = stuff.forcedTime;
  var cpu = conf.cpu || 1;
  var highMark = stuff.highMark;
  async.waterfall([
    function(next) {
      if (signatureFunc)
        next(null, signatureFunc);
      else
        signature.sync(pair, next);
    },
    function(sigFunc, next) {
      signatureFunc = sigFunc;
      var powRegexp = new RegExp('^0{' + nbZeros + '}' + '[0-' + highMark + ']');
      var lowPowRegexp = new RegExp('^0{' + (nbZeros) + '}[^0]');
      var verylowPowRegexp = new RegExp('^0{' + (nbZeros - 1) + '}[^0]');
      var pow = "", sig = "", raw = "";

      // Time must be = [medianTime; medianTime + minSpeed]
      block.time = getBlockTime(block, conf, forcedTime);
      // Test CPU speed
      var testsPerSecond = nbZeros == 0 && highMark == '9A-F' ? 1 : computeSpeed(block, sigFunc);
      var testsPerRound = Math.max(Math.round(testsPerSecond * cpu), 1);
      process.send({ found: false, testsPerSecond: testsPerSecond, testsPerRound: testsPerRound, nonce: block.nonce });
      // Really start now
      var testsCount = 0;
      if (nbZeros == 0) {
        block.nonce = 0;
        block.time = block.medianTime;
      }
      async.whilst(
        function(){ return !pow.match(powRegexp); },
        function (next) {
          async.waterfall([
            function(next) {
              // Prove
              var testStart = new Date();
              var found = false;
              var i = 0;
              block.time = getBlockTime(block, conf, forcedTime);
              while(!found && i < testsPerRound) {
                block.nonce++;
                raw = rawer.getBlockWithoutSignature(block);
                sig = dos2unix(sigFunc(raw));
                pow = hash(raw + sig + '\n');
                found = pow.match(powRegexp);
                if (!found && (pow.match(lowPowRegexp) || pow.match(verylowPowRegexp))) {
                  process.send({ found: false, pow: pow, block: block, nbZeros: nbZeros });
                }
                testsCount++;
                i++;
              }
              var end = new Date();
              var durationMS = (end.getTime() - testStart.getTime());
              // Run NEXT only after a delay
              setTimeout(function () {
                next();
              }, nbZeros == 0 ? 0 : Math.max(0, (1000-durationMS))); // Max wait 1 second
            },
            function(next) {
              process.send({ found: false, pow: pow, block: block, nbZeros: nbZeros });
              next();
            }
          ], next);
        }, function () {
          next(pow, sig, block, testsCount);
        });
    }
  ], function(pow, sig, block, testsCount) {
    block.signature = sig;
    process.send({
      found: true,
      block: block,
      testsCount: testsCount,
      pow: pow
    });
  });
});

function hash(str) {
  return sha1(str).toUpperCase();
}

function computeSpeed(block, sigFunc) {
  var start = new Date();
  var raw = rawer.getBlockWithoutSignature(block);
  for (var i = 0; i < constants.PROOF_OF_WORK.EVALUATION; i++) {
    // Signature
    var sig = dos2unix(sigFunc(raw));
    // Hash
    hash(raw + sig + '\n');
  }
  var duration = (new Date().getTime() - start.getTime());
  return Math.round(constants.PROOF_OF_WORK.EVALUATION*1000/duration);
}

function getBlockTime (block, conf, forcedTime) {
  var now = forcedTime || moment.utc().unix();
  var maxAcceleration = localValidator(conf).maxAcceleration();
  var timeoffset = block.number >= conf.medianTimeBlocks ? 0 : conf.rootoffset || 0;
  var medianTime = block.medianTime;
  var upperBound = block.number == 0 ? medianTime : Math.min(medianTime + maxAcceleration, now - timeoffset);
  return Math.max(medianTime, upperBound);
}
