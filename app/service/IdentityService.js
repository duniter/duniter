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

  let that = this;

  var logger          = require('../lib/logger')(dal.profile);

  var Block         = require('../../app/lib/entity/block');
  var Identity      = require('../../app/lib/entity/identity');
  var Certification = require('../../app/lib/entity/certification');
  var Revocation    = require('../../app/lib/entity/revocation');

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

  this.submitIdentity = function(obj, done) {
    var idty = new Identity(obj);
    var selfCert = idty.rawWithoutSig();
    fifo.push(function (cb) {
      logger.info('⬇ IDTY %s %s', idty.pubkey, idty.uid);
      return co(function *() {
        // Check signature's validity
        let verified = crypto.verify(selfCert, idty.sig, idty.pubkey);
        if (!verified) {
          throw constants.ERRORS.SIGNATURE_DOES_NOT_MATCH;
        }
        let existing = yield dal.getIdentityByHashOrNull(obj.hash);
        if (existing) {
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

  this.submitCertification = (obj, done) => co(function *() {
    let current = yield dal.getCurrentBlockOrNull();
    // Prepare validator for certifications
    let potentialNext = new Block({ currency: conf.currency, identities: [], number: current ? current.number + 1 : 0 });
    let cert = Certification.statics.fromJSON(obj);
    let targetHash = cert.getTargetHash();
    let idty = yield dal.getIdentityByHashOrNull(targetHash);
    if (!idty) {
      yield Q.nbind(that.submitIdentity, that)({
        issuer: cert.idty_issuer,
        uid: cert.idty_uid,
        buid: cert.idty_buid
      });
    }
    // TODO: missing fifo ?
    logger.info('⬇ CERT %s block#%s -> %s', cert.from, cert.block_number, idty.uid);
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
          hash: 'E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855'
        };
      }
      cert.block_hash = basedBlock.hash;
      var mCert = new Certification({
        pubkey: cert.from,
        sig: cert.sig,
        block_number: cert.block_number,
        block_hash: cert.block_hash,
        target: targetHash,
        to: idty.pubkey
      });
      let existingCert = yield dal.existsCert(mCert);
      if (!existingCert) {
        try {
          yield dal.registerNewCertification(new Certification(mCert));
          logger.info('✔ CERT %s', mCert.from);
        } catch (e) {
          // TODO: This is weird...
          logger.error(e);
          logger.info('✔ CERT %s', mCert.from);
        }
      }
    } else {
      logger.info('✘ CERT %s %s', cert.from, cert.err);
      throw cert.err;
    }
    return cert;
  })
    .then((cert) => done(null, cert)).catch(done);

  this.submitRevocation = function(obj, done) {
    var revoc = new Revocation(obj);
    var raw = revoc.rawWithoutSig();
    fifo.push(function (cb) {
      async.waterfall([
        function (next) {
          // Check signature's validity
          crypto.verifyCbErr(raw, revoc.revocation, revoc.pubkey, next);
        },
        function (next){
          dal.getIdentityByHashOrNull(obj.hash, next);
        },
        function (existing, next){
          if (existing) {
            // Modify
            if (existing.revoked) {
              next('Already revoked');
            }
            else if (existing.revocation_sig) {
              next('Revocation already registered');
            } else {
              dal.setRevocating(obj.hash, revoc.revocation).then(function () {
                next(null, jsonResultTrue());
              })
                .catch(next);
            }
          }
          else {
            // Create
            revoc.revoked = true;
            dal.savePendingIdentity(revoc).then(function() {
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