"use strict";
var async = require('async');
var moment = require('moment');
var hashf = require('./ucp/hashf');
var rules = require('./rules');
var constants = require('./constants');
var dos2unix = require('./system/dos2unix');
var signature = require('./crypto/signature');
var rawer = require('./ucp/rawer');

var signatureFunc, lastSecret;

let speed = 1;
let A_SECOND = 1000;
let SAMPLES_PER_SECOND = 10;

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
  var cpu = conf.cpu || constants.DEFAULT_CPU;
  var highMark = stuff.highMark;
  async.waterfall([
    function(next) {
      if (signatureFunc && lastSecret == pair.secretKeyEnc) {
        next(null, signatureFunc);
      }
      else {
        lastSecret = pair.secretKeyEnc;
        signature.sync(pair, next);
      }
    },
    function(sigFunc, next) {
      signatureFunc = sigFunc;
      var pow = "", sig = "", raw = "";

      block.time = getBlockTime(block, conf, forcedTime);
      // Test CPU speed
      if ((nbZeros > 0 || highMark != '9A-F') && speed == 1) {
        speed = computeSpeed(block, sigFunc);
      }
      var testsPerSecond = speed;
      var testsPerRound = Math.max(Math.round(testsPerSecond * cpu), 1) / SAMPLES_PER_SECOND; // We make a sample every Xms
      process.send({ found: false, testsPerSecond: testsPerSecond, testsPerRound: testsPerRound * SAMPLES_PER_SECOND, nonce: block.nonce });
      // Really start now
      var testsCount = 0;
      if (nbZeros == 0) {
        block.nonce = 0;
        block.time = block.medianTime;
      }
      // Compute block's hash
      block.inner_hash = getBlockInnerHash(block);
      var found = false;
      async.whilst(
        function(){ return !found; },
        function (next) {
          async.waterfall([
            function(next) {
              // Prove
              var testStart = new Date();
              var i = 0;
              // Time is updated regularly during the proof
              block.time = getBlockTime(block, conf, forcedTime);
              block.inner_hash = getBlockInnerHash(block);
              while(!found && i < testsPerRound) {
                block.nonce++;
                raw = rawer.getBlockInnerHashAndNonce(block);
                sig = dos2unix(sigFunc(raw));
                pow = hash(raw + sig + '\n');
                //found = pow.match(powRegexp);
                let j = 0, charOK = true;
                while (j < nbZeros && charOK) {
                  charOK = pow[j] == '0';
                  j++;
                }
                if (charOK) {
                  found = pow[nbZeros].match(new RegExp('[0-' + highMark + ']'));
                }
                if (!found && nbZeros > 0 && j >= Math.max(1, nbZeros - 2)) {
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
              }, nbZeros == 0 ? 0 : Math.max(0, (A_SECOND / SAMPLES_PER_SECOND - durationMS))); // Max wait 1 second
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

function getBlockInnerHash(block) {
  let raw = rawer.getBlockInnerPart(block);
  return hash(raw);
}

function hash(str) {
  return hashf(str).toUpperCase();
}

function computeSpeed(block, sigFunc) {
  var start = new Date();
  var raw = rawer.getBlockInnerHashAndNonce(block);
  for (var i = 0; i < constants.PROOF_OF_WORK.EVALUATION; i++) {
    // Signature
    var sig = dos2unix(sigFunc(raw));
    // Hash
    hash(raw + sig + '\n');
  }
  var duration = (new Date().getTime() - start.getTime());
  return Math.round(constants.PROOF_OF_WORK.EVALUATION * 1000 / duration);
}

function getBlockTime (block, conf, forcedTime) {
  var now = forcedTime || moment.utc().unix();
  var maxAcceleration = rules.HELPERS.maxAcceleration(conf);
  var timeoffset = block.number >= conf.medianTimeBlocks ? 0 : conf.rootoffset || 0;
  var medianTime = block.medianTime;
  var upperBound = block.number == 0 ? medianTime : Math.min(medianTime + maxAcceleration, now - timeoffset);
  return Math.max(medianTime, upperBound);
}
