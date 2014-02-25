var async     = require('async');
var mongoose  = require('mongoose');
var _         = require('underscore');
var Amendment = mongoose.model('Amendment');
var Merkle    = mongoose.model('Merkle');
var log4js    = require('log4js');
var service   = require('../service');

// Services
var ParametersService = service.Parameters;
var MerkleService     = service.Merkle;
var VoteService       = service.Vote;
var StrategyService   = service.Strategy;
var PeeringService    = service.Peering;
var SyncService       = service.Sync;
var ContractService   = service.Contract;

module.exports = function (pgp, currency, conf) {

  this.promoted = function (req, res) {
    showAmendment(res, ContractService.current());
  };

  this.promotedNumber = function (req, res) {
    async.waterfall([
      function (next){
        ParametersService.getAmendmentNumber(req, next);
      }
    ], function (err, number) {
      if(err){
        res.send(400, err);
        return;
      }
      async.waterfall([
        function (callback){
          Amendment.findPromotedByNumber(number, callback);
        }
      ], function (err, current) {
        showAmendment(res, current);
      });
    });
  };

  this.currentVotes = function (req, res) {
    async.waterfall([
      function (next){
        Amendment.current(next);
      },
      function (am, next){
        Merkle.signaturesOfAmendment(am.number, am.hash, next);
      },
      function (merkle, next){
        MerkleService.processForURL(req, merkle, Merkle.mapForSignatures, next);
      }
    ], function (err, json) {
      if(err){
        res.send(404, err);
        return;
      }
      MerkleService.merkleDone(req, res, json);
    });
  };

  this.viewAM = {

    signatures: function (req, res) {
      amendmentMerkle(req, res, Merkle.signaturesWrittenForAmendment, Merkle.mapForSignatures);
    },

    self: function (req, res) {
      ParametersService.getAmendmentID(req, function (err, number, hash) {
        if(err){
          res.send(400, err);
          return;
        }
        async.waterfall([
          function (next){
            ParametersService.getAmendmentID(req, next);
          },
          function (number, hash, next){
            Amendment.findByNumberAndHash(number, hash, next);
          },
        ], function (err, found) {
          if(err){
            res.send(404, err);
            return;
          }
          res.setHeader("Content-Type", "text/plain");
          res.send(JSON.stringify(found.json(), null, "  "));
        });
      });
    }
  };

  this.votes = {

    sigs: function (req, res) {
      async.waterfall([
        function (next){
          ParametersService.getAmendmentID(req, next);
        },
        function (number, hash, next){
          Merkle.signaturesOfAmendment(number, hash, next);
        },
        function (merkle, next){
          MerkleService.processForURL(req, merkle, Merkle.mapForSignatures, next);
        }
      ], function (err, json) {
        if(err){
          res.send(400, err);
          return;
        }
        MerkleService.merkleDone(req, res, json);
      });
    },

    get: function (req, res) {
      VoteService.votesIndex(function (err, json) {
        if(err){
          res.send(500, err);
          return;
        }
        if(req.query.nice){
          res.setHeader("Content-Type", "text/plain");
          res.end(JSON.stringify(json, null, "  "));
        }
        else res.end(JSON.stringify(json));
      });
    },

    post: function (req, res) {

      async.waterfall([
        function (callback){
          ParametersService.getVote(req, callback);
        },
        function (vote, callback){
          VoteService.submit(vote, callback);
        }
      ], function (err, am, recordedVote) {
        if(err){
          res.send(400, err);
          console.error(err);
          return;
        }
        // Promoted or not, vote is recorded
        res.end(JSON.stringify({
          amendment: am.json(),
          signature: recordedVote.signature
        }));
      });
    }
  }
  
  return this;
}

function amendmentMerkle (req, res, merkleSource, merkleMap) {
  ParametersService.getAmendmentID(req, function (err, number, hash) {
    if(err){
      res.send(400, err);
      return;
    }
    async.waterfall([
      function (next){
        Amendment.findByNumberAndHash(number, hash, next);
      },
    ], function (err, am) {
      if(err){
        res.send(404, err);
        return;
      }
      async.waterfall([
        function (next){
          merkleSource.call(merkleSource, am.number, am.hash, next);
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

function showAmendment (res, current) {
  if(!current){
    res.send(404, 'No amendment yet promoted');
    return;
  }
  res.setHeader("Content-Type", "text/plain");
  res.send(JSON.stringify(current.json(), null, "  "));
}
