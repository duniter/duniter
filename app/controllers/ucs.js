var jpgp       = require('../lib/jpgp');
var async      = require('async');
var vucoin     = require('vucoin');
var mongoose   = require('mongoose');
var Peer       = mongoose.model('Peer');
var Forward    = mongoose.model('Forward');
var Amendment  = mongoose.model('Amendment');
var Membership = mongoose.model('Membership');
var Voting     = mongoose.model('Voting');
var PublicKey  = mongoose.model('PublicKey');
var Merkle     = mongoose.model('Merkle');
var THTEntry   = mongoose.model('THTEntry');
var Key        = mongoose.model('Key');
var log4js     = require('log4js');
var _          = require('underscore');
var logger     = log4js.getLogger();
var mlogger    = log4js.getLogger('membership');
var vlogger    = log4js.getLogger('voting');
var http       = require('../service/HTTPService')();

module.exports = function (pgp, currency, conf) {

  var MerkleService = require('../service/MerkleService');
  var ParametersService = require('../service/ParametersService');
  var THTService = require('../service/THTService').get(currency);
  var PeeringService = require('../service/PeeringService').get(pgp, currency, conf);
  var SyncService = require('../service/SyncService').get(pgp, currency, conf);

  this.parameters = function (req, res) {
    res.end(JSON.stringify({
      AMStart: conf.sync.votingStart,
      AMFrequency: conf.sync.votingFrequence,
      UDFrequency: conf.sync.UDFrequence,
      UD0: conf.sync.UD0,
      UDPercent: conf.sync.UDPercent,
      UDMinCoin: conf.sync.UDMinCoin,
      VotesPercent: conf.sync.VotesPercent,
      MembershipExpires: conf.sync.ActualizeFrequence
    }, null, "  "));
  };

  this.amendmentCurrent = function (req, res) {
    async.waterfall([
      function (next){
        Amendment.current(function (err, am) {
          next(null, am ? am.number + 1 : 0);
        });
      },
      function (amNumber, next){
        Amendment.getTheOneToBeVoted(amNumber, next);
      },
    ], function (err, am) {
      http.answer(res, 404, err, function () {
        // Render the amendment
        res.end(JSON.stringify(am.json(), null, "  "));
      });
    });
  };

  this.amendmentNext = function (req, res) {
    async.waterfall([
      function (next){
        ParametersService.getAmendmentNumber(req, next);
      },
      function (amNumber, next){
        Amendment.getTheOneToBeVoted(amNumber, next);
      },
    ], function (err, am) {
      http.answer(res, 404, err, function () {
        // Render the amendment
        res.end(JSON.stringify(am.json(), null, "  "));
      });
    });
  };

  this.membershipPost = function (req, res) {
    var that = this;
    async.waterfall([

      // Parameters
      function(next){
        ParametersService.getMembership(req, next);
      },

      function (signedMS, pubkey, next) {
        SyncService.submit(signedMS, pubkey, next);
      }

    ], function (err, recordedMS) {
      http.answer(res, 400, err, function () {
        mlogger.debug('✔ %s %s', recordedMS.issuer, recordedMS.membership);
        res.end(JSON.stringify(recordedMS.json(), null, "  "));
      });
    });
  };

  this.membershipCurrent = function (req, res) {
    var that = this;
    async.waterfall([

      // Parameters
      function(next){
        ParametersService.getFingerprint(req, next);
      },

      function (fingerprint, next) {
        Membership.getCurrent(fingerprint, next);
      }

    ], function (err, ms) {
      if (!ms) {
        res.send(404, "Not found");
        return;
      }
      http.answer(res, 400, err, function () {
        res.end(JSON.stringify(ms.json(), null, "  "));
      });
    });
  };

  this.membershipHistory = function (req, res) {
    var that = this;
    async.waterfall([

      // Parameters
      function(next){
        ParametersService.getFingerprint(req, next);
      },

      function (fingerprint, next) {
        Membership.getHistory(fingerprint, next);
      }

    ], function (err, history) {
      var list = [];
      history.forEach(function(ms){
        list.push(ms.json());
      });
      http.answer(res, 400, err, function () {
        res.end(JSON.stringify(list, null, "  "));
      });
    });
  };

  this.votingPost = function (req, res) {
    var that = this;
    async.waterfall([

      // Parameters
      function(next){
        ParametersService.getVoting(req, next);
      },

      function (signedVoting, pubkey, next) {
        SyncService.submitVoting(signedVoting, pubkey, next);
      }

    ], function (err, recordedVoting) {
      http.answer(res, 400, err, function () {
        vlogger.debug('✔ %s\'s voting key -> %s', "0x" + recordedVoting.issuer.substr(32), recordedVoting.votingKey);
        res.end(JSON.stringify(recordedVoting.json(), null, "  "));
      });
    });
  };

  this.votingCurrent = function (req, res) {
    var that = this;
    async.waterfall([

      // Parameters
      function(next){
        ParametersService.getFingerprint(req, next);
      },

      function (fingerprint, next) {
        Voting.getCurrent(fingerprint, next);
      }

    ], function (err, voting) {
      if (!voting) {
        res.send(404, "Not found");
        return;
      }
      http.answer(res, 400, err, function () {
        res.end(JSON.stringify(voting.json(), null, "  "));
      });
    });
  };

  this.votingHistory = function (req, res) {
    var that = this;
    async.waterfall([

      // Parameters
      function(next){
        ParametersService.getFingerprint(req, next);
      },

      function (fingerprint, next) {
        Voting.getHistory(fingerprint, next);
      }

    ], function (err, history) {
      var list = [];
      history.forEach(function(voting){
        list.push(voting.json());
      });
      http.answer(res, 400, err, function () {
        res.end(JSON.stringify(list, null, "  "));
      });
    });
  };

  this.amendmentMembers = function (req, res) {
    amendmentMerkle(req, res, Merkle.membersWrittenForProposedAmendment, Merkle.mapIdentical);
  };

  this.amendmentVoters = function (req, res) {
    amendmentMerkle(req, res, Merkle.votersWrittenForProposedAmendment, Merkle.mapIdentical);
  };

  this.askVote = function (req, res) {
    var that = this;
    async.waterfall([

      // Parameters
      function(next){
        ParametersService.getAmendmentNumber(req, next);
      },

      function (amNumber, next) {
        SyncService.getVote(amNumber, next)
      },

      function (vote, next){
        vote.getAmendment(function (err, am) {
          next(err, vote, am);
        });
      },

    ], function (err, vote, am) {

      http.answer(res, 404, err, function () {
        res.end(JSON.stringify({
          "issuer": vote.issuer,
          "amendment": am.json(),
          "signature": vote.signature
        }, null, "  "));
      });
    });
  };

  function amendmentMerkle (req, res, merkleSource, merkleMap) {
    ParametersService.getAmendmentNumber(req, function (err, number) {
      if(err){
        res.send(400, err);
        return;
      }
      async.waterfall([
        function (next){
          Amendment.getTheOneToBeVoted(number, next);
        },
      ], function (err, am) {
        if(err){
          res.send(404, err);
          return;
        }
        async.waterfall([
          function (next){
            merkleSource.call(merkleSource, am.number, next);
          },
          function (merkle, next){
            MerkleService.processForURL(req, merkle, merkleMap, next);
          }
        ], function (err, json) {
          if(err){
            res.send(400, err);
            return;
          }
          MerkleService.merkleDone(req, res, json);
        });
      });
    });
  }

  return this;
}
