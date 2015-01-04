var async           = require('async');
var _               = require('underscore');
var blockchainDao   = require('../lib/blockchainDao');
var globalValidator = require('../lib/globalValidator');
var crypto          = require('../lib/crypto');
var logger          = require('../lib/logger')('pubkey');

module.exports.get = function (conn, conf) {
  return new IdentityService(conn, conf);
};

function IdentityService (conn, conf) {

  var Block         = conn.model('Block');
  var Identity      = conn.model('Identity');
  var Certification = conn.model('Certification');
  
  var fifo = async.queue(function (task, callback) {
    task(callback);
  }, 1);

  var that = this;

  // Reference to BlockchainService
  var BlockchainService = null;
  
  // Validator for certifications
  var globalValidation = globalValidator(conf, blockchainDao(conn, null));

  this.search = function(search, done) {
    var identities = [];
    async.waterfall([
      function (next){
        Identity.search(search, next);
      },
    ], done);
  };

  this.findMember = function(search, done) {
    async.parallel({
      pubkey: function (next) {
        Identity.getMember(search, next);
      },
      uid: function (next) {
        Identity.getMemberByUID(search, next);
      }
    }, function (err, res) {
      done((!(res.pubkey || res.uid) && 'No member matching this pubkey or uid') || null, res.pubkey || res.uid);
    });
  };

  this.setBlockchainService = function (service) {
    BlockchainService = service;
  };

  /**
  * Tries to persist a public key given in ASCII-armored format.
  * Returns the database stored public key.
  */
  this.submitIdentity = function(obj, done) {
    var idty = new Identity(obj);
    var selfCert = idty.selfCert();
    var certs = idty.othersCerts();
    var potentialNext;
    fifo.push(function (cb) {
      async.waterfall([
        function (next) {
          BlockchainService.current(next);
        },
        function (current, next) {
          // Prepare validator for certifications
          potentialNext = new Block({ identities: [], number: current ? current.number + 1 : 0 });
          // Check signature's validity
          crypto.verifyCbErr(selfCert, idty.sig, idty.pubkey, next);
        },
        function (next) {
          async.forEachSeries(certs, function(cert, cb){
            globalValidation.checkCertificationIsValid(cert, potentialNext, function (block, pubkey, next) {
              next(null, idty);
            }, next);
          }, next);
        },
        function (next){
          async.forEachSeries(certs, function(cert, cb){
            var mCert = new Certification({ pubkey: cert.from, sig: cert.sig, block_number: cert.block_number, target: obj.hash, to: idty.pubkey });
            async.waterfall([
              function (next){
                mCert.existing(next);
              },
              function (existing, next){
                if (existing) next();
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

  this.submitRevocation = function(obj, done) {
    var idty = new Identity(obj);
    var selfCert = idty.selfCert();
    var certs = idty.othersCerts();
    fifo.push(function (cb) {
      async.waterfall([
        function (next) {
          // Check signature's validity
          crypto.verifyCbErr(selfCert, idty.sig, idty.pubkey, next);
        },
        function (next) {
          crypto.isValidRevocation(selfCert, idty.sig, idty.pubkey, idty.revocation, next);
        },
        function (next){
          Identity.getByHash(obj.hash, next);
        },
        function (existing, next){
          if (existing) {
            // Modify
            existing.revoked = true;
            existing.save(function (err) {
              next(err, jsonResultTrue());
            });
          }
          else {
            // Create
            idty.save(function (err) {
              next(err, jsonResultTrue());
            });
          }
        },
      ], cb);
    }, done);
  };
}

function jsonResultTrue () {
  return {
    json: function () {
      result: true
    }
  };
}