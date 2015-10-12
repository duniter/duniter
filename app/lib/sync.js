"use strict";
var co = require('co');
var async            = require('async');
var _                = require('underscore');
var Q                = require('q');
var sha1             = require('sha1');
var moment           = require('moment');
var vucoin           = require('vucoin');
var dos2unix         = require('./dos2unix');
var localValidator   = require('./localValidator');
var logger           = require('./logger')('sync');
var rawer            = require('../lib/rawer');
var constants        = require('../lib/constants');
var Peer             = require('../lib/entity/peer');
var multimeter = require('multimeter');

var CONST_BLOCKS_CHUNK = 500;
var EVAL_REMAINING_INTERVAL = 1000;

module.exports = function Synchroniser (server, host, port, conf, interactive) {

  var speed = 0, syncStart = new Date(), blocksApplied = 0;
  var watcher = interactive ? new MultimeterWatcher() : new LoggerWatcher();
  var initialForkSize = conf.branchesWindowSize;

  // Disable branching for the main synchronization parts
  conf.branchesWindowSize = 0;

  if (interactive) {
    require('log4js').configure({
      "appenders": [
        //{ category: "db1", type: "console" }
      ]
    });
  }

  // Services
  var PeeringService     = server.PeeringService;
  var BlockchainService  = server.BlockchainService;

  var dal = server.dal;

  var vucoinOptions = {
    timeout: conf.timeout || constants.NETWORK.DEFAULT_TIMEOUT
  };

  this.sync = (to, nocautious, done) => {
    var cautious = !nocautious;
    logger.info('Connecting remote host...');
    return co(function *() {
      var node = yield getVucoin(host, port, vucoinOptions);
      logger.info('Sync started.');
      //============
      // Blockchain
      //============
      logger.info('Downloading Blockchain...');
      watcher.writeStatus('Connecting to ' + host + '...');
      var lastSavedNumber = yield dal.getLastSavedBlockFileNumber();
      var lCurrent = yield dal.getCurrentBlockOrNull();
      var rCurrent = yield Q.nbind(node.blockchain.current, node)();
      var localNumber = lCurrent ? lCurrent.number : -1;
      var remoteNumber = Math.min(rCurrent.number, to || rCurrent.number);

      // Recurrent checking
      setInterval(() => {
        if (remoteNumber > 1 && speed > 0) {
          var remain = (remoteNumber - (localNumber + 1 + blocksApplied));
          var secondsLeft = remain / speed;
          var momDuration = moment.duration(secondsLeft*1000);
          watcher.writeStatus('Remaining ' + momDuration.humanize() + '');
        }
      }, EVAL_REMAINING_INTERVAL);

      // Prepare chunks of blocks to be downloaded
      var chunks = [];
      for (let i = lastSavedNumber + 1; i <= remoteNumber; i = i + CONST_BLOCKS_CHUNK) {
        chunks.push([i, Math.min(i + CONST_BLOCKS_CHUNK - 1, remoteNumber)]);
      }

      // Prepare the array of download promises. The first is the promise of already downloaded blocks
      // which has not been applied yet.
      var toApply = [Q.defer()].concat(chunks.map(() => Q.defer()));
      toApply[0].resolve([localNumber + 1, lastSavedNumber]);

      // Chain download promises, and start download right now
      chunks.map((chunk, index) =>
        // When previous download is done
        toApply[index].promise.then(() =>
            co(function *() {
              // Download blocks and save them
              watcher.downloadPercent(Math.floor(chunk[0] / remoteNumber * 100));
              logger.info('Blocks #%s to #%s...', chunk[0], chunk[1]);
              var blocks = yield Q.nfcall(node.blockchain.blocks, chunk[1] - chunk[0] + 1, chunk[0]);
              watcher.downloadPercent(Math.floor(chunk[1] / remoteNumber * 100));
              for (let i = 0; i < blocks.length; i++) {
                yield server.dal.saveBlockInFile(blocks[i], false);
              }
            })
              // Resolve the promise
              .then(() => toApply[index + 1].resolve(chunk))
              .catch((err) => toApply[index + 1].reject(err))
      ));

      for (let i = 0; i < toApply.length; i++) {
        // Wait for download chunk to be completed
        let range = yield toApply[i].promise;
        // Apply downloaded blocks
        for (var j = range[0]; j < range[1] + 1; j++) {
          yield server.dal.getBlock(j).then((block) => applyGivenBlock(cautious, remoteNumber)(block));
        }
      }
      yield Q.all(toApply).then(() => watcher.appliedPercent(100.0));

      //=======
      // Peers
      //=======
      watcher.writeStatus('Peers...');
      yield syncPeer(node);
      var merkle = yield dal.merkleForPeers();
      var getPeers = Q.nbind(node.network.peering.peers.get, node);
      var json2 = yield getPeers({});
      var rm = new NodesMerkle(json2);
      if(rm.root() != merkle.root()){
        var leavesToAdd = [];
        var json = yield getPeers({ leaves: true });
        _(json.leaves).forEach((leaf) => {
          if(merkle.leaves().indexOf(leaf) == -1){
            leavesToAdd.push(leaf);
          }
        });
        for (let i = 0; i < leavesToAdd.length; i++) {
          var leaf = leavesToAdd[i];
          var json3 = yield getPeers({ "leaf": leaf });
          var jsonEntry = json3.leaf.value;
          var sign = json3.leaf.value.signature;
          var entry = {};
          ["version", "currency", "pubkey", "endpoints", "block"].forEach((key) => {
            entry[key] = jsonEntry[key];
          });
          entry.signature = sign;
          watcher.writeStatus('Peer ' + entry.pubkey);
          logger.info('Peer ' + entry.pubkey);
          return Q.nbind(PeeringService.submit, PeeringService, entry);
        }
      }
      else {
        watcher.writeStatus('Peers already known');
      }
    })
      .then(() => {
        watcher.end();
        logger.info('Sync finished.');
        done();
      })
      .catch((err) => {
        err && watcher.writeStatus(err);
        watcher.end();
        logger.info('Sync finished.');
        done(err);
      });
  };

  function getVucoin(theHost, thePort, options) {
    return Q.Promise(function(resolve, reject){
      vucoin(theHost, thePort, function (err, node) {
        if(err){
          return reject('Cannot sync: ' + err);
        }
        resolve(node);
      }, options);
    });
  }

  function applyGivenBlock(cautious, remoteCurrentNumber) {
    return function (block) {
      // Rawification of transactions
      block.transactions.forEach(function (tx) {
        tx.raw = ["TX", "1", tx.signatories.length, tx.inputs.length, tx.outputs.length, tx.comment ? '1' : '0'].join(':') + '\n';
        tx.raw += tx.signatories.join('\n') + '\n';
        tx.raw += tx.inputs.join('\n') + '\n';
        tx.raw += tx.outputs.join('\n') + '\n';
        if (tx.comment)
          tx.raw += tx.comment + '\n';
        tx.raw += tx.signatures.join('\n') + '\n';
        tx.version = 1;
        tx.currency = conf.currency;
        tx.issuers = tx.signatories;
        tx.hash = ("" + sha1(rawer.getTransaction(tx))).toUpperCase();
      });
      blocksApplied++;
      speed = blocksApplied / Math.round(Math.max((new Date() - syncStart) / 1000, 1));
      if (watcher.appliedPercent() != Math.floor(block.number / remoteCurrentNumber * 100)) {
        watcher.appliedPercent(Math.floor(block.number / remoteCurrentNumber * 100));
      }
      if (block.number >= remoteCurrentNumber - initialForkSize) {
        // Enables again branching for the lasts blocks
        conf.branchesWindowSize = initialForkSize;
      }
      return BlockchainService.submitBlock(block, cautious);
    };
  }

  //============
  // Peer
  //============
  function syncPeer (node) {
    return Q.Promise(function(resolve, reject){

      // Global sync vars
      var remotePeer = new Peer({});
      var remoteJsonPeer = {};

      async.waterfall([
        function (next){
          node.network.peering.get(next);
        },
        function (json, next){
          remotePeer.copyValuesFrom(json);
          var entry = remotePeer.getRaw();
          var signature = dos2unix(remotePeer.signature);
          // Parameters
          if(!(entry && signature)){
            next('Requires a peering entry + signature');
            return;
          }

          remoteJsonPeer = json;
          remoteJsonPeer.pubkey = json.pubkey;
          localValidator().checkPeerSignature(remoteJsonPeer, next);
        },
        function (next) {
          async.waterfall([
            function (next){
              PeeringService.submit(remoteJsonPeer, function (err) {
                next(err == constants.ERROR.PEER.ALREADY_RECORDED ? null : err);
              });
            }
          ], function (err) {
            next(err);
          });
        }
      ], (err, res) => {
        if (err) {
          return reject(err);
        }
        resolve(res);
      });
    });
  }
};

function NodesMerkle (json) {
  
  var that = this;
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

  var multi = multimeter(process);
  var charm = multi.charm;
  charm.on('^C', process.exit);
  charm.reset();

  multi.write('Progress:\n\n');

  multi.write("Download: \n");
  var downloadBar = multi("Download: \n".length, 3, {
    width : 20,
    solid : {
      text : '|',
      foreground : 'white',
      background : 'blue'
    },
    empty : { text : ' ' }
  });

  multi.write("Apply:    \n");
  var appliedBar = multi("Apply:    \n".length, 4, {
    width : 20,
    solid : {
      text : '|',
      foreground : 'white',
      background : 'blue'
    },
    empty : { text : ' ' }
  });

  multi.write('\nStatus: ');

  var xPos, yPos;
  charm.position(function (x, y) {
    xPos = x;
    yPos = y;
  });

  var writtens = [];
  this.writeStatus = function(str) {
    writtens.push(str);
    require('fs').writeFileSync('writtens.json', JSON.stringify(writtens));
    charm
      .position(xPos, yPos)
      .erase('end')
      .write(str)
    ;
  };

  this.downloadPercent = function(pct) {
    return downloadBar.percent(pct);
  };

  this.appliedPercent = function(pct) {
    return appliedBar.percent(pct);
  };

  this.end = function() {
    multi.write('\nAll done.\n');
    multi.destroy();
  };

  downloadBar.percent(0);
  appliedBar.percent(0);
}

function LoggerWatcher() {

  var downPct = 0, appliedPct = 0;

  this.writeStatus = function(str) {
    logger.info(str);
  };

  this.downloadPercent = function(pct) {
    downPct = pct;
    return downPct;
  };

  this.appliedPercent = function(pct) {
    appliedPct = pct;
    return appliedPct;
  };

  this.end = function() {
  };

}