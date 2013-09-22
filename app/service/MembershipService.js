var jpgp       = require('../lib/jpgp');
var async      = require('async');
var mongoose   = require('mongoose');
var _          = require('underscore');
var Membership = mongoose.model('Membership');
var Amendment  = mongoose.model('Amendment');
var PublicKey  = mongoose.model('PublicKey');
var Merkle     = mongoose.model('Merkle');
var Vote       = mongoose.model('Vote');

module.exports.get = function (currency) {

  this.submit = function (signedMSR, done) {
    
    async.waterfall([

      function (callback) {
        if(signedMSR.indexOf('-----BEGIN') == -1){
          callback('Signature not found in given membership request');
          return;
        }
        callback();
      },

      // Check signature's key ID
      function(callback){
        var sig = signedMSR.substring(signedMSR.indexOf('-----BEGIN'));
        var keyID = jpgp().signature(sig).issuer();
        if(!(keyID && keyID.length == 16)){
          callback('Cannot identify signature issuer`s keyID');
          return;
        }
        callback(null, keyID);
      },

      // Looking for corresponding public key
      function(keyID, callback){
        PublicKey.getTheOne(keyID, callback);
      },

      // Verify signature
      function(pubkey, callback){
        var ms = new Membership();
        async.waterfall([
          function (next){
            ms.parse(signedMSR, next);
          },
          function (ms, next){
            ms.verify(currency, next);
          },
          function (valid, next){
            ms.verifySignature(pubkey.raw, next);
          },
          function (verified, next){
            if(verified){
              ms.fingerprint = pubkey.fingerprint;
            }
            ms.checkCoherence(next);
          },
          function (next){
            Amendment.current(function (err, am) {
              if(am && ms.basis <= am.number){
                next('Membership request must target NEXT amendment');
                return;
              }
              next();
            });
          },
          function (next){
            Membership.find({ fingerprint: pubkey.fingerprint, basis: ms.basis }, next);
          },
          function (requests, next){
            var msEntity = ms;
            var previousHash = msEntity.hash;
            if(requests.length > 0){
              // Already existing status request
              if(requests[0].sigDate >= msEntity.sigDate){
                next('A more recent membership was already submitted');
                return;
              }
              if(requests[0].dataHash == msEntity.dataHash){
                next('Membership request already recorded');
                return;
              }
              msEntity = requests[0];
              previousHash = requests[0].hash;
              ms.copyValues(msEntity);
            }
            msEntity.fingerprint = pubkey.fingerprint;
            msEntity.save(function (err) {
              next(err, msEntity, previousHash);
            });
          },
          function (ms, previousHash, next) {
            Merkle.updateForNextMembership(previousHash, ms.hash, function (err) {
              next(err, ms);
            });
          }
        ], callback);
      }
    ], done);
  }

  return this;
}