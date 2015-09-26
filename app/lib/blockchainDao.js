"use strict";
var async = require('async');
var _     = require('underscore');

module.exports = function(dal) {

  // For old function signature
  if (arguments.length == 2) {
    dal = arguments[1];
  }

  function BlockCheckerDao () {

    var dao = this;

    this.dal = dal;
    
    this.existsUserID = function (uid, done) {
      async.waterfall([
        function (next){
          dal.getWrittenByUID(uid).then(_.partial(next, null)).catch(next);
        },
        function (idty, next){
          next(null, idty != null);
        }
      ], done);
    };
    
    this.existsPubkey = function (pubkey, done) {
      async.waterfall([
        function (next){
          dal.getWritten(pubkey, next);
        },
        function (idty, next){
          next(null, idty != null);
        }
      ], done);
    };
    
    this.getIdentityByPubkey = function (pubkey, done) {
      dal.getWritten(pubkey, done);
    };
    
    this.isMember = function (pubkey, done) {
      dal.isMember(pubkey, done);
    };

    this.isLeaving = function (pubkey, done) {
      dal.isLeaving(pubkey, done);
    };

    this.getPreviousLinkFor = function (from, to, done) {
      async.waterfall([
        function (next){
          dal.getObsoletesFromTo(from, to).then(_.partial(next, null)).catch(next);
        },
        function (links, next){
          next(null, links.length > 0 ? links[0] : null);
        }
      ], done);
    };

    this.getValidLinksTo = function (to, done) {
      dal.getValidLinksTo(to).then(_.partial(done, null)).catch(done);
    };

    this.getMembers = function (done) {
      dal.getMembers(done);
    };

    this.getMembersWithEnoughSigWoT = function (minSigToWoT, done) {
      var membersWithEnough = [];
      async.waterfall([
        function (next) {
          dal.getMembers(next);
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
      dal.getValidFromTo(from, to).then(_.partial(done, null)).catch(done);
    };

    this.getValidLinksFrom = function (member, done) {
      dal.getValidLinksFrom(member).then(_.partial(done, null)).catch(done);
    };

    this.getCurrent = function (done) {
      dal.getCurrentBlockOrNull(done);
    };

    this.getBlock = function (number, done) {
      return dal.getBlock(number, done);
    };

    this.findBlock = function (number, fpr, done) {
      dal.getBlockByNumberAndHash(number, fpr, done);
    };

    this.getToBeKicked = function (blockNumber, done) {
      dal.getToBeKicked(done);
    };

    this.lastBlockOfIssuer = function (issuer) {
      return dal.lastBlockOfIssuer(issuer);
    };

    this.getLastUDBlock = function (done) {
      dal.lastUDBlock().then(_.partial(done, null)).catch(done);
    };

    this.isAvailableUDSource = function (pubkey, number, fingerprint, amount, done) {
      dal.existsNotConsumed('D', pubkey, number, fingerprint, amount).then(_.partial(done, null)).catch(done);
    };

    this.isAvailableTXSource = function (pubkey, number, fingerprint, amount, done) {
      dal.existsNotConsumed('T', pubkey, number, fingerprint, amount).then(_.partial(done, null)).catch(done);
    };

    this.getCurrentMembershipNumber = function (pubkey, done) {
      async.waterfall([
        function (next) {
          dal.getWritten(pubkey, next);
        },
        function (idty, next) {
          if (idty == null)
            next(null, -1);
          else
            next(null, idty.currentMSN);
        }
      ], done);
    };

    this.getIssuersBetween = function (bStart, bEnd, done) {
      async.waterfall([
        function (next) {
          dal.getBlocksBetween(bStart, bEnd).then(_.partial(next, null)).catch(next);
        },
        function (blocks, next) {
          next(null, _.pluck(blocks, 'issuer'));
        }
      ], done);
    };

    this.getTimesBetween = function (bStart, bEnd, done) {
      async.waterfall([
        function (next) {
          dal.getBlocksBetween(bStart, bEnd).then(_.partial(next, null)).catch(next);
        },
        function (blocks, next) {
          next(null, _.pluck(blocks, 'time'));
        }
      ], done);
    };
  }

  return new BlockCheckerDao();
};
