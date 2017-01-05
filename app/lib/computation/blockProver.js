"use strict";
const co              = require('co');
const _               = require('underscore');
const constants       = require('../constants');
const base58          = require('../crypto/base58');
const engine          = require('../pow/engine');
const path            = require('path');
const Block           = require('../entity/block');
const querablep       = require('../querablep');

const POW_FOUND = true;
const POW_NOT_FOUND_YET = false;

module.exports = (server) => new BlockGenerator(server);

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
      let result = yield powFarm.askNewProof({
        newPoW: { conf: conf, block: block, zeros: nbZeros, highMark: highMark, forcedTime: forcedTime,
          pair: pair.json()
        }
      });
      if (!result) {
        logger.info('GIVEN proof-of-work for block#%s with %s leading zeros followed by [0-' + highMark + ']! stop PoW for %s', block.number, nbZeros, pair.publicKey.slice(0,6));
        throw 'Proof-of-work computation canceled because block received';
      } else {
        const proof = result.block;
        const testsCount = result.testsCount;
        const duration = (Date.now() - start);
        const testsPerSecond = (testsCount / (duration / 1000)).toFixed(2);
        logger.info('Done: %s in %ss (%s tests, ~%s tests/s)', proof.hash, (duration / 1000).toFixed(2), testsCount, testsPerSecond);
        logger.info('FOUND proof-of-work with %s leading zeros followed by [0-' + highMark + ']!', nbZeros);
        return new Block(proof);
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
      let res = yield powPromise;
      if (res) {
        let engineNumber = races.reduce((doneIndex, obj, index) => {
          if (doneIndex !== null) return doneIndex;
          if (races[index].isResolved()) {
            return index + 1;
          }
          return null;
        }, null);
        logger.info('ENGINE #%s HAS FOUND A PROOF', engineNumber);
      }
      // Ask for stopping the other engines
      that.stopPoW();
      // But also give the answer in the **same time**, without waiting for effective stop of the engines
      return (res && res.pow);
    });

    this.setOnAlmostPoW = (onPoW) => workers.map((worker) => worker.setOnAlmostPoW(onPoW));
  }

  function Worker(id, nonceBeginning) {

    const theEngine = engine();

    let onAlmostPoW;

    const checkPoWandNotify = (hash, block, found) => {
      const matches = hash.match(/^(0{2,})[^0]/);
      if (matches && onAlmostPoW) {
        onAlmostPoW(hash, matches, block, found);
      }
    };

    this.whenReady = () => this.stopPoW();

    this.changeConf = (conf) => co(function*() {
      logger.info('Changing conf to: %s on engine#%s', JSON.stringify(conf), id);
      theEngine.setValue('conf', conf );
    });

    /**
     * Eventually stops the engine PoW if one was computing
     */
    this.stopPoW = () => {
      logger.info('Stop proof-of-work worker #%s', id);
      return theEngine.cancel();
    };

    /**
     * Starts a new computation of PoW
     * @param stuff The necessary data for computing the PoW
     */
    this.askNewProof = (stuff) => co(function*() {
      // Keep track of PoW advancement
      theEngine.setOnInfoMessage((message) => {
        if (message.error) {
          logger.error('Error in engine#%s:', id, message.error);
        } else if (message.pow) {
          // A message about the PoW
          const msg = message.pow;
          if (!msg.canceled) {
            checkPoWandNotify(msg.pow, msg.block, POW_NOT_FOUND_YET);
          }
        }
      });
      // Keep the engine alive as long as it hasn't found the proof OR hasn't been canceled
      let interval = setInterval(() => {
        return theEngine.status();
      }, constants.ENGINE_IDLE_INTERVAL);
      // Starts the PoW
      const res = yield theEngine.prove(stuff.newPoW.block, nonceBeginning, stuff.newPoW.zeros, stuff.newPoW.highMark, stuff.newPoW.pair, stuff.newPoW.forcedTime, stuff.newPoW.conf.medianTimeBlocks, stuff.newPoW.conf.avgGenTime, stuff.newPoW.conf.cpu);
      clearInterval(interval);
      if (res) {
        checkPoWandNotify(res.pow.pow, res.pow.block, POW_FOUND);
      }
      return res;
    });

    this.setOnAlmostPoW = function(onPoW) {
      onAlmostPoW = onPoW;
    };
  }
}
