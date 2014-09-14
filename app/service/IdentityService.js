var async  = require('async');
var _      = require('underscore');
var crypto = require('../lib/crypto');
var logger = require('../lib/logger')('pubkey');

module.exports.get = function (conn, conf) {
  return new IdentityService(conn, conf);
};

function IdentityService (conn, conf) {

  var Identity      = conn.model('Identity');
  var Certification = conn.model('Certification');
  
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
    var selfCert = idty.selfCert();
    var certs = idty.othersCerts();
    fifo.push(function (cb) {
      async.waterfall([
        function (next){
          // Check signature's validity
          crypto.verifyCbErr(selfCert, idty.sig, idty.pubkey, next);
        },
        function (next) {
          async.forEachSeries(certs, function(cert, cb){
            var raw = selfCert + idty.sig + '\n' + 'META:TS:' + cert.time.timestamp() + '\n';
            var verified = crypto.verify(raw, cert.sig, cert.from);
            cb(verified ? null : 'Wrong signature for certification from \'' + cert.from + '\'');
          }, next);
        },
        function (next){
          async.forEachSeries(certs, function(cert, cb){
            var mCert = new Certification({ pubkey: cert.from, sig: cert.sig, time: cert.time, target: obj.hash, to: idty.pubkey });
            async.waterfall([
              function (next){
                Certification.exists(next);
              },
              function (exists, next){
                if (exists) next();
                else mCert.save(function (err) {
                  next(err);
                });
              },
            ], cb);
          }, next);
        },
        function (next){
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
