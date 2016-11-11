"use strict";
const co              = require('co');
const _               = require('underscore');
const constants       = require('../constants');
const base58          = require('../crypto/base58');
const childProcess    = require('child_process');
const path            = require('path');
const Block           = require('../entity/block');
const querablep       = require('../querablep');

module.exports = (server) => new BlockGenerator(server);

const POW_CANCELED = 'Proof-of-work computation canceled';
const POW_CANCELED_BECAUSE_GIVEN = 'Proof-of-work computation canceled because block received';

function BlockGenerator(notifier) {

  let conf, pair, logger, wait = null, waitResolve;

  let workerFarmPromise;

  function getWorker() {
    return (workerFarmPromise || (workerFarmPromise = co(function*() {
      return new WorkerFarm();
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

  this.waitForNewAsking = () => wait = new Promise((resolve) => {
    waitResolve = resolve;
  });

  this.cancel = (gottenBlock) => co(function*() {
    // If no farm was instanciated, tehre is nothing to do yet
    if (workerFarmPromise) {
      let farm = yield getWorker();
      if (farm.isComputing() && !farm.isStopping()) {
        yield farm.stopPoW(gottenBlock);
      }
      if (waitResolve) {
        waitResolve();
        waitResolve = null;
        wait = null;
      }
    }
  });

  this.prove = function (block, difficulty, forcedTime) {

    if (waitResolve) {
      waitResolve();
      waitResolve = null;
      wait = null;
    }

    const remainder = difficulty % 16;
    const nbZeros = (difficulty - remainder) / 16;
    const highMark = constants.PROOF_OF_WORK.UPPER_BOUND[remainder];

    return co(function*() {

      let powFarm = yield getWorker();

      if (block.number == 0) {
        // On initial block, difficulty is the one given manually
        block.powMin = difficulty;
      }

      // Start
      powFarm.setOnAlmostPoW(function(pow, matches, block, found) {
        powEvent(found, pow);
        if (matches && matches[1].length >= constants.PROOF_OF_WORK.MINIMAL_TO_SHOW_IN_LOGS) {
          logger.info('Matched %s zeros %s with Nonce = %s for block#%s by %s', matches[1].length, pow, block.nonce, block.number, block.issuer.slice(0,6));
        }
      });

      block.nonce = 0;
      logger.info('Generating proof-of-work with %s leading zeros followed by [0-' + highMark + ']... (CPU usage set to %s%) for block#%s', nbZeros, (conf.cpu * 100).toFixed(0), block.number, block.issuer.slice(0,6));
      const start = Date.now();
      try {

        let result = yield powFarm.askNewProof({
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
        if (e == POW_CANCELED_BECAUSE_GIVEN) {
          logger.info('GIVEN proof-of-work for block#%s with %s leading zeros followed by [0-' + highMark + ']! stop PoW for %s', block.number, nbZeros, pair.publicKey.slice(0,6));
        } else if (e == POW_CANCELED) {
          logger.info('Proof-of-work interrupted for some unknown reason, restarting..');
        }
        logger.warn(e);
        throw e;
      }
    });
  };

  this.changeCPU = (cpu) => co(function*() {
    const farm = yield getWorker();
    yield farm.changeCPU(cpu);
  });

  this.changePoWPrefix = (prefix) => co(function*() {
    const farm = yield getWorker();
    yield farm.changePoWPrefix(prefix);
  });

  function powEvent(found, hash) {
    notifier && notifier.push({ pow: { found, hash } });
  }

  function WorkerFarm() {
    // Create
    const that = this;
    // We use as much cores as available, but not more than CORES_MAXIMUM_USE_IN_PARALLEL
    const cores = require('os').cpus().slice(0, constants.CORES_MAXIMUM_USE_IN_PARALLEL);
    // Each worker has his own chunk of possible nonces
    const workers = cores.map((c, index) => new Worker((index + 1), (index + 1) * constants.NONCE_RANGE, pair.publicKey));

    let powPromise = null;
    let stopPromise = null;

    this.changeCPU = (cpu) => Promise.all(workers.map((worker) => worker.changeConf({ cpu })));

    this.changePoWPrefix = (prefix) => Promise.all(workers.map((worker) => worker.changeConf({ prefix })));

    this.isComputing = () => powPromise !== null && !powPromise.isResolved();

    this.isStopping = () => stopPromise !== null && !stopPromise.isResolved();

    const whenReady = () => Promise.all(workers.map((worker) => worker.whenReady()));

    this.stopPoW = (gottenBlock) => {
      stopPromise = querablep(Promise.all(workers.map((worker) => worker.stopPoW(gottenBlock))));
      return stopPromise;
    };

    this.askNewProof = (stuff) => co(function*() {
      yield whenReady();
      // Starts a new race to find the PoW
      const races = workers.map((worker) => querablep(worker.askNewProof(_.clone(stuff))));
      powPromise = querablep(Promise.race(races));
      // Wait for the PoW to be either found or canceled
      yield powPromise;
      let engineNumber = races.reduce((doneIndex, obj, index) => {
        if (doneIndex !== null) return doneIndex;
        if (races[index].isResolved()) {
          return index + 1;
        }
        return null;
      }, null);
      logger.info('ENGINE #%s HAS FOUND A PROOF', engineNumber);
      // Ask for stopping the other engines
      let res = yield powPromise;
      yield that.stopPoW(res.block);
      // But also gie the answer in the **same time**, without waiting for effective stop of the engines
      return powPromise;
    });

    this.setOnAlmostPoW = (onPoW) => workers.map((worker) => worker.setOnAlmostPoW(onPoW));
  }

  function Worker(id, nonceBeginning, pub) {

    let onAlmostPoW = function() { logger.error('Almost proof-of-work found, but no listener is attached.'); };
    let onPoWSuccess = function() { logger.error('Proof-of-work success, but no listener is attached.'); };
    let onPoWError = function() { logger.error('Proof-of-work error, but no listener is attached.'); };
    let powProcess, readyPromise, readyResolver;

    newProcess();

    function createReadyPromise() {
      readyPromise = querablep(new Promise((resolve) => readyResolver = resolve));
    }

    function sendToProcess(obj) {
      try {
        if (powProcess.connected) {
          powProcess.send(obj);
        }
      } catch (e) {
        logger.warn(e);
      }
    }

    this.whenReady = () => readyPromise;

    this.changeConf = (conf) => co(function*() {
      logger.info('Changing conf to: %s on engine#%s', JSON.stringify(conf), id);
      sendToProcess({ command: 'conf', conf });
    });

    /**
     * Eventually stops the engine PoW if one was computing
     */
    this.stopPoW = (gottenBlock) => {
      logger.info('Stop proof-of-work worker #%s', id);
      if (!gottenBlock) {
        // Canceled for a long time (not because of an incoming block)
        onPoWError = null;
        onPoWSuccess = null;
      }
      sendToProcess({ command: 'stop' });
      return readyPromise;
    };

    /**
     * Starts a new computation of PoW
     * @param stuff The necessary data for computing the PoW
     */
    this.askNewProof = (stuff) => new Promise((resolve, reject) => {
      // Soon or later the engine will be ready again, we will need to know it
      createReadyPromise();

      // Binds the engine to this promise
      onPoWSuccess = resolve;
      onPoWError = reject;

      // Starts the PoW
      stuff.newPoW.nonceBeginning = nonceBeginning;
      sendToProcess(stuff);
    });

    this.setOnAlmostPoW = function(onPoW) {
      onAlmostPoW = onPoW;
    };

    function newProcess() {
      let interval;

      powProcess = childProcess.fork(path.join(__dirname, '../proof.js'));

      if (!readyPromise || readyPromise.isFulfilled()) {
        createReadyPromise();
      }

      powProcess.on('exit', function() {
        onPoWError && onPoWError(POW_CANCELED);
        onPoWError = null;
        logger.trace('Engine engine %s exited unexpectedly', id);
        if (interval) {
          clearInterval(interval);
        }
        newProcess();
      });

      powProcess.on('message', function(msg) {
        if (msg.powStatus) {
          // We look only at status messages, avoiding eventual PoW messages
          if (msg.powStatus == 'ready' && readyResolver) {
            readyResolver();
          }
        }
      });

      powProcess.on('message', function(message) {

        // A message about the PoW
        if (message.pow) {
          const msg = message.pow;
          const block = msg.block;
          if (msg.error) {
            onPoWError && onPoWError(msg.error);
            onPoWError = null;
          }
          else if (msg.found) {
            block.hash = msg.pow;
            onAlmostPoW(block.hash, block.hash.match(/^(0{2,})[^0]/), block, msg.found);
            onPoWError = null;
            onPoWSuccess && onPoWSuccess({ block: block, testsCount: msg.testsCount });
            onPoWSuccess = null;
          } else {
            if (msg.canceled) {
              onPoWError && onPoWError(POW_CANCELED_BECAUSE_GIVEN);
              onPoWError = null;
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

      // Initialize the engine
      sendToProcess({ command: 'id', pubkey: pub, identifier: id });
      interval = setInterval(() => {
        return sendToProcess({ command: 'idle' });
      }, constants.ENGINE_IDLE_INTERVAL);
    }
  }
}
