var jpgp      = require('../lib/jpgp');
var async     = require('async');
var vucoin    = require('vucoin');
var mongoose  = require('mongoose');
var Peer      = mongoose.model('Peer');
var Forward   = mongoose.model('Forward');
var Amendment = mongoose.model('Amendment');
var PublicKey = mongoose.model('PublicKey');
var Merkle    = mongoose.model('Merkle');
var THTEntry  = mongoose.model('THTEntry');
var Key       = mongoose.model('Key');
var log4js    = require('log4js');
var _         = require('underscore');
var logger    = log4js.getLogger();
var mlogger      = log4js.getLogger('membership');
var vlogger      = log4js.getLogger('voting');
var http      = require('../service/HTTPService')();

module.exports = function (pgp, currency, conf) {

  var MerkleService = require('../service/MerkleService');
  var ParametersService = require('../service/ParametersService');
  var THTService = require('../service/THTService').get(currency);
  var PeeringService = require('../service/PeeringService').get(pgp, currency, conf);
  var SyncService = require('../service/SyncService').get(pgp, currency, conf);

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
        vlogger.debug('✔ %s\'s voting key -> %s', recordedVoting.issuer, recordedVoting.votingKey);
        res.end(JSON.stringify(recordedVoting.json(), null, "  "));
      });
    });
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

  return this;
}
