var async = require('async');
var _     = require('underscore');

module.exports = function(conn, block, dal) {

  var Identity      = conn.model('Identity');
  var Link          = conn.model('Link');
  var Source        = conn.model('Source');

  function BlockCheckerDao () {

    var dao = this;
    
    this.existsUserID = function (uid, done) {
      async.waterfall([
        function (next){
          Identity.getWrittenByUID(uid, next);
        },
        function (idty, next){
          next(null, idty != null);
        }
      ], done);
    };
    
    this.existsPubkey = function (pubkey, done) {
      async.waterfall([
        function (next){
          Identity.getWritten(pubkey, next);
        },
        function (idty, next){
          next(null, idty != null);
        }
      ], done);
    };
    
    this.getIdentityByPubkey = function (pubkey, done) {
      Identity.getWritten(pubkey, done);
    };
    
    this.isMember = function (pubkey, done) {
      Identity.isMember(pubkey, done);
    };

    this.isLeaving = function (pubkey, done) {
      Identity.isLeaving(pubkey, done);
    };

    this.getPreviousLinkFor = function (from, to, done) {
      async.waterfall([
        function (next){
          dal.getObsoletesFromTo(from, to, next);
        },
        function (links, next){
          next(null, links.length > 0 ? links[0] : null);
        }
      ], done);
    };

    this.getValidLinksTo = function (to, done) {
      dal.getValidLinksTo(to, done);
    };

    this.getMembers = function (done) {
      Identity.getMembers(done);
    };

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
    };

    this.getPreviousLinkFromTo = function (from, to, done) {
      dal.getValidFromTo(from, to, done);
    };

    this.getValidLinksFrom = function (member, done) {
      dal.getValidLinksFrom(member, done);
    };

    this.getCurrent = function (done) {
      dal.getCurrentBlockOrNull(done);
    };

    this.getBlock = function (number, done) {
      dal.getBlock(number, done);
    };

    this.findBlock = function (number, fpr, done) {
      dal.getBlock(number, done);
    };

    this.getToBeKicked = function (blockNumber, done) {
      Identity.getToBeKicked(done);
    };

    this.lastBlocksOfIssuer = function (issuer, count, done) {
      dal.lastBlocksOfIssuer(issuer, count, done);
    };

    this.getLastUDBlock = function (done) {
      dal.lastUDBlock(done);
    };

    this.isAvailableUDSource = function (pubkey, number, fingerprint, amount, done) {
      Source.existsNotConsumed('D', pubkey, number, fingerprint, amount, done);
    };

    this.isAvailableTXSource = function (pubkey, number, fingerprint, amount, done) {
      Source.existsNotConsumed('T', pubkey, number, fingerprint, amount, done);
    };

    this.getCurrentMembershipNumber = function (pubkey, done) {
      async.waterfall([
        function (next) {
          Identity.getWritten(pubkey, next);
        },
        function (idty, next) {
          if (idty == null)
            next(null, -1);
          else
            next(null, idty.currentMSN);
        }
      ], done);
    };

    this.getLastBlocks = function (count, done) {
      dal.getLastBlocks(count, done);
    };

    this.getIssuersBetween = function (bStart, bEnd, done) {
      async.waterfall([
        function (next) {
          dal.getBlocksBetween(bStart, bEnd, next);
        },
        function (blocks, next) {
          next(null, _.pluck(blocks, 'issuer'));
        }
      ], done);
    };

    this.getTimesBetween = function (bStart, bEnd, done) {
      async.waterfall([
        function (next) {
          dal.getBlocksBetween(bStart, bEnd, next);
        },
        function (blocks, next) {
          next(null, _.pluck(blocks, 'time'));
        }
      ], done);
    };
  }

  return new BlockCheckerDao(block);
};
