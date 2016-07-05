"use strict";
const util       = require('util');
const stream     = require('stream');
const co         = require('co');
const _          = require('underscore');
const Q          = require('q');
const moment     = require('moment');
const vucoin     = require('vucoin');
const hashf      = require('./ucp/hashf');
const dos2unix   = require('./system/dos2unix');
const logger     = require('./logger')('sync');
const rawer      = require('./ucp/rawer');
const constants  = require('../lib/constants');
const Peer       = require('../lib/entity/peer');
const multimeter = require('multimeter');

const CONST_BLOCKS_CHUNK = 500;
const EVAL_REMAINING_INTERVAL = 1000;
const COMPUTE_SPEED_ON_COUNT_CHUNKS = 8;

module.exports = Synchroniser;

function Synchroniser (server, host, port, conf, interactive) {

  let that = this;

  let speed = 0, syncStart = new Date(), times = [syncStart], blocksApplied = 0;
  const baseWatcher = interactive ? new MultimeterWatcher() : new LoggerWatcher();

  // Wrapper to also push event stream
  const watcher = {
    writeStatus: baseWatcher.writeStatus,
    downloadPercent: (pct) => {
      if (pct !== undefined && baseWatcher.downloadPercent() < pct) {
        that.push({ download: pct });
      }
      return baseWatcher.downloadPercent(pct);
    },
    appliedPercent: (pct) => {
      if (pct !== undefined && baseWatcher.appliedPercent() < pct) {
        that.push({ applied: pct });
      }
      return baseWatcher.appliedPercent(pct);
    },
    end: baseWatcher.end
  };

  stream.Duplex.call(this, { objectMode: true });

  // Unused, but made mandatory by Duplex interface
  this._read = () => null;
  this._write = () => null;

  if (interactive) {
    logger.mute();
  }

  // Services
  const PeeringService     = server.PeeringService;
  const BlockchainService  = server.BlockchainService;

  const dal = server.dal;

  const vucoinOptions = {
    timeout: constants.NETWORK.SYNC_LONG_TIMEOUT
  };

  this.sync = (to, chunkLen, askedCautious, nopeers) => {
    let logInterval;
    chunkLen = chunkLen || CONST_BLOCKS_CHUNK;
    logger.info('Connecting remote host...');
    return co(function *() {
      let toApply = [];

      const incrementBlocks = (increment, localNumber, remoteNumber) => {
        blocksApplied += increment;
        let now = new Date();
        if (times.length == COMPUTE_SPEED_ON_COUNT_CHUNKS) {
          times.splice(0, 1);
        }
        times.push(now);
        let duration = times.reduce(function(sum, t, index) {
          return index == 0 ? sum : (sum + (times[index] - times[index - 1]));
        }, 0);
        speed = (chunkLen * (times.length  - 1)) / Math.round(Math.max(duration / 1000, 1));
        // Reset chrono
        syncStart = new Date();
        if (watcher.appliedPercent() != Math.floor((blocksApplied + localNumber) / remoteNumber * 100)) {
          watcher.appliedPercent(Math.floor((blocksApplied + localNumber) / remoteNumber * 100));
        }
      };

      try {
        const node = yield getVucoin(host, port, vucoinOptions);
        logger.info('Sync started.');

        const lCurrent = yield dal.getCurrentBlockOrNull();

        //============
        // Blockchain
        //============
        logger.info('Downloading Blockchain...');
        watcher.writeStatus('Connecting to ' + host + '...');
        const rCurrent = yield Q.nbind(node.blockchain.current, node)();
        const remoteVersion = rCurrent.version;
        if (remoteVersion < 2) {
          throw Error("Could not sync with remote host. UCP version is " + remoteVersion + " (Must be >= 2)")
        }
        const localNumber = lCurrent ? lCurrent.number : -1;
        const remoteNumber = Math.min(rCurrent.number, to || rCurrent.number);

        // We use cautious mode if it is asked, or not particulary asked but blockchain has been started
        const cautious = (askedCautious === true || (askedCautious === undefined && localNumber >= 0));

        // Recurrent checking
        logInterval = setInterval(() => {
          if (remoteNumber > 1 && speed > 0) {
            const remain = (remoteNumber - (localNumber + 1 + blocksApplied));
            const secondsLeft = remain / speed;
            const momDuration = moment.duration(secondsLeft*1000);
            watcher.writeStatus('Remaining ' + momDuration.humanize() + '');
          }
        }, EVAL_REMAINING_INTERVAL);

        // Prepare chunks of blocks to be downloaded
        const chunks = [];
        for (let i = localNumber + 1; i <= remoteNumber; i = i + chunkLen) {
          chunks.push([i, Math.min(i + chunkLen - 1, remoteNumber)]);
        }

        // Prepare the array of download promises. The first is the promise of already downloaded blocks
        // which has not been applied yet.
        toApply = [Q.defer()].concat(chunks.map(() => Q.defer()));
        toApply[0].resolve([localNumber + 1, localNumber]);

        // Chain download promises, and start download right now
        chunks.map((chunk, index) =>
          // When previous download is done
          toApply[index].promise.then(() =>
            co(function *() {
              // Download blocks and save them
              watcher.downloadPercent(Math.floor(chunk[0] / remoteNumber * 100));
              const blocks = yield Q.nfcall(node.blockchain.blocks, chunk[1] - chunk[0] + 1, chunk[0]);
              watcher.downloadPercent(Math.floor(chunk[1] / remoteNumber * 100));
              chunk[2] = blocks;
            })
            // Resolve the promise
              .then(() =>
                toApply[index + 1].resolve(chunk))
              .catch((err) => {
                toApply[index + 1].reject(err);
                throw err;
              })
          ));

        // Do not use the first which stands for blocks applied before sync
        const toApplyNoCautious = toApply.slice(1);
        for (let i = 0; i < toApplyNoCautious.length; i++) {
          // Wait for download chunk to be completed
          const chunk = yield toApplyNoCautious[i].promise;
          let blocks = chunk[2];
          blocks = _.sortBy(blocks, 'number');
          if (cautious) {
            for (const block of blocks) {
              yield applyGivenBlock(cautious, remoteNumber)(block);
              incrementBlocks(1, localNumber, remoteNumber);
            }
          } else {
            yield BlockchainService.saveBlocksInMainBranch(blocks, remoteNumber);
            incrementBlocks(blocks.length, localNumber, remoteNumber);
            // Free memory
            if (i >= 0 && i < toApplyNoCautious.length - 1) {
              blocks.splice(0, blocks.length);
              chunk.splice(0, chunk.length);
            }
            if (i - 1 >= 0) {
              delete toApplyNoCautious[i - 1];
            }
          }
        }

        // Specific treatment for nocautious
        if (!cautious && toApply.length > 1) {
          const lastChunk = yield toApplyNoCautious[toApplyNoCautious.length - 1].promise;
          const lastBlocks = lastChunk[2];
          const lastBlock = lastBlocks[lastBlocks.length - 1];
          yield BlockchainService.obsoleteInMainBranch(lastBlock);
        }

        // Finished blocks
        yield Promise.all(toApply).then(() => watcher.appliedPercent(100.0));

        // Save currency parameters given by root block
        const rootBlock = yield server.dal.getBlock(0);
        yield BlockchainService.saveParametersForRootBlock(rootBlock);

        //=======
        // Peers
        //=======
        if (!nopeers) {
          watcher.writeStatus('Peers...');
          yield syncPeer(node);
          const merkle = yield dal.merkleForPeers();
          const getPeers = Q.nbind(node.network.peering.peers.get, node);
          const json2 = yield getPeers({});
          const rm = new NodesMerkle(json2);
          if(rm.root() != merkle.root()){
            const leavesToAdd = [];
            const json = yield getPeers({ leaves: true });
            _(json.leaves).forEach((leaf) => {
              if(merkle.leaves().indexOf(leaf) == -1){
                leavesToAdd.push(leaf);
              }
            });
            for (const leaf of leavesToAdd) {
              const json3 = yield getPeers({ "leaf": leaf });
              const jsonEntry = json3.leaf.value;
              const sign = json3.leaf.value.signature;
              const entry = {};
              ["version", "currency", "pubkey", "endpoints", "block"].forEach((key) => {
                entry[key] = jsonEntry[key];
              });
              entry.signature = sign;
              watcher.writeStatus('Peer ' + entry.pubkey);
              logger.info('Peer ' + entry.pubkey);
              yield PeeringService.submitP(entry, false, to === undefined);
            }
          }
          else {
            watcher.writeStatus('Peers already known');
          }
        }
        watcher.end();
        that.push({ sync: true });
        logger.info('Sync finished.');
      } catch (err) {
        for (let i = toApply.length; i >= 0; i--) {
          toApply[i] = Promise.reject("Canceled");
        }
        that.push({ sync: false, msg: err });
        if (logInterval) {
          clearInterval(logInterval);
        }
        err && watcher.writeStatus(err.message || String(err));
        watcher.end();
        throw err;
      }
    });
  };

  function getVucoin(theHost, thePort, options) {
    return new Promise(function(resolve, reject){
      vucoin(theHost, thePort, function (err, node) {
        if(err){
          return reject('Cannot sync: ' + err);
        }
        resolve(node);
      }, options);
    });
  }

  function applyGivenBlock(cautious, remoteCurrentNumber) {
    return (block) => {
      // Rawification of transactions
      for (const tx of block.transactions) {
        tx.version = constants.DOCUMENTS_VERSION;
        tx.currency = conf.currency;
        tx.issuers = tx.signatories;

        // Rawification
        tx.raw = rawer.getCompactTransaction(tx);
        tx.hash = ("" + hashf(rawer.getTransaction(tx))).toUpperCase();
      }
      blocksApplied++;
      speed = blocksApplied / Math.round(Math.max((new Date() - syncStart) / 1000, 1));
      if (watcher.appliedPercent() != Math.floor(block.number / remoteCurrentNumber * 100)) {
        watcher.appliedPercent(Math.floor(block.number / remoteCurrentNumber * 100));
      }
      return BlockchainService.submitBlock(block, cautious, constants.FORK_ALLOWED);
    };
  }

  //============
  // Peer
  //============
  function syncPeer (node) {

    // Global sync vars
    const remotePeer = new Peer({});
    let remoteJsonPeer = {};

    return co(function *() {
      const json = yield Q.nfcall(node.network.peering.get);
      remotePeer.copyValuesFrom(json);
      const entry = remotePeer.getRaw();
      const signature = dos2unix(remotePeer.signature);
      // Parameters
      if(!(entry && signature)){
        throw 'Requires a peering entry + signature';
      }

      remoteJsonPeer = json;
      remoteJsonPeer.pubkey = json.pubkey;
      let signatureOK = PeeringService.checkPeerSignature(remoteJsonPeer);
      if (!signatureOK) {
        watcher.writeStatus('Wrong signature for peer #' + remoteJsonPeer.pubkey);
      }
      try {
        yield PeeringService.submitP(remoteJsonPeer);
      } catch (err) {
        if (err != constants.ERROR.PEER.ALREADY_RECORDED && err != constants.ERROR.PEER.UNKNOWN_REFERENCE_BLOCK) {
          throw err;
        }
      }
    });
  }
};

function NodesMerkle (json) {
  
  const that = this;
  ["depth", "nodesCount", "leavesCount"].forEach(function (key) {
    that[key] = json[key];
  });

  this.merkleRoot = json.root;

  // var i = 0;
  // this.levels = [];
  // while(json && json.levels[i]){
  //   this.levels.push(json.levels[i]);
  //   i++;
  // }

  this.root = function () {
    return this.merkleRoot;
  };
}

function MultimeterWatcher() {

  const multi = multimeter(process);
  const charm = multi.charm;
  charm.on('^C', process.exit);
  charm.reset();

  multi.write('Progress:\n\n');

  multi.write("Download: \n");
  const downloadBar = multi("Download: \n".length, 3, {
    width : 20,
    solid : {
      text : '|',
      foreground : 'white',
      background : 'blue'
    },
    empty : { text : ' ' }
  });

  multi.write("Apply:    \n");
  const appliedBar = multi("Apply:    \n".length, 4, {
    width : 20,
    solid : {
      text : '|',
      foreground : 'white',
      background : 'blue'
    },
    empty : { text : ' ' }
  });

  multi.write('\nStatus: ');

  let xPos, yPos;
  charm.position( (x, y) => {
    xPos = x;
    yPos = y;
  });

  const writtens = [];
  this.writeStatus = (str) => {
    writtens.push(str);
    //require('fs').writeFileSync('writtens.json', JSON.stringify(writtens));
    charm
      .position(xPos, yPos)
      .erase('end')
      .write(str)
    ;
  };

  this.downloadPercent = (pct) => downloadBar.percent(pct);

  this.appliedPercent = (pct) => appliedBar.percent(pct);

  this.end = () => {
    multi.write('\nAll done.\n');
    multi.destroy();
  };

  downloadBar.percent(0);
  appliedBar.percent(0);
}

function LoggerWatcher() {

  let downPct = 0, appliedPct = 0, lastMsg;

  this.showProgress = () => logger.info('Downloaded %s%, Applied %s%', downPct, appliedPct);

  this.writeStatus = (str) => {
    if (str != lastMsg) {
      lastMsg = str;
      logger.info(str);
    }
  };

  this.downloadPercent = (pct) => {
    if (pct !== undefined) {
      let changed = pct > downPct;
      downPct = pct;
      if (changed) this.showProgress();
    }
    return downPct;
  };

  this.appliedPercent = (pct) => {
    if (pct !== undefined) {
      let changed = pct > appliedPct;
      appliedPct = pct;
      if (changed) this.showProgress();
    }
    return appliedPct;
  };

  this.end = () => {
  };

}

util.inherits(Synchroniser, stream.Duplex);
