"use strict";
var async           = require('async');
var _               = require('underscore');
var Q = require('q');
var blockchainDao   = require('../lib/blockchainDao');
var globalValidator = require('../lib/globalValidator');
var crypto          = require('../lib/crypto');
var constants       = require('../lib/constants');
var co = require('co');

var DO_NOT_THROW_ABOUT_EXPIRATION = true;

module.exports = function (conf, dal) {
  return new IdentityService(conf, dal);
};

function IdentityService (conf, dal) {

  var logger          = require('../lib/logger')(dal.profile);

  var Block         = require('../../app/lib/entity/block');
  var Identity      = require('../../app/lib/entity/identity');
  var Certification = require('../../app/lib/entity/certification');

  this.dal = dal;
  
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

  this.findMember = (search) => co(function *() {
    let idty = null;
    if (search.match(constants.PUBLIC_KEY)) {
      idty = yield dal.getWrittenIdtyByPubkey(search);
    }
    else {
      idty = yield dal.getWrittenIdtyByUID(search);
    }
    if (!idty) {
      throw constants.ERRORS.NO_MEMBER_MATCHING_PUB_OR_UID;
    }
    yield dal.fillInMembershipsOfIdentity(Q(idty));
    return new Identity(idty);
  });

  this.findMemberWithoutMemberships = (search) => co(function *() {
    let idty = null;
    if (search.match(constants.PUBLIC_KEY)) {
      idty = yield dal.getWrittenIdtyByPubkey(search);
    }
    else {
      idty = yield dal.getWrittenIdtyByUID(search);
    }
    if (!idty) {
      throw constants.ERRORS.NO_MEMBER_MATCHING_PUB_OR_UID;
    }
    return new Identity(idty);
  });

  this.getWrittenByPubkey = function(pubkey) {
    return dal.getWrittenIdtyByPubkey(pubkey);
  };

  this.getPendingFromPubkey = function(pubkey) {
    return dal.getNonWritten(pubkey);
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
      certs.forEach(function(cert){
        logger.info('⬇ CERT %s block#%s', cert.from, cert.block_number);
      });
      return co(function *() {
        let current = yield dal.getCurrentBlockOrNull();
        // Prepare validator for certifications
        potentialNext = new Block({ identities: [], number: current ? current.number + 1 : 0 });
        // Check signature's validity
        let verified = crypto.verify(selfCert, idty.sig, idty.pubkey);
        if (!verified) {
          throw constants.ERRORS.SIGNATURE_DOES_NOT_MATCH;
        }
        // CERTS
        for (let i = 0; i < certs.length; i++) {
          let cert = certs[i];
          yield Q.Promise(function(resolve){
            globalValidation.checkCertificationIsValid(cert, potentialNext, function (block, pubkey, next) {
              next(null, idty);
            }, function(err) {
              cert.err = err;
              resolve();
            }, DO_NOT_THROW_ABOUT_EXPIRATION);
          });
          if (!cert.err) {
            let basedBlock = yield dal.getBlock(cert.block_number);
            if (cert.block_number == 0 && !basedBlock) {
              basedBlock = {
                number: 0,
                hash: 'DA39A3EE5E6B4B0D3255BFEF95601890AFD80709'
              };
            }
            cert.block_hash = basedBlock.hash;
            var mCert = new Certification({
              pubkey: cert.from,
              sig: cert.sig,
              block_number: cert.block_number,
              block_hash: cert.block_hash,
              target: obj.hash,
              to: idty.pubkey
            });
            let existingCert = yield dal.existsCert(mCert);
            if (!existingCert) {
              try {
                yield dal.registerNewCertification(new Certification(mCert));
                logger.info('✔ CERT %s', mCert.from);
                aCertWasSaved = true;
              } catch (e) {
                // TODO: This is weird...
                logger.info('✔ CERT %s', mCert.from);
                aCertWasSaved = true;
              }
            }
          } else {
            logger.info('✘ CERT %s wrong signature', cert.from);
          }
        }
        let existing = yield dal.getIdentityByHashWithCertsOrNull(obj.hash);
        if (existing && !aCertWasSaved) {
          throw constants.ERRORS.ALREADY_UP_TO_DATE;
        }
        else if (!existing) {
          // Create if not already written uid/pubkey
          let used = yield dal.getWrittenIdtyByPubkey(idty.pubkey);
          if (used) {
            throw constants.ERRORS.PUBKEY_ALREADY_USED;
          }
          used = yield dal.getWrittenIdtyByUID(idty.uid);
          if (used) {
            throw constants.ERRORS.UID_ALREADY_USED;
          }
          idty = new Identity(idty);
          yield dal.savePendingIdentity(idty);
          logger.info('✔ IDTY %s %s', idty.pubkey, idty.uid);
        }
        cb(null, idty);
      })
        .catch(cb);
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
            if (existing.wasMember) {
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