"use strict";
const co = require('co');
const async = require('async');
const moment = require('moment');
const hashf = require('./ucp/hashf');
const rules = require('./rules');
const constants = require('./constants');
const dos2unix = require('./system/dos2unix');
const keyring = require('./crypto/keyring');
const rawer = require('./ucp/rawer');

let signatureFunc, lastSecret;

let speed = 1;
let A_SECOND = 1000;
let SAMPLES_PER_SECOND = 10;

process.on('uncaughtException', (err) => {
  console.error(err.stack || Error(err));
  process.send({error: err});
});

process.on('message', (stuff) => co(function*() {
  const conf = stuff.conf;
  const block = stuff.block;
  const nbZeros = stuff.zeros;
  const pair = stuff.pair;
  const forcedTime = stuff.forcedTime;
  const cpu = conf.cpu || constants.DEFAULT_CPU;
  const highMark = stuff.highMark;
  let sigFunc = null;
  if (signatureFunc && lastSecret == pair.sec) {
    sigFunc = signatureFunc;
  }
  else {
    lastSecret = pair.sec;
    sigFunc = keyring.Key(pair.pub, pair.sec).signSync;
  }
  signatureFunc = sigFunc;
  let pow = "", sig = "", raw = "";

  block.time = getBlockTime(block, conf, forcedTime);

  // Really start now
  let testsCount = 0;
  if (nbZeros == 0) {
    block.nonce = 0;
    block.time = block.medianTime;
  }
  // Compute block's hash
  block.inner_hash = getBlockInnerHash(block);
  let found = false;
  let score = 0;
  let turn = 0;
  while (!found) {

    // We make a bunch of tests every second
    yield Promise.race([
      countDown(1000),
      co(function*() {
        /*****
         * 1 second tests
         */
        // Prove
        let i = 0;
        const thisTurn = turn;
        const pausePeriod = score ? score / 5 : 10; // 5 pauses per second
        // We limit the number of t
        const testsPerRound = score ? Math.floor(score * conf.cpu) : 1000 * 1000 * 1000;
        // Time is updated regularly during the proof
        block.time = getBlockTime(block, conf, forcedTime);
        if (block.number == 0) {
          block.medianTime = block.time;
        }
        block.inner_hash = getBlockInnerHash(block);
        while(!found && i < testsPerRound && thisTurn == turn) {
          block.nonce++;
          raw = "InnerHash: " + block.inner_hash + "\nNonce: " + block.nonce + "\n";
          sig = sigFunc(raw);
          pow = hash(raw + sig + '\n');
          let j = 0, charOK = true;
          while (j < nbZeros && charOK) {
            charOK = pow[j] == '0';
            j++;
          }
          if (charOK) {
            found = pow[nbZeros].match(new RegExp('[0-' + highMark + ']'));
          }
          if (!found && nbZeros > 0 && j >= constants.PROOF_OF_WORK.MINIMAL_TO_SHOW) {
            pSend({ found: false, pow: pow, block: block, nbZeros: nbZeros });
          }
          if (!found) {
            i++;
            testsCount++;
            if (i % pausePeriod == 0) {
              yield countDown(0); // Very low pause, just the time to process eventual end of the turn
            }
          }
        }
        if (!found) {
          if (turn > 0 && !score) {
            score = testsCount;
          }
          // We wait for main "while" countdown to end the turn. This gives of a bit of breath to the CPU (the amount
          // of "breath" depends on the "cpu" parameter.
          yield countDown(1000);
        }
      })
    ]);
    turn++;
  }
  block.signature = sig;
  yield pSend({
      found: true,
      block: block,
      testsCount: testsCount,
      pow: pow
    });
}));

function countDown(duration) {
  return new Promise((resolve) => setTimeout(resolve, duration));
}

function getBlockInnerHash(block) {
  const raw = rawer.getBlockInnerPart(block);
  return hash(raw);
}

function hash(str) {
  return hashf(str).toUpperCase();
}

function getBlockTime (block, conf, forcedTime) {
  if (forcedTime) {
    return forcedTime;
  }
  const now = moment.utc().unix();
  const maxAcceleration = rules.HELPERS.maxAcceleration(conf);
  const timeoffset = block.number >= conf.medianTimeBlocks ? 0 : conf.rootoffset || 0;
  const medianTime = block.medianTime;
  const upperBound = block.number == 0 ? medianTime : Math.min(medianTime + maxAcceleration, now - timeoffset);
  return Math.max(medianTime, upperBound);
}

function pSend(stuff) {
  return new Promise(function (resolve, reject) {
    process.send(stuff, function (error) {
      !error && resolve();
      error && reject();
    });
  });
}
