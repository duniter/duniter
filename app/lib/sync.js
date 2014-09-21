var async            = require('async');
var _                = require('underscore');
var sha1             = require('sha1');
var merkle           = require('merkle');
var vucoin           = require('vucoin');
var eventStream      = require('event-stream');
var inquirer         = require('inquirer');
var unix2dos         = require('./unix2dos');
var parsers          = require('./streams/parsers/doc');
var extractSignature = require('./streams/extractSignature');
var logger           = require('./logger')('sync');

var CONST_FORCE_TX_PROCESSING = false;

module.exports = function Synchroniser (server, host, port, authenticated, conf) {
  var that = this;

  // Services
  var TransactionService = server.TransactionsService;
  var PeeringService     = server.PeeringService;
  var ParametersService  = server.ParametersService;
  var KeychainService    = server.KeychainService;

  // Models
  var KeyBlock      = server.conn.model('KeyBlock');
  var Merkle        = server.conn.model('Merkle');
  var Key           = server.conn.model('Key');
  var Membership    = server.conn.model('Membership');
  var Transaction   = server.conn.model('Transaction');
  var Peer          = server.conn.model('Peer');
  var Configuration = server.conn.model('Configuration');
  
  this.remoteFingerprint = null;

  this.sync = function (done) {
    logger.info('Connecting remote host...');
    vucoin(host, port, authenticated, function (err, node) {
      if(err){
        done('Cannot sync: ' + err);
        return;
      }

      // Global sync vars
      var remotePeer = new Peer({});
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
        function (pubkey, next){
          remotePubkey = pubkey;
          node.network.peering.get(next);
        },
        function (json, next){
          remotePeer.copyValuesFrom(json);
          var entry = remotePeer.getRaw();
          var signature = unix2dos(remotePeer.signature);
          // Parameters
          if(!(entry && signature)){
            callback('Requires a peering entry + signature');
            return;
          }

          // Check signature's key ID
          var keyID = jpgp().signature(signature).issuer();
          if(!(keyID && keyID.length == 16)){
            callback('Cannot identify signature issuer`s keyID');
            return;
          }
          next(null, entry + signature, keyID);
        },
        function (signedPR, keyID, next) {
          var peer;
          async.waterfall([
            function (next){
              parsers.parsePeer(next).asyncWrite(signedPR, next);
            },
            function (obj, next) {
              obj.pubkey = remotePubkey;
              peer = obj;
              // Temporarily manage ALL keys for sync
              server.conf.kmanagement = "ALL";
              PeeringService.submit(peer, next);
            },
          ], function (err) {
            next(err, peer);
          });
        },
        function (recordedPR, next){
          that.remoteFingerprint = recordedPR.fingerprint;
          next();
        },

        //============
        // Parameters
        //============
        function (next){
          node.keychain.parameters(next);
        },
        function (params, next){
          conf.currency    = params["currency"];
          conf.sigDelay    = params["sigDelay"];
          conf.sigValidity = params["sigValidity"];
          conf.sigQty      = params["sigQty"];
          conf.stepMax     = params["stepMax"];
          conf.powZeroMin  = params["powZeroMin"];
          conf.powPeriod   = params["powPeriod"];
          conf.save(function (err) {
            next(err);
          });
        },

        //============
        // Keychain
        //============
        function (next){
          node.keychain.current(next);
        },
        function (current, next) {
          KeychainService.checkWithLocalTimestamp = false;
          var numbers = _.range(current.number + 1);
          async.forEachSeries(numbers, function(number, callback){
            async.waterfall([
              function (next){
                node.keychain.keyblock(number, next);
              },
              function (keyblock, next){
                var block = new KeyBlock(keyblock);
                console.log('keyblock#' + block.number, sha1(block.getRawSigned()));
                var keyID = jpgp().signature(block.signature).issuer();
                var newPubkeys = block.getNewPubkeys();
                // Save pubkeys + block
                async.waterfall([
                  function (next){
                    if (block.number == 0) {
                      var signatory = null;
                      newPubkeys.forEach(function(key){
                        if (key.hasSubkey(keyID))
                          signatory = key;
                      });
                      if (!signatory) {
                        next('Root block signatory not found');
                        return;
                      }
                      next(null, { fingerprint: signatory.getFingerprint(), raw: signatory.getArmored() });
                    } else {
                      PublicKey.getTheOne(keyID, next);
                    }
                  },
                  function (pubkey, next){
                    keyblock.pubkey = pubkey;
                    jpgp()
                      .publicKey(pubkey.raw)
                      .data(block.getRaw())
                      .signature(block.signature)
                      .verify(next);
                  },
                  function (verified, next){
                    async.forEach(newPubkeys, function(newPubkey, callback){
                      async.waterfall([
                        function (next){
                          parsers.parsePubkey(callback).asyncWrite(unix2dos(newPubkey.getArmored()), next);
                        },
                        function (obj, next){
                          PublicKeyService.submitPubkey(obj, next);
                        },
                      ], callback);
                    }, next);
                  },
                  function (next){
                    KeychainService.submitKeyBlock(keyblock, next);
                  },
                ], next);
              },
            ], callback);
          }, next)
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
