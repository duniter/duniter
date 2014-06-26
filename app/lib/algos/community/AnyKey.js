var common = require('./common');

module.exports = function (pubkey, ctx, amNext, done) {
  common.computeIndicators(pubkey, ctx, amNext, context2AnalyticalMembership, context2AnalyticalVoting, done);
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
  var hasInvalidKey = false; // Key never expires in such algorithm
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
