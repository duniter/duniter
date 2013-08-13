var jpgp       = require('../lib/jpgp');
var async      = require('async');
var mongoose   = require('mongoose');
var _          = require('underscore');
var Membership = mongoose.model('Membership');
var PublicKey  = mongoose.model('PublicKey');

module.exports = function (pgp, currency, conf) {

  this.join = function (req, res) {
    async.waterfall([

      // Parameters
      function(callback){
        if(!(req.body && req.body.request && req.body.signature)){
          callback('Requires a membership request + signature');
          return;
        }
        callback(null, req.body.request, req.body.signature);
      },

      // Check signature's key ID
      function(msr, sig, callback){
        var keyID = jpgp().signature(sig).issuer();
        if(!(keyID && keyID.length == 16)){
          callback('Cannot identify signature issuer`s keyID');
          return;
        }
        callback(null, msr + sig, keyID);
      },

      // Looking for corresponding public key
      function(signedMSR, keyID, callback){
        PublicKey.search("0x" + keyID, function (err, keys) {
          if(keys.length > 1){
            callback('Multiple PGP keys found for this keyID.');
            return;
          }
          if(keys.length < 1){
            callback('Corresponding Public Key not found.');
            return;
          }
          var pubkey = keys[0];
          var ms = new Membership();
          callback(null, ms, signedMSR, pubkey);
        });
      },

      // Verify signature
      function(ms, signedMSR, pubkey, callback){
        async.waterfall([
          function(next){
            ms.parse(signedMSR, next);
          },
          function(ms, next){
            ms.verify(currency, next);
          },
          function(valid, next){
            ms.verifySignature(pubkey.raw, next);
          },
          function(verified, next){
            var cert = jpgp().certificate(pubkey.raw);
            Membership.find({ fingerprint: cert.fingerprint, basis: ms.basis }, next);
          },
          function(requests, next){
            var msEntity = ms;
            if(requests.length > 0){
              msEntity = requests[0];
              ms.copyValues(msEntity);
            }
            msEntity.fingerprint = pubkey.fingerprint;
            msEntity.save(function (err) {
              next(err, msEntity);
            });
          }
        ], callback);
      }
    ], function (err, recordedMS) {
      if(err){
        res.send(400, err);
      }
      else res.end(JSON.stringify({
        request: recordedMS.hdc(),
        signature: recordedMS.signature
      }));
    });
  };
  
  return this;
}
