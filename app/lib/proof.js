"use strict";
const co = require('co');
const async = require('async');
const moment = require('moment');
const hashf = require('./ucp/hashf');
const dos2unix = require('./system/dos2unix');
const rules = require('./rules');
const constants = require('./constants');
const keyring = require('./crypto/keyring');
const rawer = require('./ucp/rawer');

const AUTOKILL_TIMEOUT_DELAY = 10 * 1000;
const TURN_DURATION = 100;
const PAUSES_PER_TURN = 5;

let timeoutAutoKill = null;
let computing = false;
let askedStop = false;

let signatureFunc, id, lastPub, lastSecret;

process.on('uncaughtException', (err) => {
  console.error(err.stack || Error(err));
  process.send({error: err});
});

process.on('message', (message) => co(function*() {
  if (message.command == 'id') {
    lastPub = message.pubkey;
    id = message.identifier;
    pSend({ powStatus: 'ready' });
    autoKillIfNoContact();
  }
  else if (message.command == 'idle') {
    autoKillIfNoContact();
    pSend({ powStatus: 'idle' });
  }
  else if (message.command == 'ready') {
    pSend({ powStatus: computing ? 'computing' : 'ready' });
  }
  else if (message.command == 'stop') {
    if (!computing) {
      pSend({ powStatus: 'ready' });
    } else {
      askedStop = true;
    }
  }
  else if (message.newPoW) {
    beginNewProofOfWork(message.newPoW);
  }
}));

function beginNewProofOfWork(stuff) {
  askedStop = false;
  computing = co(function*() {
    pSend({ powStatus: 'started block#' + stuff.block.number });
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
      lastPub = pair.pub;
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
    while (!found && !askedStop) {

      // We make a bunch of tests every second
      yield Promise.race([
        countDown(TURN_DURATION),
        co(function*() {
          try {

            /*****
             * A NEW TURN
             */
            // Prove
            let i = 0;
            const thisTurn = turn;
            const pausePeriod = score ? score / PAUSES_PER_TURN : 10; // number of pauses per turn
            // We limit the number of t
            const testsPerRound = score ? Math.floor(score * cpu) : 1000 * 1000 * 1000;
            // Time is updated regularly during the proof
            block.time = getBlockTime(block, conf, forcedTime);
            if (block.number == 0) {
              block.medianTime = block.time;
            }
            block.inner_hash = getBlockInnerHash(block);
            while(!found && i < testsPerRound && thisTurn == turn && !askedStop) {
              block.nonce++;
              raw = dos2unix("InnerHash: " + block.inner_hash + "\nNonce: " + block.nonce + "\n");
              sig = dos2unix(sigFunc(raw));
              pow = hashf("InnerHash: " + block.inner_hash + "\nNonce: " + block.nonce + "\n" + sig + "\n").toUpperCase();
              let j = 0, charOK = true;
              while (j < nbZeros && charOK) {
                charOK = pow[j] == '0';
                j++;
              }
              if (charOK) {
                found = pow[nbZeros].match(new RegExp('[0-' + highMark + ']'));
              }
              if (!found && nbZeros > 0 && j - 1 >= constants.PROOF_OF_WORK.MINIMAL_TO_SHOW) {
                pSend({ pow: { found: false, pow: pow, block: block, nbZeros: nbZeros }});
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
              yield countDown(TURN_DURATION);
            }
          } catch (e) {
            console.error(e);
          }
        })
      ]);
      turn++;
    }
    block.signature = sig;
    computing = false;
    if (askedStop) {
      askedStop = false;
      yield pSend({ pow: { canceled: true }});
      pSend({ powStatus: 'canceled block#' + block.number });
      pSend({ powStatus: 'ready' });
    } else {
      yield pSend({
        pow: {
          found: true,
          block: block,
          testsCount: testsCount,
          pow: pow
        }
      });
      pSend({ powStatus: 'found' });
    }
  });
}

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
  stuff.pubkey = lastPub;
  return new Promise(function (resolve, reject) {
    process.send(stuff, function (error) {
      !error && resolve();
      error && reject();
    });
  });
}

function autoKillIfNoContact() {
  if (timeoutAutoKill) {
    clearTimeout(timeoutAutoKill);
  }
  // If the timeout is not cleared in some way, the process exits
  timeoutAutoKill = setTimeout(() => {
    console.log('Killing engine #%s', id);
    process.exit();
  }, AUTOKILL_TIMEOUT_DELAY);
}
