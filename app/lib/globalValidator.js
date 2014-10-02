var async         = require('async');
var crypto        = require('./crypto');
var common        = require('./common');
var mongoose      = require('mongoose');
var Identity      = mongoose.model('Identity', require('../models/identity'));
var Membership    = mongoose.model('Membership', require('../models/membership'));
var Certification = mongoose.model('Certification', require('../models/certification'));

module.exports = function (dao) {
  
  return new GlobalValidator(dao);
};

function GlobalValidator (dao) {

  this.checkSignatures = function (block, done) {
    async.series([
      async.apply(checkCertificationsAreValid, block)
    ], done);
  };

  this.validate = function (block, done) {
    async.series([
      async.apply(checkIdentityUnicity, block),
      async.apply(checkPubkeyUnicity, block),
      async.apply(checkLeaversAreMembers, block),
      async.apply(checkExcludedAreMembers, block),
      async.apply(checkCertificationsAreMadeByMembers, block),
      async.apply(checkCertificationsAreMadeToMembers, block),
      async.apply(checkCertificationsDelayIsRespected, block),
      async.apply(checkNewcomersHaveEnoughCertifications, block),
      async.apply(checkNewcomersAreNotOudistanced, block)
    ], done);
  };

  /**
  * Get an identity, using global scope.
  * Considers identity collision + existence have already been checked.
  **/
  function getGlobalIdentity (block, pubkey, done) {
    async.waterfall([
      function (next){
        var localInlineIdty = block.getInlineIdentity(pubkey);
        if (localInlineIdty) {
          next(null, Identity.fromInline(localInlineIdty));
        } else {
          dao.getIdentityByPubkey(pubkey, next);
        }
      },
    ], done);
  }

  /**
  * Check wether a pubkey is currently a member or not (globally).
  **/
  function isMember (block, pubkey, done) {
    async.waterfall([
      function (next){
        if (block.isLeaving(pubkey)) {
          next(null, false);
        } else if (block.isJoining(pubkey)) {
          next(null, true);
        } else {
          dao.isMember(pubkey, next);
        }
      },
    ], done);
  }

  function checkCertificationsAreValid (block, done) {
    async.forEach(block.certifications, function(inlineCert, callback){
      var cert = Certification.fromInline(inlineCert);
      async.waterfall([
        function (next){
          getGlobalIdentity(block, cert.to, next);
        },
        function (idty, next){
          var selfCert = idty.selfCert();
          crypto.isValidCertification(selfCert, idty.sig, cert.from, cert.sig, cert.when.timestamp(), next);
        },
      ], callback);
    }, done);
  }

  function checkCertificationsAreMadeByMembers (block, done) {
    async.forEach(block.certifications, function(inlineCert, callback){
      var cert = Certification.fromInline(inlineCert);
      async.waterfall([
        function (next){
          isMember(block, cert.from, next);
        },
        function (idty, next){
          next(idty ? null : 'Certification from non-member');
        },
      ], callback);
    }, done);
  }

  function checkCertificationsAreMadeToMembers (block, done) {
    async.forEach(block.certifications, function(inlineCert, callback){
      var cert = Certification.fromInline(inlineCert);
      async.waterfall([
        function (next){
          isMember(block, cert.to, next);
        },
        function (idty, next){
          next(idty ? null : 'Certification to non-member');
        },
      ], callback);
    }, done);
  }

  function checkIdentityUnicity (block, done) {
    async.forEach(block.identities, function(inlineIdentity, callback){
      var idty = Identity.fromInline(inlineIdentity);
      async.waterfall([
        function (next){
          dao.existsUserID(idty.uid, next);
        },
        function (exists, next){
          next(exists ? 'Identity already used' : null);
        },
      ], callback);
    }, done);
  }

  function checkPubkeyUnicity (block, done) {
    done();
  }

  function checkLeaversAreMembers (block, done) {
    done();
  }

  function checkExcludedAreMembers (block, done) {
    done();
  }

  function checkCertificationsDelayIsRespected (block, done) {
    done();
  }

  function checkNewcomersHaveEnoughCertifications (block, done) {
    done();
  }

  function checkNewcomersAreNotOudistanced (block, done) {
    done();
  }

}