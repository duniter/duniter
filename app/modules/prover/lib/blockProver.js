"use strict";
const co              = require('co');
const engine          = require('./engine');
const querablep       = require('querablep');
const common          = require('duniter-common');
const constants       = require('./constants');

const Block = common.document.Block

const POW_FOUND = true;
const POW_NOT_FOUND_YET = false;

module.exports = (server) => new BlockProver(server);

function BlockProver(server) {

  let conf = server.conf;
  let pair = conf.pair;
  let logger = server.logger;
  let waitResolve;

  let workerFarmPromise;

  function getWorker() {
    return (workerFarmPromise || (workerFarmPromise = co(function*() {
      return new WorkerFarm();
    })));
  }

  const debug = process.execArgv.toString().indexOf('--debug') !== -1;
  if(debug) {
    //Set an unused port number.
    process.execArgv = [];
  }

  this.cancel = (gottenBlock) => co(function*() {
    // If no farm was instanciated, there is nothing to do yet
    if (workerFarmPromise) {
      let farm = yield getWorker();
      if (farm.isComputing() && !farm.isStopping()) {
        yield farm.stopPoW(gottenBlock);
      }
      if (waitResolve) {
        waitResolve();
        waitResolve = null;
      }
    }
  });

  this.prove = function (block, difficulty, forcedTime) {

    if (waitResolve) {
      waitResolve();
      waitResolve = null;
    }

    const remainder = difficulty % 16;
    const nbZeros = (difficulty - remainder) / 16;
    const highMark = common.constants.PROOF_OF_WORK.UPPER_BOUND[remainder];

    return co(function*() {

      let powFarm = yield getWorker();

      if (block.number == 0) {
        // On initial block, difficulty is the one given manually
        block.powMin = difficulty;
      }

      // Start
      powFarm.setOnAlmostPoW(function(pow, matches, aBlock, found) {
        powEvent(found, pow);
        if (matches && matches[1].length >= constants.MINIMAL_ZEROS_TO_SHOW_IN_LOGS) {
          logger.info('Matched %s zeros %s with Nonce = %s for block#%s by %s', matches[1].length, pow, aBlock.nonce, aBlock.number, aBlock.issuer.slice(0,6));
        }
      });

      block.nonce = 0;
      logger.info('Generating proof-of-work with %s leading zeros followed by [0-' + highMark + ']... (CPU usage set to %s%) for block#%s', nbZeros, (conf.cpu * 100).toFixed(0), block.number, block.issuer.slice(0,6));
      const start = Date.now();
      let result = yield powFarm.askNewProof({
        newPoW: { conf: conf, block: block, zeros: nbZeros, highMark: highMark, forcedTime: forcedTime, pair }
      });
      if (!result) {
        logger.info('GIVEN proof-of-work for block#%s with %s leading zeros followed by [0-' + highMark + ']! stop PoW for %s', block.number, nbZeros, pair.pub.slice(0,6));
        throw 'Proof-of-work computation canceled because block received';
      } else {
        const proof = result.block;
        const testsCount = result.testsCount;
        const duration = (Date.now() - start);
        const testsPerSecond = (testsCount / (duration / 1000)).toFixed(2);
        logger.info('Done: #%s, %s in %ss (%s tests, ~%s tests/s)', block.number, proof.hash, (duration / 1000).toFixed(2), testsCount, testsPerSecond);
        logger.info('FOUND proof-of-work with %s leading zeros followed by [0-' + highMark + ']!', nbZeros);
        return Block.fromJSON(proof);
      }
    });
  };

  this.changeCPU = (cpu) => co(function*() {
    conf.cpu = cpu;
    const farm = yield getWorker();
    return farm.changeCPU(cpu);
  });

  this.changePoWPrefix = (prefix) => co(function*() {
    const farm = yield getWorker();
    return farm.changePoWPrefix(prefix);
  });

  function powEvent(found, hash) {
    server && server.push({ pow: { found, hash } });
  }

  function WorkerFarm() {
    // Create
    const theEngine = engine(server.conf, server.logger)

    let onAlmostPoW

    // An utility method to filter the pow notifications
    const checkPoWandNotify = (hash, block, found) => {
      const matches = hash.match(/^(0{2,})[^0]/);
      if (matches && onAlmostPoW) {
        onAlmostPoW(hash, matches, block, found);
      }
    }

    // Keep track of PoW advancement
    theEngine.setOnInfoMessage((message) => {
      if (message.error) {
        logger.error('Error in engine#%s:', theEngine.id, message.error)
      } else if (message.pow) {
        // A message about the PoW
        const msg = message.pow
        checkPoWandNotify(msg.pow, msg.block, POW_NOT_FOUND_YET)
      }
    })

    // We use as much cores as available, but not more than CORES_MAXIMUM_USE_IN_PARALLEL

    let powPromise = null
    let stopPromise = null

    this.changeCPU = (cpu) => theEngine.setConf({ cpu })

    this.changePoWPrefix = (prefix) => theEngine.setConf({ prefix })

    this.isComputing = () => powPromise !== null && !powPromise.isResolved()

    this.isStopping = () => stopPromise !== null && !stopPromise.isResolved()

    /**
     * Eventually stops the engine PoW if one was computing
     */
    this.stopPoW = (gottenBlock) => {
      stopPromise = querablep(theEngine.cancel(gottenBlock))
      return stopPromise;
    };

    /**
     * Starts a new computation of PoW
     * @param stuff The necessary data for computing the PoW
     */
    this.askNewProof = (stuff) => co(function*() {
      // Starts the PoW
      powPromise = querablep(theEngine.prove(stuff))
      const res = yield powPromise
      if (res) {
        checkPoWandNotify(res.pow.pow, res.pow.block, POW_FOUND);
      }
      return res && res.pow
    })

    this.setOnAlmostPoW = (onPoW) => onAlmostPoW = onPoW
  }
}
