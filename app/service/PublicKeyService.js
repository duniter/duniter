var jpgp      = require('../lib/jpgp');
var async     = require('async');
var mongoose  = require('mongoose');
var _         = require('underscore');
var merkle    = require('merkle');
var PublicKey = mongoose.model('PublicKey');

module.exports = function (currency) {

  this.submitPubkey = function(aaPubkey, aaSignature, callback) {
    var pubkey;
    async.waterfall([
      function (next){
        PublicKey.verify(aaPubkey, aaSignature, function (err, verified) {
          next(err);
        });
      },
      function (next) {
        pubkey = new PublicKey({ raw: aaPubkey, signature: aaSignature });
        pubkey.construct(next);
      },
      function (next) {
        logger.debug('Incoming pubkey: for: %s', pubkey.fingerprint);
        PublicKey.persist(pubkey, next);
      }
    ], function (err) {
      callback(err, pubkey);
    });
  };

  return this;
}
