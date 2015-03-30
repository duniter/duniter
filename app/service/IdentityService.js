var async           = require('async');
var _               = require('underscore');
var blockchainDao   = require('../lib/blockchainDao');
var globalValidator = require('../lib/globalValidator');
var crypto          = require('../lib/crypto');

module.exports.get = function (conn, conf, dal) {
  return new IdentityService(conn, conf, dal);
};

function IdentityService (conn, conf, dal) {

  var logger          = require('../lib/logger')(dal.profile);

  var Block         = require('../../app/lib/entity/block');
  var Identity      = require('../../app/lib/entity/identity');
  var Certification = require('../../app/lib/entity/certification');
  
  var fifo = async.queue(function (task, callback) {
    task(callback);
  }, 1);

  var that = this;

  // Reference to BlockchainService
  var BlockchainService = null;
  
  // Validator for certifications
  var globalValidation = globalValidator(conf, blockchainDao(conn, null, dal));

  this.search = function(search, done) {
    async.waterfall([
      function (next){
        dal.searchIdentity(search, next);
      }
    ], done);
  };

  this.findMember = function(search, done) {
    async.parallel({
      pubkey: function (next) {
        dal.getWritten(search, next);
      },
      uid: function (next) {
        dal.getWrittenByUID(search, next);
      }
    }, function (err, res) {
      done((!(res.pubkey || res.uid) && 'No member matching this pubkey or uid') || null, new Identity(res.pubkey || res.uid));
    });
  };

  this.findIdentities = function(pubkey, done) {
    async.parallel({
      written: function (next) {
        dal.getWritten(pubkey, next);
      },
      nonWritten: function (next) {
        dal.getNonWritten(pubkey, next);
      }
    }, done);
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
    var aCertWasSaved = false;
    fifo.push(function (cb) {
      logger.info('⬇ IDTY %s %s', idty.pubkey, idty.uid);
      certs.forEach(function(cert){
        logger.info('⬇ CERT %s', cert.from);
      });
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
                dal.existsCert(mCert, next);
              },
              function (existing, next){
                if (existing) next();
                else dal.saveCertification(new Certification(mCert), function (err) {
                  logger.info('✔ CERT %s', mCert.from);
                  aCertWasSaved = true;
                  next(err);
                });
              }
            ], cb);
          }, next);
        },
        function (next){
          dal.getIdentityByHashWithCertsOrNull(obj.hash, next);
        },
        function (existing, next){
          if (existing && !aCertWasSaved) {
            next('Already up-to-date');
          }
          else if (aCertWasSaved)
            next(null, new Identity(existing));
          else {
            // Create
            idty = new Identity(idty);
            dal.saveIdentity(idty, function (err) {
              logger.info('✔ IDTY %s %s', idty.pubkey, idty.uid);
              next(err, idty);
            });
          }
        }
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
          dal.getIdentityByHashOrNull(obj.hash, next);
        },
        function (existing, next){
          if (existing) {
            // Modify
            if (existing.written) {
              next('This identity cannot be revoked since it is present in the blockchain.');
            } else {
              existing.revoked = true;
              dal.saveIdentity(new Identity(existing), function (err) {
                next(err, jsonResultTrue());
              });
            }
          }
          else {
            // Create
            dal.saveIdentity(new Identity(idty), function (err) {
              next(err, jsonResultTrue());
            });
          }
        }
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