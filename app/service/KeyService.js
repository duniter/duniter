var jpgp       = require('../lib/jpgp');
var async      = require('async');
var _          = require('underscore');

module.exports.get = function (conn) {

  this.handleKey = function(key, isManaged, done) {
    key = key || "";
    key = key.toUpperCase();
    async.waterfall([
      function (next){
        var matches = key.match(/^\w{40}$/);
        if(!matches){
          next("Bad key must be a 40 characters SHA-1 hash");
          return;
        }
        next();
      },
      function (next) {
        conn.model('Key').setManaged(key, isManaged, next);
      }
    ], done);
  }

  /**
  * Return true if key has an entry in Key collection, false otherwise.
  */
  this.isKnown = function(keyFingerprint, done) {
    async.waterfall([
      function (next) {
        conn.model('Key').find({ fingerprint: keyFingerprint }, next);
      },
      function (keys, next){
        next(null, keys.length == 1);
      },
    ], done);
  }

  /**
  * Persist a key
  */
  this.setKnown = function(keyFingerprint, done) {
    conn.model('Key').setKnown(keyFingerprint, done);
  }

  return this;
}