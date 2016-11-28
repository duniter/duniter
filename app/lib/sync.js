"use strict";
const util         = require('util');
const stream       = require('stream');
const co           = require('co');
const Q            = require('q');
const _            = require('underscore');
const moment       = require('moment');
const contacter    = require('./contacter');
const hashf        = require('./ucp/hashf');
const dos2unix     = require('./system/dos2unix');
const logger       = require('./logger')('sync');
const rawer        = require('./ucp/rawer');
const constants    = require('../lib/constants');
const Peer         = require('../lib/entity/peer');
const multimeter   = require('multimeter');
const pulling      = require('../lib/pulling');
const makeQuerablePromise = require('../lib/querablep');

const CONST_BLOCKS_CHUNK = 250;
const EVAL_REMAINING_INTERVAL = 1000;
const CONST_MAX_SIMULTANEOUS_DOWNLOADS = 50;


module.exports = Synchroniser;

function Synchroniser (server, host, port, conf, interactive) {

  const that = this;

  let speed = 0, blocksApplied = 0;
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

  const contacterOptions = {
    timeout: constants.NETWORK.SYNC_LONG_TIMEOUT
  };

  const dal = server.dal;

  const logRemaining = (to) => co(function*() {
    const lCurrent = yield dal.getCurrentBlockOrNull();
    const localNumber = lCurrent ? lCurrent.number : -1;

    if (to > 1 && speed > 0) {
      const remain = (to - (localNumber + 1 + blocksApplied));
      const secondsLeft = remain / speed;
      const momDuration = moment.duration(secondsLeft*1000);
      watcher.writeStatus('Remaining ' + momDuration.humanize() + '');
    }
  });

  this.test = (to, chunkLen, askedCautious, nopeers) => co(function*() {
    const peering = yield contacter.statics.fetchPeer(host, port, contacterOptions);
    const peer = new Peer(peering);
    const node = yield peer.connect();
    return node.getCurrent();
  });

  this.sync = (to, chunkLen, askedCautious, nopeers) => co(function*() {

    try {

      const peering = yield contacter.statics.fetchPeer(host, port, contacterOptions);

      let peer = new Peer(peering);
      logger.info("Try with %s %s", peer.getURL(), peer.pubkey.substr(0, 6));
      let node = yield peer.connect();
      node.pubkey = peer.pubkey;
      logger.info('Sync started.');

      const fullSync = !to;

      //============
      // Blockchain headers
      //============
      logger.info('Getting remote blockchain info...');
      watcher.writeStatus('Connecting to ' + host + '...');
      const lCurrent = yield dal.getCurrentBlockOrNull();
      const localNumber = lCurrent ? lCurrent.number : -1;
      let rCurrent;
      if (isNaN(to)) {
        rCurrent = yield node.getCurrent();
      } else {
        rCurrent = yield node.getBlock(to);
      }
      to = rCurrent.number;

      //=======
      // Peers (just for P2P download)
      //=======
      let peers = [];
      if (!nopeers && (to - localNumber > 1000)) { // P2P download if more than 1000 blocs
        watcher.writeStatus('Peers...');
        const merkle = yield dal.merkleForPeers();
        const getPeers = node.getPeers.bind(node);
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
          peers = yield leavesToAdd.map((leaf) => co(function*() {
            try {
              const json3 = yield getPeers({ "leaf": leaf });
              const jsonEntry = json3.leaf.value;
              const endpoint = jsonEntry.endpoints[0];
              watcher.writeStatus('Peer ' + endpoint);
              return jsonEntry;
            } catch (e) {
              logger.warn("Could not get peer of leaf %s, continue...", leaf);
              return null;
            }
          }));
        }
        else {
          watcher.writeStatus('Peers already known');
        }
      }

      if (!peers.length) {
        peers.push(peer);
      }
      peers = peers.filter((p) => p);

      //============
      // Blockchain
      //============
      logger.info('Downloading Blockchain...');

      // We use cautious mode if it is asked, or not particulary asked but blockchain has been started
      const cautious = (askedCautious === true || (askedCautious === undefined && localNumber >= 0));
      const downloader = new P2PDownloader(localNumber, to, rCurrent.hash, CONST_MAX_SIMULTANEOUS_DOWNLOADS, peers, watcher);

      downloader.start();

      let lastPullBlock = null;
      let dao = pulling.abstractDao({

        // Get the local blockchain current block
        localCurrent: () => co(function*() {
          if (cautious) {
            return yield dal.getCurrentBlockOrNull();
          } else {
            if (lCurrent && !lastPullBlock) {
              lastPullBlock = lCurrent;
            }
            return lastPullBlock;
          }
        }),

        // Get the remote blockchain (bc) current block
        remoteCurrent: (peer) => Promise.resolve(rCurrent),

        // Get the remote peers to be pulled
        remotePeers: () => co(function*() {
          return [node];
        }),

        // Get block of given peer with given block number
        getLocalBlock: (number) => dal.getBlock(number),

        downloadBlocks: (thePeer, number) => co(function *() {
          // Note: we don't care about the particular peer asked by the method. We use the network instead.
          const numberOffseted = number - (localNumber + 1);
          const targetChunk = Math.floor(numberOffseted / CONST_BLOCKS_CHUNK);
          // Return the download promise! Simple.
          return downloader.getChunk(targetChunk);
        }),


        applyBranch: (blocks) => co(function *() {
          if (cautious) {
            for (const block of blocks) {
              yield dao.applyMainBranch(block);
            }
          } else {
            yield server.BlockchainService.saveBlocksInMainBranch(blocks);
          }
          lastPullBlock = blocks[blocks.length - 1];
          watcher.appliedPercent(Math.floor(blocks[blocks.length - 1].number / to * 100));
          return true;
        }),

        applyMainBranch: (block) => co(function *() {
          const addedBlock = yield server.BlockchainService.submitBlock(block, true, constants.FORK_ALLOWED);
          server.streamPush(addedBlock);
          watcher.appliedPercent(Math.floor(block.number / to * 100));
        }),

        // Eventually remove forks later on
        removeForks: () => co(function*() {}),

        // Tells wether given peer is a member peer
        isMemberPeer: (thePeer) => co(function *() {
          let idty = yield dal.getWrittenIdtyByPubkey(thePeer.pubkey);
          return (idty && idty.member) || false;
        })
      });

      const logInterval = setInterval(() => logRemaining(to), EVAL_REMAINING_INTERVAL);
      yield pulling.pull(conf, dao);

      // Finished blocks
      watcher.downloadPercent(100.0);
      watcher.appliedPercent(100.0);

      if (logInterval) {
        clearInterval(logInterval);
      }

      // Save currency parameters given by root block
      const rootBlock = yield server.dal.getBlock(0);
      yield BlockchainService.saveParametersForRootBlock(rootBlock);
      server.dal.blockDAL.cleanCache();

      //=======
      // Peers
      //=======
      if (!nopeers && fullSync) {
        watcher.writeStatus('Peers...');
        yield syncPeer(node);
        const merkle = yield dal.merkleForPeers();
        const getPeers = node.getPeers.bind(node);
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
            try {
              const json3 = yield getPeers({ "leaf": leaf });
              const jsonEntry = json3.leaf.value;
              const sign = json3.leaf.value.signature;
              const entry = {};
              ["version", "currency", "pubkey", "endpoints", "block"].forEach((key) => {
                entry[key] = jsonEntry[key];
              });
              entry.signature = sign;
              watcher.writeStatus('Peer ' + entry.pubkey);
              yield PeeringService.submitP(entry, false, to === undefined);
            } catch (e) {
              logger.warn(e);
            }
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
      that.push({ sync: false, msg: err });
      err && watcher.writeStatus(err.message || (err.uerr && err.uerr.message) || String(err));
      watcher.end();
      throw err;
    }
  });

  //============
  // Peer
  //============
  function syncPeer (node) {

    // Global sync vars
    const remotePeer = new Peer({});
    let remoteJsonPeer = {};

    return co(function *() {
      const json = yield node.getPeer();
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
        if (err.indexOf !== undefined && err.indexOf(constants.ERRORS.NEWER_PEER_DOCUMENT_AVAILABLE.uerr.message) !== -1 && err != constants.ERROR.PEER.UNKNOWN_REFERENCE_BLOCK) {
          throw err;
        }
      }
    });
  }
}

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

function P2PDownloader(localNumber, to, toHash, maxParallelDownloads, peers, watcher) {

  const that = this;
  const PARALLEL_PER_CHUNK = 1;
  const MAX_DELAY_PER_DOWNLOAD = 15000;
  const NO_NODES_AVAILABLE = "No node available for download";
  const TOO_LONG_TIME_DOWNLOAD = "No answer after " + MAX_DELAY_PER_DOWNLOAD + "ms, will retry download later.";
  const nbBlocksToDownload = Math.max(0, to - localNumber);
  const numberOfChunksToDownload = Math.ceil(nbBlocksToDownload / CONST_BLOCKS_CHUNK);
  const chunks          = Array.from({ length: numberOfChunksToDownload }).map(() => null);
  const processing      = Array.from({ length: numberOfChunksToDownload }).map(() => false);
  const handler         = Array.from({ length: numberOfChunksToDownload }).map(() => null);
  const resultsDeferers = Array.from({ length: numberOfChunksToDownload }).map(() => null);
  const resultsData     = Array.from({ length: numberOfChunksToDownload }).map((unused, index) => new Promise((resolve, reject) => {
    resultsDeferers[index] = { resolve, reject };
  }));

  // Create slots of download, in a ready stage
  let downloadSlots = Math.min(maxParallelDownloads, peers.length);

  let nodes = {};

  /**
   * Get a list of P2P nodes to use for download.
   * If a node is not yet correctly initialized (we can test a node before considering it good for downloading), then
   * this method would not return it.
   */
  const getP2Pcandidates = () => co(function*() {
    let promises = peers.reduce((chosens, other, index) => {
      if (!nodes[index]) {
        // Create the node
        let p = new Peer(peers[index]);
        nodes[index] = makeQuerablePromise(co(function*() {
          // We wait for the download process to be triggered
          // yield downloadStarter;
          // if (nodes[index - 1]) {
          //   try { yield nodes[index - 1]; } catch (e) {}
          // }
          const node = yield p.connect();
          // We initialize nodes with the worst possible notation
          node.tta = MAX_DELAY_PER_DOWNLOAD;
          return node;
        }));
        chosens.push(nodes[index]);
      } else {
        chosens.push(nodes[index]);
      }
      // Continue
      return chosens;
    }, []);
    let candidates = yield promises;
    candidates.forEach((c) => {
      c.tta = c.tta || 0; // By default we say a node is super slow to answer
      c.ttas = c.ttas || []; // Memorize the answer delays
    });
    if (candidates.length === 0) {
      throw NO_NODES_AVAILABLE;
    }
    // We remove the nodes impossible to reach (timeout)
    let withGoodDelays = _.filter(candidates, (c) => c.tta <= MAX_DELAY_PER_DOWNLOAD);
    if (withGoodDelays.length === 0) {
      // No node can be reached, we can try to lower the number of nodes on which we download
      downloadSlots = Math.floor(downloadSlots / 2);
      // We reinitialize the nodes
      nodes = {};
      // And try it all again
      return getP2Pcandidates();
    }
    const parallelMax = Math.min(PARALLEL_PER_CHUNK, withGoodDelays.length);
    withGoodDelays = _.sortBy(withGoodDelays, (c) => c.tta);
    withGoodDelays = withGoodDelays.slice(0, parallelMax);
    withGoodDelays.forEach((c) =>
      c.tta = (c.tta * 2)) // We temporarily double the tta, because we make a request (if we send a request, obviously the node will need approx. tta time to answer))
    return withGoodDelays;
  });

  /**
   * Download a chunk of blocks using P2P network through BMA API.
   * @param from The starting block to download
   * @param count The number of blocks to download.
   * @param chunkIndex The # of the chunk in local algorithm (logging purposes only)
   */
  const p2pDownload = (from, count, chunkIndex) => co(function*() {
    let candidates = yield getP2Pcandidates();
    // Book the nodes
    return yield raceOrCancelIfTimeout(MAX_DELAY_PER_DOWNLOAD, candidates.map((node) => co(function*() {
      try {
        const start = Date.now();
        handler[chunkIndex] = node;
        watcher.writeStatus('Getting chunck #' + chunkIndex + '/' + (numberOfChunksToDownload - 1) + ' from ' + from + ' to ' + (from + count - 1) + ' on peer ' + [node.host, node.port].join(':'));
        let blocks = yield node.getBlocks(count, from);
        node.ttas.push(Date.now() - start);
        // Only keep a flow of 5 ttas for the node
        if (node.ttas.length > 5) node.ttas.shift();
        // Average time to answer
        node.tta = Math.round(node.ttas.reduce((sum, tta) => sum + tta, 0) / node.ttas.length);
        watcher.writeStatus('GOT chunck #' + chunkIndex + '/' + (numberOfChunksToDownload - 1) + ' from ' + from + ' to ' + (from + count - 1) + ' on peer ' + [node.host, node.port].join(':'));
        return blocks;
      } catch (e) {
        // If a node throws an error, do not cancel the download
        return new Promise((resolve, reject) => setTimeout(reject, MAX_DELAY_PER_DOWNLOAD));
      }
    })));
  });

  /**
   * Function for downloading a chunk by its number.
   * @param index Number of the chunk.
   */
  const downloadChunk = (index) => co(function*() {
    // The algorithm to download a chunk
    const from = localNumber + 1 + index * CONST_BLOCKS_CHUNK;
    let count = CONST_BLOCKS_CHUNK;
    if (index == numberOfChunksToDownload - 1) {
      count = nbBlocksToDownload % CONST_BLOCKS_CHUNK || CONST_BLOCKS_CHUNK;
    }
    try {
      return yield p2pDownload(from, count, index);
    } catch (e) {
      logger.error(e);
      return downloadChunk(index);
    }
  });

  const slots = [];
  const downloads = {};

  /**
   * Utility function that starts a race between promises but cancels it if no answer is found before `timeout`
   * @param timeout
   * @param races
   * @returns {Promise}
   */
  const raceOrCancelIfTimeout = (timeout, races) => {
    return Promise.race([
      // Process the race, but cancel it if we don't get an anwser quickly enough
      new Promise((resolve, reject) => {
        setTimeout(() => {
          reject(TOO_LONG_TIME_DOWNLOAD);
        }, MAX_DELAY_PER_DOWNLOAD);
      })
    ].concat(races));
  };

  /**
   * Triggers for starting the download.
   */
  let startResolver;
  const downloadStarter = new Promise((resolve, reject) => startResolver = resolve);

  const chainsCorrectly = (blocks, index) => co(function*() {

    if (!blocks.length) {
      logger.error('No block was downloaded');
      return false;
    }

    for (let i = blocks.length - 1; i > 0; i--) {
      if (blocks[i].number !== blocks[i - 1].number + 1 || blocks[i].previousHash !== blocks[i - 1].hash) {
        logger.error("Blocks do not chaing correctly", blocks[i].number);
        return false;
      }
      if (blocks[i].version != blocks[i - 1].version && blocks[i].version != blocks[i - 1].version + 1) {
        logger.error("Version cannot be downgraded", blocks[i].number);
        return false;
      }
    }

    // Check hashes
    for (let i = 0; i < blocks.length; i++) {
      // Note: the hash, in Duniter, is made only on the **signing part** of the block: InnerHash + Nonce
      if (blocks[i].version >= 3) {
        for (const tx of blocks[i].transactions) {
          tx.version = 3;
        }
      }
      if (blocks[i].inner_hash !== hashf(rawer.getBlockInnerPart(blocks[i])).toUpperCase()) {
        logger.error("Inner hash of block#%s from %s does not match", blocks[i].number);
        return false;
      }
      if (blocks[i].hash !== hashf(rawer.getBlockInnerHashAndNonceWithSignature(blocks[i])).toUpperCase()) {
        logger.error("Hash of block#%s from %s does not match", blocks[i].number);
        return false;
      }
    }

    const lastBlockOfChunk = blocks[blocks.length - 1];
    if (lastBlockOfChunk.number == to && lastBlockOfChunk.hash != toHash) {
      // Top chunk
      logger.error('Top block is not on the right chain');
      return false;
    } else {
      // Chaining between downloads
      const previousChunk = yield that.getChunk(index + 1);
      const blockN = blocks[blocks.length - 1]; // The block n
      const blockNp1 = previousChunk[0]; // The block n + 1
      if (blockN && blockNp1 && (blockN.number + 1 !== blockNp1.number || blockN.hash != blockNp1.previousHash)) {
        logger.error('Chunk is not referenced by the upper one');
        return false;
      }
    }
    return true;
  });

  /**
   * Download worker
   * @type {*|Promise} When finished.
   */
  co(function*() {
    yield downloadStarter;
    let doneCount = 0, resolvedCount = 0;
    while (resolvedCount < chunks.length) {
      doneCount = 0;
      resolvedCount = 0;
      // Add as much possible downloads as possible, and count the already done ones
      for (let i = chunks.length - 1; i >= 0; i--) {
        if (chunks[i] === null && !processing[i] && slots.indexOf(i) === -1 && slots.length < downloadSlots) {
          slots.push(i);
          processing[i] = true;
          downloads[i] = makeQuerablePromise(downloadChunk(i)); // Starts a new download
        } else if (downloads[i] && downloads[i].isFulfilled() && processing[i]) {
          doneCount++;
        }
        // We count the number of perfectly downloaded & validated chunks
        if (chunks[i]) {
          resolvedCount++;
        }
      }
      watcher.downloadPercent(Math.round(doneCount / numberOfChunksToDownload * 100));
      let races = slots.map((i) => downloads[i]);
      if (races.length) {
        try {
          yield raceOrCancelIfTimeout(MAX_DELAY_PER_DOWNLOAD, races);
        } catch (e) {
          logger.warn(e);
        }
        for (let i = 0; i < slots.length; i++) {
          // We must know the index of what resolved/rejected to free the slot
          const doneIndex = slots.reduce((found, realIndex, index) => {
            if (found !== null) return found;
            if (downloads[realIndex].isFulfilled()) return index;
            return null;
          }, null);
          if (doneIndex !== null) {
            const realIndex = slots[doneIndex];
            if (downloads[realIndex].isResolved()) {
              const p = new Promise((resolve, reject) => co(function*() {
                const blocks = yield downloads[realIndex];
                if (realIndex < chunks.length - 1) {
                  // We must wait for NEXT blocks to be STRONGLY validated before going any further, otherwise we
                  // could be on the wrong chain
                  yield that.getChunk(realIndex + 1);
                }
                const chainsWell = yield chainsCorrectly(blocks, realIndex);
                if (chainsWell) {
                  // Chunk is COMPLETE
                  logger.warn("Chunk #%s is COMPLETE from %s", realIndex, [handler[realIndex].host, handler[realIndex].port].join(':'));
                  chunks[realIndex] = blocks;
                  resultsDeferers[realIndex].resolve(chunks[realIndex]);
                } else {
                  logger.warn("Chunk #%s DOES NOT CHAIN CORRECTLY from %s", realIndex, [handler[realIndex].host, handler[realIndex].port].join(':'));
                  // Penality on this node to avoid its usage
                  handler[realIndex].tta += MAX_DELAY_PER_DOWNLOAD;
                  // Need a retry
                  processing[realIndex] = false;
                }
              }));
            } else {
              processing[realIndex] = false; // Need a retry
            }
            slots.splice(doneIndex, 1);
          }
        }
      }
      // Wait a bit
      yield new Promise((resolve, reject) => setTimeout(resolve, 10));
    }
  })
    .catch((e) => {
      logger.error('Fatal error in the downloader:');
      logger.error(e);
    });

  /**
   * PUBLIC API
   */

  /***
   * Triggers the downloading
   */
  this.start  = () => startResolver();

  /***
   * Promises a chunk to be downloaded and returned
   * @param index The number of the chunk to download & return
   */
  this.getChunk = (index) => resultsData[index] || Promise.resolve([]);
}

util.inherits(Synchroniser, stream.Duplex);
