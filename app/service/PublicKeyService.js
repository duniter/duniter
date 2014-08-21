var jpgp      = require('../lib/jpgp');
var async     = require('async');
var _         = require('underscore');
var merkle    = require('merkle');
var vucoin    = require('vucoin');
var keyhelper = require('../lib/keyhelper');
var logger    = require('../lib/logger')('pubkey');

module.exports.get = function (conn, conf, KeyService) {
  return new PublicKeyService(conn, conf, KeyService);
};

function PublicKeyService (conn, conf, KeyService) {

  var PublicKey  = conn.model('PublicKey');
  var TrustedKey = conn.model('TrustedKey');
  var Key        = conn.model('Key');
  
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
    var that = this;
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
            function (next) {
              that.updateAvailableKeyMaterial(pubkey.fingerprint, next);
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

  // Check subkeys, subkey bindings & certifications that can be recorded in the keychain
  this.updateAvailableKeyMaterial = function (fpr, done) {
    async.waterfall([
      function (next) {
        async.parallel({
          pubkey: function(callback){
            PublicKey.getTheOne(fpr, callback);
          },
          trusted: function(callback){
            TrustedKey.getTheOne(fpr, function (err, trusted) {
              if (err)
                trusted = null;
              callback(null, trusted);
            });
          },
          key: function(callback){
            Key.getTheOne(fpr, callback);
          },
        }, next);
      },
      function (res, next){
        var pubkey = res.pubkey;
        var trusted = res.trusted;
        var key = res.key;
        var keyN = keyhelper.fromArmored(pubkey.raw);
        var keyT = trusted == null ? null : keyhelper.fromEncodedPackets(trusted.packets);
        // Compute new subkeys
        var recordedSubKeys = _((keyT && keyT.getHashedSubkeyPackets()) || {}).keys();
        var availableSubKeys = _(keyN.getHashedSubkeyPackets()).keys();
        // Compute new certifications
        var hashedCertifs = keyN.getHashedCertifPackets();
        var recordedCertifs = _((keyT && keyT.getHashedCertifPackets()) || {}).keys();
        var availableCertifs = _(hashedCertifs).keys();
        key.subkeys = _(availableSubKeys).difference(recordedSubKeys);
        key.certifs = _(availableCertifs).difference(recordedCertifs);
        key.signatories = [];
        key.certifs.forEach(function(hash){
          var certif = keyhelper.toPacketlist(hashedCertifs[hash]);
          var issuer = certif[0].issuerKeyId.toHex().toUpperCase();
          key.signatories.push(issuer);
        });
        key.eligible = keyN.hasValidUdid2();
        key.save(function (err) {
          next(err);
        });
      },
    ], done);
  }

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
