var jpgp    = require('../lib/jpgp');
var async   = require('async');
var _       = require('underscore');
var mlogger = require('../lib/logger')('membership');

module.exports.get = function (conn, conf) {
  return new KeyService(conn, conf);
};

function KeyService (conn, conf) {
  
  var Membership    = conn.model('Membership');

  this.load = function (done) {
    done();
  };

  this.submitMembership = function (ms, done) {
    var entry = new Membership(ms);
    async.waterfall([
      function (next){
        mlogger.debug('⬇ %s %s', entry.issuer, entry.membership);
        // Get already existing Membership with same parameters
        Membership.getForHashAndIssuer(entry.hash, entry.issuer, next);
      },
      function (entries, next){
        if (entries.length > 0) {
          next('Already received membership');
        }
        else next();
      },
      function (next){
        // Saves entry
        entry.save(function (err) {
          next(err);
        });
      },
      function (next){
        mlogger.debug('✔ %s %s', entry.issuer, entry.membership);
        next(null, entry);
      }
    ], done);
  };
}
