var async            = require('async');
var _                = require('underscore');
var sha1             = require('sha1');
var merkle           = require('merkle');
var vucoin           = require('vucoin');
var eventStream      = require('event-stream');
var inquirer         = require('inquirer');
var dos2unix         = require('./dos2unix');
var parsers          = require('./streams/parsers/doc');
var extractSignature = require('./streams/extractSignature');
var localValidator   = require('./localValidator');
var logger           = require('./logger')('sync');

var CONST_FORCE_TX_PROCESSING = false;

module.exports = function Synchroniser (server, host, port, conf) {
  var that = this;

  // Services
  var TransactionService = server.TransactionsService;
  var PeeringService     = server.PeeringService;
  var ParametersService  = server.ParametersService;
  var BlockchainService  = server.BlockchainService;

  // Models
  var Block      = server.conn.model('Block');
  var Merkle        = server.conn.model('Merkle');
  var Membership    = server.conn.model('Membership');
  var Transaction   = server.conn.model('Transaction');
  var Peer          = server.conn.model('Peer');
  var Configuration = server.conn.model('Configuration');
  
  this.remoteFingerprint = null;

  this.sync = function (done) {
    logger.info('Connecting remote host...');
    vucoin(host, port, function (err, node) {
      if(err){
        done('Cannot sync: ' + err);
        return;
      }

      // Global sync vars
      var remotePeer = new Peer({});
      var remoteJsonPeer = {};
      var remoteCurrentNumber;
      var remotePubkey;

      async.waterfall([
        function (next){
          logger.info('Sync started.');
          next();
        },

        //============
        // Peer
        //============
        function (next){
          node.network.peering.get(next);
        },
        function (json, next){
          remotePubkey = json.pubkey;
          remotePeer.copyValuesFrom(json);
          var entry = remotePeer.getRaw();
          var signature = dos2unix(remotePeer.signature);
          // Parameters
          if(!(entry && signature)){
            callback('Requires a peering entry + signature');
            return;
          }

          remoteJsonPeer = json;
          remoteJsonPeer.pub = json.pubkey;
          remoteJsonPeer.status = "NOTHING";
          localValidator().checkPeerSignature(remoteJsonPeer, next);
        },
        function (next) {
          async.waterfall([
            function (next){
              PeeringService.submit(remoteJsonPeer, next);
            },
          ], function (err) {
            next(err);
          });
        },

        //============
        // Blockchain
        //============
        function (next){
          logger.info('Downloading Blockchain...');
          async.parallel({
            localCurrent: function (next) {
              BlockchainService.current(next);
            },
            remoteCurrent: function (next) {
              node.blockchain.current(function (err, current) {
                next(null, err ? null : current);
              });
            }
          }, next);
        },
        function (res, next) {
          var lCurrent = res.localCurrent;
          var rCurrent = res.remoteCurrent;
          var i = lCurrent ? lCurrent.number + 1 : 0;
          async.whilst(
            function () { return rCurrent ? i <= rCurrent.number : false; },
            function (callback) {
                async.waterfall([
                  function (next) {
                    node.blockchain.block(i, next);
                  },
                  function (block, next) {
                    BlockchainService.submitBlock(block, next);
                  },
                  function (block, next) {
                    i++;
                    next();
                  }
                ], callback);
            }, next);
        },

        //==============
        // Transactions
        //==============
        // function (next){
        //   Key.find({ managed: true }, next);
        // },
        // function (keys, next) {
        //   async.forEachSeries(keys, function (key, onKeyDone) {
        //     syncTransactionsOfKey(node, key.fingerprint, onKeyDone);
        //   }, next);
        // },

        //=======
        // Peers
        //=======
        function (next){
          Merkle.peers(next);
        },
        function (merkle, next) {
          node.network.peering.peers.get({}, function (err, json) {
            var rm = new NodesMerkle(json);
            if(rm.root() != merkle.root()){
              var leavesToAdd = [];
              node.network.peering.peers.get({ leaves: true }, function (err, json) {
                _(json.leaves).forEach(function(leaf){
                  if(merkle.leaves().indexOf(leaf) == -1){
                    leavesToAdd.push(leaf);
                  }
                });
                var hashes = [];
                async.forEachSeries(leavesToAdd, function(leaf, callback){
                  async.waterfall([
                    function (cb) {
                      node.network.peering.peers.get({ "leaf": leaf }, cb);
                    },
                    function (json, cb) {
                      var jsonEntry = json.leaf.value;
                      var sign = json.leaf.value.signature;
                      var entry = {};
                      ["version", "currency", "fingerprint", "endpoints"].forEach(function (key) {
                        entry[key] = jsonEntry[key];
                      });
                      entry.signature = sign;
                      entry.pubkey = { fingerprint: entry.fingerprint };
                      logger.info('Peer 0x' + entry.fingerprint);
                      PeeringService.submit(entry, function (err) {
                        cb();
                      });
                    }
                  ], callback);
                }, function(err, result){
                  next(err);
                });
              });
            }
            else next();
          });
        },
      ], function (err, result) {
        logger.info('Sync finished.');
        done(err);
      });
    })
  }
}

function NodesMerkle (json) {
  
  var that = this;
  var merkleRoot = null;
  ["depth", "nodesCount", "leavesCount"].forEach(function (key) {
    that[key] = json[key];
  });

  this.merkleRoot = json["root"];

  // var i = 0;
  // this.levels = [];
  // while(json && json.levels[i]){
  //   this.levels.push(json.levels[i]);
  //   i++;
  // }

  this.root = function () {
    return this.merkleRoot;
  }
}

function choose (question, defaultValue, ifOK, ifNotOK) {
  inquirer.prompt([{
    type: "confirm",
    name: "q",
    message: question,
    default: defaultValue,
  }], function (answer) {
    answer.q ? ifOK() : ifNotOK();
  });
}
