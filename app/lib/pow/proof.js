"use strict";
const co = require('co');
const moment = require('moment');
const hashf = require('./../ucp/hashf');
const dos2unix = require('./../system/dos2unix');
const querablep = require('./../querablep');
const rules = require('./../rules/index');
const constants = require('./../constants');
const keyring = require('./../crypto/keyring');
const rawer = require('./../ucp/rawer');

let AUTOKILL_TIMEOUT_DELAY = 10 * 1000;
const TURN_DURATION_IN_MILLISEC = 1000;
const PAUSES_PER_TURN = 5;

let timeoutAutoKill = null;
let computing = querablep(Promise.resolve(null));
let askedStop = false;

// By default, we do not prefix the PoW by any number
let prefix = 0;

let signatureFunc, id, lastPub, lastSecret, currentCPU = 1;

process.on('uncaughtException', (err) => {
  console.error(err.stack || Error(err));
  process.send({error: err});
});

autoKillIfNoContact();

process.on('message', (message) => co(function*() {

  switch (message.command) {

    case 'state':
      answer(message, computing.isFulfilled() ? 'ready' : 'computing');
      break;

    case 'autokillTimeout':
      AUTOKILL_TIMEOUT_DELAY = message.value;
      answer(message, 'OK');
      break;

    case 'identify':
      lastPub = message.value.pubkey;
      id = message.value.identifier;
      answer(message, 'OK');
      break;

    case 'pubkey': answer(message, lastPub);    break;
    case 'id':     answer(message, id);         break;
    case 'cpu':    answer(message, currentCPU); break;
    case 'prefix': answer(message, prefix);     break;

    case 'newPoW':
      co(function*() {
        yield computing;
        const res = yield beginNewProofOfWork(message.value);
        answer(message, res);
      });
      break;

    case 'cancel':
      if (computing.isFulfilled()) {
        answer(message, 'ready');
      } else {
        askedStop = true;
        answer(message, 'cancelling');
      }
      break;

    case 'conf':
      if (message.value.cpu !== undefined) {
        currentCPU = message.value.cpu;
      }
      if (message.value.prefix !== undefined) {
        prefix = parseInt(message.value.prefix) * 10 * constants.NONCE_RANGE;
      }
      answer(message, { currentCPU, prefix });
      break;
  }

  // We received a message, we postpone the autokill protection trigger
  autoKillIfNoContact();

}));

function beginNewProofOfWork(stuff) {
  askedStop = false;
  computing = querablep(co(function*() {
    pSend({ powStatus: 'started block#' + stuff.block.number });
    let nonce = 0;
    let foundBlock = null;
    const conf = stuff.conf;
    const block = stuff.block;
    const nonceBeginning = stuff.nonceBeginning;
    const nbZeros = stuff.zeros;
    const pair = stuff.pair;
    const forcedTime = stuff.forcedTime;
    currentCPU = conf.cpu || constants.DEFAULT_CPU;
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
        countDown(TURN_DURATION_IN_MILLISEC),
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
            const testsPerRound = score ? Math.floor(score * currentCPU) : 1000 * 1000 * 1000;
            // Time is updated regularly during the proof
            block.time = getBlockTime(block, conf, forcedTime);
            if (block.number == 0) {
              block.medianTime = block.time;
            }
            block.inner_hash = getBlockInnerHash(block);
            while(!found && i < testsPerRound && thisTurn == turn && !askedStop) {
              nonce++;
              // The final nonce is composed of 3 parts
              block.nonce = prefix + nonceBeginning + nonce;
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
                pSend({ pow: { pow: pow, block: block, nbZeros: nbZeros }});
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
              yield countDown(TURN_DURATION_IN_MILLISEC);
            }
          } catch (e) {
            console.error(e);
          }
        })
      ]);
      turn++;
    }
    block.hash = pow;
    block.signature = sig;
    if (askedStop) {
      askedStop = false;
      yield pSend({ pow: { canceled: true }});
      pSend({ powStatus: 'canceled block#' + block.number });
      pSend({ powStatus: 'ready' });
    } else {
      foundBlock = {
        pow: {
          block: block,
          testsCount: testsCount,
          pow: pow
        }
      };
      pSend({ powStatus: 'found' });
    }
    return foundBlock;
  }));
  return computing;
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
  const maxAcceleration = rules.HELPERS.maxAcceleration(block, conf);
  const timeoffset = block.number >= conf.medianTimeBlocks ? 0 : conf.rootoffset || 0;
  const medianTime = block.medianTime;
  const upperBound = block.number == 0 ? medianTime : Math.min(medianTime + maxAcceleration, now - timeoffset);
  return Math.max(medianTime, upperBound);
}

function answer(message, answer) {
  return new Promise(function (resolve, reject) {
    process.send({
      uuid: message.uuid,
      answer,
      pubkey: lastPub
    }, function (error) {
      !error && resolve();
      error && reject();
    });
  });
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
    process.exit();
  }, AUTOKILL_TIMEOUT_DELAY);
}
