var async      = require('async');
var common     = require('./common');
var hexstrdump = require('../../hexstrdump');
var jpgp       = require('../../jpgp');
var parsers    = require('../../streams/parsers/doc');

module.exports = function (isMemberFunc, getPubkeyFunc) {
  return function (pkey, ctx, amNext, done) {
    async.waterfall([
      function (next){
        parsers.parsePubkey(next).asyncWrite(pkey.raw, next);
      },
      function (betterPubkey, next) {
        async.detect(betterPubkey.udid2s, function (udid2, cb) {
          var nbMatching = 0;
          async.forEach(udid2.signatures || [], function (certification, cb2) {
            var issuer = hexstrdump(certification.issuerKeyId.bytes).toUpperCase();
            async.waterfall([
              function (next){
                getPubkeyFunc(issuer, next);
              },
              function (issuerPubkey, next){
                isMemberFunc(issuerPubkey.fingerprint, function (err, isOK) {
                  next(err || (!isOK && "Signatory is not a member"), issuerPubkey);
                });
              },
              function (issuerPubkey, next) {
                var certSignatory = jpgp().certificate(issuerPubkey.raw);
                var certOwner = jpgp().certificate(pkey.raw);
                var verified = certification.verify(certSignatory.key.primaryKey, { userid: udid2.user.userId, key: certOwner.key.primaryKey });
                next((!verified && "Certification verification gives FALSE") || null, verified);
              }
            ], function (err, verified) {
              if (verified) nbMatching++;
              cb2(err);
            });
          }, function (err) {
              cb(nbMatching >= 1);
          });
        }, function (detected) {
          if (detected != undefined)
            next(null, { nbVerifiedSigs: 1 });
          else
            next(null, { nbVerifiedSigs: 0 });
        });
      },
      function (virtualPubkey, next){
        common.computeIndicators(virtualPubkey, ctx, amNext, context2AnalyticalMembership, context2AnalyticalVoting, next);
      },
    ], done);
  };
}

var VTExpires = 3600*24*14; // Every 14 days


/**
* Converts member context vars to analytical expression parameters (for computing functions' namespace)
*/
function context2AnalyticalMembership (pubkey, context, done) {
  var ctx = context || { currentMembership: null, nextMembership: null };
  var isMember = ctx.currentMembership && ctx.currentMembership.membership == 'IN';
  var ms = [
    isMember ? 1 : 0,
    !isMember ? 1 : 0,
  ];
  var hasInvalidKey = (pubkey.nbVerifiedSigs || 0) < 1;
  var hasNextIn = ctx.nextMembership && ctx.nextMembership.membership == 'IN';
  var hasNextOut = ctx.nextMembership && ctx.nextMembership.membership == 'OUT';
  var p = [
    hasInvalidKey ? 1 : 0,
    hasNextIn ? 1 : 0,
    hasNextOut ? 1 : 0,
  ];
  done(null, ms, p);
}

/**
* Converts voter context vars to analytical expression parameters (for computing functions' namespace)
*/
function context2AnalyticalVoting (context, amNext, memberLeaving, done) {
  var ctx = context || { currentVoting: null, nextVoting: null };
  var isVoter = ctx.currentVoting;
  var isTooOldVT = (isVoter && ctx.currentVoting.date < getVTExclusionDate(amNext));
  var vt = [
    isVoter ? 0 : 1,
    isVoter ? 1 : 0,
    isTooOldVT ? 1 : 0
  ];
  var hasNextVoting = ctx.nextVoting;
  var p = [
    1,
    hasNextVoting ? 1 : 0,
    memberLeaving == 1 ? 1 : 0
  ];
  done(null, vt, p);
}

function getVTExclusionDate (amNext) {
  var nextTimestamp = amNext.generated;
  var exclusionDate = new Date();
  exclusionDate.setTime(nextTimestamp*1000 - VTExpires*1000);
  return exclusionDate;
}
