var async  = require('async');
var _      = require('underscore');
var crypto = require('../lib/crypto');
var logger = require('../lib/logger')('pubkey');

module.exports.get = function (conn, conf) {
  return new IdentityService(conn, conf);
};

function IdentityService (conn, conf) {

  var Identity = conn.model('Identity');
  
  var fifo = async.queue(function (task, callback) {
    task(callback);
  }, 1);


  this.search = function(search, done) {
    var identities = [];
    async.waterfall([
      function (next){
        Identity.search(search, next);
      },
    ], done);
  };

  /**
  * Tries to persist a public key given in ASCII-armored format.
  * Returns the database stored public key.
  */
  this.submitIdentity = function(obj, done) {
    var idty = new Identity(obj);
    var that = this;
    fifo.push(function (cb) {
      async.waterfall([
        function (next){
          // Check signature's validity
          crypto.verifyCbErr(idty.selfCert(), idty.sig, idty.pubkey, next);
        },
        function (next) {
          Identity.getByHash(obj.hash, next);
        },
        function (existing, next){
          if (existing)
            next(null, existing);
          else {
            // Create
            idty.save(function (err) {
              next(err, idty);
            });
          }
        },
      ], cb);
    }, done);
  };
}
