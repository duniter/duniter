var jpgp      = require('../lib/jpgp');
var async     = require('async');
var mongoose  = require('mongoose');
var _         = require('underscore');
var merkle    = require('merkle');
var PublicKey = mongoose.model('PublicKey');
var logger    = require('../lib/logger')('http');

module.exports = function (currency, conf) {

  var KeyService = require('./KeyService').get();

  /**
  * Tries to persist a public key given in ASCII-armored format.
  * Returns the database stored public key.
  */
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
        KeyService.isKnown(pubkey.fingerprint, next);
      },
      function (isKnown, next) {
        if (!isKnown) {
          next('Unknown key - rejected');
          return;
        }
        // Known key: persist
        PublicKey.persist(pubkey, function (err) {
          next(err);
        });
      },
      function (next) {
        // If kmanagement == ALL, mark key as handled to handle key's transactions
        KeyService.handleKey(pubkey.fingerprint, conf && conf.kmanagement == 'ALL', next);
      },
      function (next){
        PublicKey.getTheOne(pubkey.fingerprint, next);
      },
    ], function (err, dbPubkey) {
      callback(err, dbPubkey);
    });
  };

  return this;
}
