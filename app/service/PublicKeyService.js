var jpgp   = require('../lib/jpgp');
var async  = require('async');
var _      = require('underscore');
var merkle = require('merkle');
var vucoin = require('vucoin');
var logger = require('../lib/logger')('pubkey');

module.exports.get = function (conn, conf, KeyService) {
  return new PublicKeyService(conn, conf, KeyService);
};

function PublicKeyService (conn, conf, KeyService) {

  var PublicKey = conn.model('PublicKey');
  var Key = conn.model('Key');
  
  var fifo = async.queue(function (task, callback) {
    task(callback);
  }, 1);

  this.getTheOne = function (keyID, done) {
    PublicKey.getTheOne(keyID, done);
  };

  /**
  * Tries to persist a public key given in ASCII-armored format.
  * Returns the database stored public key.
  */
  this.submitPubkey = function(obj, callback) {
    var pubkey = new PublicKey(obj);
    fifo.push(function (cb) {
      async.waterfall([
        function (next) {
          if (conf.kaccept == "KEYS") {
            KeyService.isKnown(pubkey.fingerprint, next);
          } else {
            next(null, true);
          }
        },
        function (isKnown, next) {
          if (!isKnown) {
            next('Unknown key - rejected');
            return;
          }
          // Known key: persist
          async.waterfall([
            function (next){
              PublicKey.persist(pubkey, next);
            },
            function (next){
              KeyService.setKnown(pubkey.fingerprint, next);
            },
            function (next) {
              conn.model('Merkle').addPublicKey(pubkey.fingerprint, function (err) {
                next(err);
              });
            },
          ], next);
        },
        function (next) {
          // If kmanagement == ALL, mark key as handled to handle key's transactions
          if (conf && conf.kmanagement == 'ALL')
            KeyService.handleKey(pubkey.fingerprint, true, next);
          else
            next();
        },
        function (next){
          PublicKey.getTheOne(pubkey.fingerprint, next);
        },
      ], function (err, dbPubkey) {
        cb(err, dbPubkey);
      });
    }, callback);
  };

  this.getForPeer = function (peer, done) {
    PublicKey.getTheOne(peer.fingerprint, function (err, pubkey) {
      if (!err) {
        done(null, pubkey);
      } else {
        async.waterfall([
          function (next){
            logger.debug("⟳ Retrieving peer %s public key", peer.fingerprint);
            vucoin(peer.getIPv6() || peer.getIPv4() || peer.getDns(), peer.getPort(), true, true, next);
          },
          function (node, next){
            node.network.pubkey(next);
          },
          function (rawPubkey, signature, next){
            var cert = jpgp().certificate(rawPubkey);
            if(!cert.fingerprint.match(new RegExp("^" + peer.fingerprint + "$", "g"))){
              next('Peer\'s public key ('+cert.fingerprint+') does not match peering (' + peer.fingerprint + ')');
              return;
            }
            PublicKey.persistFromRaw(rawPubkey, function (err) {
              next();
            });
          },
          function (next){
            PublicKey.find({ fingerprint: peer.fingerprint }, function (err, pubkeys) {
              if(pubkeys.length > 0) next(null, pubkeys[0]);
              else if(pubkeys.length == 0) next('Error getting public key for peer ' + peer.getURL());
            });
          },
        ], done);
      }
    });
  };
}
