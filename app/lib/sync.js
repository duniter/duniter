"use strict";
const util       = require('util');
const stream     = require('stream');
const co         = require('co');
const _          = require('underscore');
const moment     = require('moment');
const hashf      = require('./ucp/hashf');
const dos2unix   = require('./system/dos2unix');
const logger     = require('./logger')('sync');
const rawer      = require('./ucp/rawer');
const constants  = require('../lib/constants');
const Peer       = require('../lib/entity/peer');
const multimeter = require('multimeter');
const pulling        = require('../lib/pulling');

const CONST_BLOCKS_CHUNK = 500;
const EVAL_REMAINING_INTERVAL = 1000;
const COMPUTE_SPEED_ON_COUNT_CHUNKS = 8;

module.exports = Synchroniser;

function Synchroniser (server, host, port, conf, interactive) {

  const that = this;

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

  this.sync = (to, chunkLen, askedCautious, nopeers) => co(function*() {
    const node = yield getVucoin(host, port, vucoinOptions);
    logger.info('Sync started.');
    //============
    // Blockchain
    //============
    logger.info('Downloading Blockchain...');
    watcher.writeStatus('Connecting to ' + host + '...');
    const lCurrent = yield dal.getCurrentBlockOrNull();
    const localNumber = lCurrent ? lCurrent.number : -1;

    const rCurrent = yield Q.nbind(node.blockchain.current, node);
    const remoteVersion = rCurrent.version;

    // We use cautious mode if it is asked, or not particulary asked but blockchain has been started
    const cautious = (askedCautious === true || (askedCautious === undefined && localNumber >= 0));

    if (remoteVersion < 2) {
      throw Error("Could not sync with remote host. UCP version is " + remoteVersion + " (Must be >= 2)")
    }

    let dao = pulling.abstractDao({
      lastBlock: null,

      // Get the local blockchain current block
      localCurrent: () => dal.getCurrentBlockOrNull(),

      // Get the remote blockchain (bc) current block
      remoteCurrent: (thePeer) => Q.nfcall(thePeer.blockchain.current),

      // Get the remote peers to be pulled
      remotePeers: () => Promise([node]),

      // Get block of given peer with given block number
      getLocalBlock: (number) => dal.getBlockOrNull(number),

      // Get block of given peer with given block number
      getRemoteBlock: (thePeer, number) => co(function *() {
        let block = null;
        try {
          block = yield Q.nfcall(thePeer.blockchain.block, number);
          Transaction.statics.setIssuers(block.transactions);
          return block;
        } catch (e) {
          if (e.httpCode != 404) {
            throw e;
          }
        }
        return block;
      }),

      applyMainBranch: (block) => co(function *() {
        if (cautious) {
          let addedBlock = yield server.BlockchainService.submitBlock(block, true, constants.FORK_ALLOWED);
          server.streamPush(addedBlock);
        } else {
          yield server.BlockchainService.saveBlocksInMainBranch([block], remoteNumber);
          if (this.lastBlock) {
            yield server.BlockchainService.obsoleteInMainBranch(this.lastBlock);
          }
          this.lastBlock = block;
        }
      }),

      // Eventually remove forks later on
      removeForks: () => Promise(),

      // Tells wether given peer is a member peer
      isMemberPeer: (thePeer) => co(function *() {
        let idty = yield dal.getWrittenIdtyByPubkey(thePeer.pubkey);
        return (idty && idty.member) || false;
      }),

      downloadBlocks: (thePeer, fromNumber, count) => Q.nfcall(thePeer.blockchain.blocks, count, fromNumber)
    });

    yield pulling.pull(conf, dao);

    // Finished blocks
    watcher.appliedPercent(100.0);

    // Save currency parameters given by root block
    const rootBlock = yield server.dal.getBlock(0);
    yield BlockchainService.saveParametersForRootBlock(rootBlock);
  });

  function getVucoin(theHost, thePort, options) {
    return Promise(function (resolve, reject) {
      vucoin(theHost, thePort, function (err, node) {
        if (err) {
          return reject('Cannot sync: ' + err);
        }
        resolve(node);
      }, options);
    });
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
