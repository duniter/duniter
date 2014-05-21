var service   = require('../service');
var jpgp      = require('../lib/jpgp');
var async     = require('async');
var mongoose  = require('mongoose');
var _         = require('underscore');
var merkle    = require('merkle');
var PublicKey = mongoose.model('PublicKey');
var logger    = require('../lib/logger')('pubkey');

// Services
var KeyService = service.Key;

module.exports.get = function (pgp, currency, conf) {
  
  var fifo = async.queue(function (task, callback) {
    task(callback);
  }, 1);

  /**
  * Tries to persist a public key given in ASCII-armored format.
  * Returns the database stored public key.
  */
  this.submitPubkey = function(pubkey, callback) {
    fifo.push(function (cb) {
      async.waterfall([
        function (next) {
          logger.debug('⬇ %s', pubkey.fingerprint);
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
          PublicKey.persist(pubkey, function (err) {
            next(err);
          });
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

  return this;
}
