var jpgp      = require('../lib/jpgp');
var async     = require('async');
var mongoose  = require('mongoose');
var _         = require('underscore');
var THTEntry  = mongoose.model('THTEntry');
var Amendment = mongoose.model('Amendment');
var PublicKey = mongoose.model('PublicKey');
var Merkle    = mongoose.model('Merkle');
var Vote      = mongoose.model('Vote');

module.exports.get = function (currency) {

  this.submit = function (signedEntry, done) {
    
    async.waterfall([

      function (callback) {
        if(signedEntry.indexOf('-----BEGIN') == -1){
          callback('Signature not found in given THT entry');
          return;
        }
        callback();
      },

      // Check signature's key ID
      function(callback){
        var sig = signedEntry.substring(signedEntry.indexOf('-----BEGIN'));
        var keyID = jpgp().signature(sig).issuer();
        if(!(keyID && keyID.length == 16)){
          callback('Cannot identify signature issuer`s keyID');
          return;
        }
        callback(null, keyID);
      },

      // Looking for corresponding public key
      function(keyID, callback){
        PublicKey.getTheOne(keyID, function (err, pubkey) {
          callback(err, pubkey);
        });
      },

      // Verify signature
      function(pubkey, callback){
        var entry = new THTEntry();
        async.waterfall([
          function (next){
            entry.parse(signedEntry, next);
          },
          function (entry, next){
            entry.verify(currency, next);
          },
          function (valid, next){
            entry.verifySignature(pubkey.raw, next);
          },
          function (verified, next){
            if(!verified){
              next('Bad signature');
              return;
            }
            if(pubkey.fingerprint != entry.fingerprint){
              next('Fingerprint in THT entry (' + entry.fingerprint + ') does not match signatory (' + pubkey.fingerprint + ')');
              return;
            }
            next();
          },
          function (next){
            THTEntry.find({ fingerprint: pubkey.fingerprint }, next);
          },
          function (entries, next){
            var entryEntity = entry;
            var previousHash = entryEntity.hash;
            if(entries.length > 0){
              // Already existing THT entry
              if(entries[0].sigDate >= entryEntity.sigDate){
                next('Cannot record a previous THT entry');
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
            Merkle.updateForTHTEntries(previousHash, entry.hash, function (err) {
              next(err, entry);
            });
          }
        ], callback);
      }
    ], done);
  }

  return this;
}