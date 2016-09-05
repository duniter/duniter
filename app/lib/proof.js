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
    sigFunc = keyring.Key(pair.pub, pair.sec).sign;
  }
  signatureFunc = sigFunc;
  let pow = "", sig = "", raw = "";

  block.time = getBlockTime(block, conf, forcedTime);
  // Test CPU speed
  if ((nbZeros > 0 || highMark != '9A-F') && speed == 1) {
    speed = yield computeSpeed(block, sigFunc);
  }
  const testsPerSecond = speed;
  const testsPerRound = Math.max(Math.round(testsPerSecond * cpu), 1) / SAMPLES_PER_SECOND; // We make a sample every Xms

  yield pSend({ found: false, testsPerSecond: testsPerSecond,
    testsPerRound: testsPerRound * SAMPLES_PER_SECOND, nonce: block.nonce });
  // Really start now
  let testsCount = 0;
  if (nbZeros == 0) {
    block.nonce = 0;
    block.time = block.medianTime;
  }
  // Compute block's hash
  block.inner_hash = getBlockInnerHash(block);
  let found = false;
  while (!found) {
    // Prove
    const testStart = new Date();
    let i = 0;
    // Time is updated regularly during the proof
    block.time = getBlockTime(block, conf, forcedTime);
    block.inner_hash = getBlockInnerHash(block);
    while(!found && i < testsPerRound) {
      block.nonce++;
      raw = rawer.getBlockInnerHashAndNonce(block);
      sig = dos2unix(yield sigFunc(raw));
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
      if (!found && nbZeros > 0 && j >= constants.PROOF_OF_WORK.MINIMAL_TO_SHOW) {
        yield pSend({ found: false, pow: pow, block: block, nbZeros: nbZeros });
      }
      testsCount++;
      i++;
    }
    const end = new Date();
    const durationMS = (end.getTime() - testStart.getTime());
    // Run NEXT only after a delay
    yield function*() {
      yield (cb) => setTimeout(cb, nbZeros == 0 ? 0 : Math.max(0, (A_SECOND / SAMPLES_PER_SECOND - durationMS))); // Max wait 1 second
    };
    yield pSend({ found: false, pow: pow, block: block, nbZeros: nbZeros });
  }
  block.signature = sig;
  yield pSend({
      found: true,
      block: block,
      testsCount: testsCount,
      pow: pow
    });
}));

function getBlockInnerHash(block) {
  const raw = rawer.getBlockInnerPart(block);
  return hash(raw);
}

function hash(str) {
  return hashf(str).toUpperCase();
}

const computeSpeed = (block, sigFunc) => co(function*() {
  const start = new Date();
  const raw = rawer.getBlockInnerHashAndNonce(block);
  for (let i = 0; i < constants.PROOF_OF_WORK.EVALUATION; i++) {
    // Signature
    const sig = dos2unix(yield sigFunc(raw));
    // Hash
    hash(raw + sig + '\n');
  }
  const duration = (new Date().getTime() - start.getTime());
  return Math.round(constants.PROOF_OF_WORK.EVALUATION * 1000 / duration);
});

function getBlockTime (block, conf, forcedTime) {
  const now = forcedTime || moment.utc().unix();
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
