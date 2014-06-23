var async     = require('async');
var computing = require('./computing');

module.exports = { computeIndicators: computeIndicators };

/**
* Compute member's indicators according to a given context.
*/
function computeIndicators (pubkey, ctx, amNext, context2AnalyticalMembership, context2AnalyticalVoting, done) {
  var res = {};
  async.waterfall([
    async.apply(context2AnalyticalMembership, pubkey, ctx),
    async.apply(computing.Membership.Delta),
    function (msIndicator, next){
      res.membership = Math.max(-1, Math.min(1, msIndicator));
      context2AnalyticalVoting(ctx, amNext, res.membership == -1, next);
    },
    async.apply(computing.Voting),
    function (vtIndicator, next) {
      res.key = vtIndicator;
      next();
    }
  ], function (err) {
    // Mark out indicators to -1 and 1
    res.key = Math.max(-1, Math.min(1, res.key));
    done(err, res);
  });
}
