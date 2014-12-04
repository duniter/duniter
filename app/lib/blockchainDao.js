var async = require('async');
var _     = require('underscore');

module.exports = function(conn, block) {

  var Identity      = conn.model('Identity');
  var Block         = conn.model('Block');
  var Link          = conn.model('Link');
  var Source        = conn.model('Source');

  function BlockCheckerDao (block) {

    var dao = this;
    
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

    this.getMembersWithEnoughSigWoT = function (minSigToWoT, done) {
      var membersWithEnough = [];
      async.waterfall([
        function (next) {
          Identity.getMembers(next);
        },
        function (members, next) {
          async.forEachSeries(members, function (member, callback) {
            async.waterfall([
              function (next) {
                dao.getValidLinksFrom(member.pubkey, next);
              },
              function (links, next) {
                if (links.length >= minSigToWoT)
                  membersWithEnough.push(member);
                next();
              }
            ], callback);
          }, next);
        }
      ], function (err) {
        done(err, membersWithEnough);
      });
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

    this.getBlock = function (number, done) {
      Block.findByNumber(number, done);
    }

    this.findBlock = function (number, fpr, done) {
      Block.findByNumberAndHash(number, fpr, done);
    }

    this.getToBeKicked = function (blockNumber, done) {
      Identity.getToBeKicked(done);
    },

    this.lastBlocksOfIssuer = function (issuer, count, done) {
      Block.lastBlocksOfIssuer(issuer, count, done);
    },

    this.getLastUDBlock = function (done) {
      Block.lastUDBlock(done);
    },

    this.isAvailableUDSource = function (pubkey, number, fingerprint, amount, done) {
      Source.existsNotConsumed('D', pubkey, number, fingerprint, amount, done);
    },

    this.isAvailableTXSource = function (pubkey, number, fingerprint, amount, done) {
      Source.existsNotConsumed('T', pubkey, number, fingerprint, amount, done);
    },

    this.getCurrentMembershipNumber = function (pubkey, done) {
      async.waterfall([
        function (next) {
          Identity.getMember(pubkey, next);
        },
        function (idty, next) {
          if (idty == null)
            next(null, -1);
          else
            next(null, idty.currentMSN);
        }
      ], done);
    },

    this.getLastBlocks = function (count, done) {
      Block.getLastBlocks(count, done);
    },

    this.getIssuersBetween = function (bStart, bEnd, done) {
      async.waterfall([
        function (next) {
          Block.getBlocksBetween(bStart, bEnd, next);
        },
        function (blocks, next) {
          next(null, _.pluck(blocks, 'issuer'));
        }
      ], done);
    }
  }

  return new BlockCheckerDao(block);
}
