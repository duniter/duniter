var jpgp      = require('../lib/jpgp');
var async     = require('async');
var _         = require('underscore');

module.exports.get = function (conn) {

  var Wallet    = conn.model('Wallet');
  var Amendment = conn.model('Amendment');
  var PublicKey = conn.model('PublicKey');
  var Merkle    = conn.model('Merkle');
  var Vote      = conn.model('Vote');

  this.submit = function (obj, done) {

    var entry = new Wallet(obj);
    var pubkey;
    async.waterfall([
      function (next) {
        PublicKey.getTheOne(obj.keyID, next);
      },
      function (foundPubkey, next){
        pubkey = foundPubkey;
        if(pubkey.fingerprint != entry.fingerprint){
          next('Fingerprint in Wallet (' + entry.fingerprint + ') does not match signatory (' + pubkey.fingerprint + ')');
          return;
        }
        Wallet.find({ fingerprint: pubkey.fingerprint }, next);
      },
      function (entries, next){
        var entryEntity = entry;
        var previousHash = entryEntity.hash;
        if(entries.length > 0){
          // Already existing Wallet
          if(entries[0].sigDate >= entryEntity.sigDate){
            next('Cannot record a previous Wallet');
            return;
          }
          entryEntity = entries[0];
          previousHash = entries[0].hash;
          entry.copyValues(entryEntity);
        }
        entryEntity.propagated = false;
        entryEntity.fingerprint = pubkey.fingerprint;
        entryEntity.save(function (err) {
          next(err, entryEntity, previousHash);
        });
      },
      function (entry, previousHash, next) {
        Merkle.updateForWalletEntries(previousHash, entry.hash, function (err) {
          next(err, entry);
        });
      }
    ], done);
  }

  return this;
}