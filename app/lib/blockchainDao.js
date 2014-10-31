var async = require('async');

module.exports = function(conn, block) {

  var Identity      = conn.model('Identity');
  var Block         = conn.model('Block');
  var Link          = conn.model('Link');
  var Source        = conn.model('Source');

  function BlockCheckerDao (block) {
    
    this.existsUserID = function (uid, done) {
      async.waterfall([
        function (next){
          Identity.getMemberByUserID(uid, next);
        },
        function (idty, next){
          next(null, idty != null);
        },
      ], done);
    }
    
    this.existsPubkey = function (pubkey, done) {
      async.waterfall([
        function (next){
          Identity.getMember(pubkey, next);
        },
        function (idty, next){
          next(null, idty != null);
        },
      ], done);
    }
    
    this.getIdentityByPubkey = function (pubkey, done) {
      Identity.getMember(pubkey, done);
    }
    
    this.isMember = function (pubkey, done) {
      Identity.isMember(pubkey, done);
    }

    this.getPreviousLinkFor = function (from, to, done) {
      async.waterfall([
        function (next){
          Link.getObsoletesFromTo(from, to, next);
        },
        function (links, next){
          next(null, links.length > 0 ? links[0] : null);
        },
      ], done);
    }

    this.getValidLinksTo = function (to, done) {
      Link.getValidLinksTo(to, done);
    }

    this.getMembers = function (done) {
      Identity.getMembers(done);
    }

    this.getPreviousLinkFromTo = function (from, to, done) {
      Link.getValidFromTo(from, to, done);
    }

    this.getValidLinksFrom = function (member, done) {
      Link.getValidLinksFrom(member, done);
    }

    this.getCurrent = function (done) {
      Block.current(function (err, current) {
        done(null, (err || !current) ? null : current);
      });
    }

    this.getToBeKicked = function (blockNumber, done) {
      Identity.getToBeKicked(done);
    },

    this.lastBlockOfIssuer = function (issuer, done) {
      Block.lastOfIssuer(issuer, done);
    },

    this.getLastUDBlock = function (done) {
      Block.lastUDBlock(done);
    },

    this.isAvailableUDSource = function (pubkey, number, fingerprint, amount, done) {
      Source.existsNotConsumed('D', pubkey, number, fingerprint, amount, done);
    },

    this.isAvailableTXSource = function (pubkey, number, fingerprint, amount, done) {
      Source.existsNotConsumed('T', pubkey, number, fingerprint, amount, done);
    }
  }

  return new BlockCheckerDao(block);
}
