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
      async.apply(checkCertificationsDelayIsRespected, block),
      async.apply(checkNewcomersHaveEnoughCertifications, block),
      async.apply(checkNewcomersAreNotOudistanced, block)
    ], done);
  };

  function checkCertificationsAreValid (block, done) {
    async.forEach(block.certifications, function(inlineCert, callback){
      var cert = Certification.fromInline(inlineCert);
      async.waterfall([
        function (next){
          dao.getIdentityByPubkey(cert.to, next);
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
          dao.getIdentityByPubkey(cert.from, next);
        },
        function (idty, next){
          next(idty ? null : 'Certification from non-member');
        },
      ], callback);
    }, done);
  }

  function checkIdentityUnicity (block, done) {
    done();
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