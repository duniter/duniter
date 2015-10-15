"use strict";
var async           = require('async');
var _               = require('underscore');
var blockchainDao   = require('../lib/blockchainDao');
var globalValidator = require('../lib/globalValidator');
var crypto          = require('../lib/crypto');

var DO_NOT_THROW_ABOUT_EXPIRATION = true;

module.exports = function (conf, dal) {
  return new IdentityService(conf, dal);
};

function IdentityService (conf, dal) {

  var logger          = require('../lib/logger')(dal.profile);

  var Block         = require('../../app/lib/entity/block');
  var Identity      = require('../../app/lib/entity/identity');
  var Certification = require('../../app/lib/entity/certification');
  
  var fifo = async.queue(function (task, callback) {
    task(callback);
  }, 1);

  // Validator for certifications
  var globalValidation = globalValidator(conf, blockchainDao(null, dal));

  this.setDAL = function(theDAL) {
    dal = theDAL;
    globalValidation = globalValidator(conf, blockchainDao(null, dal));
  };

  this.searchIdentities = function(search) {
    return dal.searchJustIdentities(search);
  };

  this.findMember = function(search, done) {
    async.parallel({
      pubkey: function (next) {
        dal.getWritten(search, next);
      },
      uid: function (next) {
        dal.getWrittenByUID(search).then(_.partial(next, null)).catch(next);
      }
    }, function (err, res) {
      done((!(res.pubkey || res.uid) && 'No member matching this pubkey or uid') || null, new Identity(res.pubkey || res.uid || {}));
    });
  };

  this.findIdentities = function(pubkey, done) {
    async.parallel({
      written: function (next) {
        dal.getWritten(pubkey, next);
      },
      nonWritten: function (next) {
        dal.getNonWritten(pubkey).then(_.partial(next, null)).catch(next);
      }
    }, done);
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
      certs = _.sortBy(certs, function(c){ return parseInt(c.block_number); });
      var hasCert2 = false;
      certs.forEach(function(cert){
        logger.info('⬇ CERT %s block#%s', cert.from, cert.block_number);
        if (cert.block_number == 2) {
          hasCert2 = true;
        }
      });
      async.waterfall([
        function (next) {
          dal.getCurrentBlockOrNull(next);
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
            }, function(err) {
              cert.err = err;
              cb();
            }, DO_NOT_THROW_ABOUT_EXPIRATION);
          }, next);
        },
        function (next){
          certs = _.filter(certs, function(cert){ return !cert.err; });
          async.forEachSeries(certs, function(cert, cb){
            var mCert = new Certification({ pubkey: cert.from, sig: cert.sig, block_number: cert.block_number, target: obj.hash, to: idty.pubkey });
            async.waterfall([
              function (next){
                dal.existsCert(mCert).then(_.partial(next, null)).catch(next);
              },
              function (existing, next){
                if (existing) next();
                else dal.registerNewCertification(new Certification(mCert))
                  .then(function(){
                    logger.info('✔ CERT %s', mCert.from);
                    aCertWasSaved = true;
                    next();
                  })
                  .catch(function(err){
                    // TODO: This is weird...
                    logger.info('✔ CERT %s', mCert.from);
                    aCertWasSaved = true;
                    next(err);
                  });
              }
            ], cb);
          }, next);
        },
        function (next){
          dal.getIdentityByHashWithCertsOrNull(obj.hash).then(_.partial(next, null)).catch(next);
        },
        function (existing, next){
          if (existing && !aCertWasSaved) {
            next('Already up-to-date');
          }
          else if (existing)
            next(null, new Identity(existing));
          else {
            // Create
            idty = new Identity(idty);
            dal.savePendingIdentity(idty).then(function() {
              logger.info('✔ IDTY %s %s', idty.pubkey, idty.uid);
              next(null, idty);
            }).catch(next);
          }
        }
      ], cb);
    }, function(err, idty) {
      err && logger.warn(err);
      done(err, idty);
    });
  };

  this.submitRevocation = function(obj, done) {
    var idty = new Identity(obj);
    var selfCert = idty.selfCert();
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
              dal.setRevoked(obj.hash).then(function () {
                next(null, jsonResultTrue());
              })
                .catch(next);
            }
          }
          else {
            // Create
            idty.revoked = true;
            dal.savePendingIdentity(idty).then(function() {
              next(null, jsonResultTrue());
            }).catch(next);
          }
        }
      ], cb);
    }, done);
  };
}

function jsonResultTrue () {
  return {
    json: function() {
      return {
        result: true
      };
    }
  };
}