var async            = require('async');
var _                = require('underscore');
var es               = require('event-stream');
var unix2dos         = require('../lib/unix2dos');
var versionFilter    = require('../lib/streams/versionFilter');
var currencyFilter   = require('../lib/streams/currencyFilter');
var http2raw         = require('../lib/streams/parsers/http2raw');
var http400          = require('../lib/http/http400');
var parsers          = require('../lib/streams/parsers/doc');
var link2pubkey      = require('../lib/streams/link2pubkey');
var extractSignature = require('../lib/streams/extractSignature');
var verifySignature  = require('../lib/streams/verifySignature');
var logger           = require('../lib/logger')();

module.exports = function (hdcServer) {
  return new AmendmentBinding(hdcServer);
};

function AmendmentBinding (hdcServer) {

  var conf = hdcServer.conf;

  // Services
  var ParametersService = hdcServer.ParametersService;
  var MerkleService     = hdcServer.MerkleService;
  var VoteService       = hdcServer.VoteService;
  var StrategyService   = hdcServer.StrategyService;
  var PeeringService    = hdcServer.PeeringService;
  var SyncService       = hdcServer.SyncService;
  var ContractService   = hdcServer.ContractService;

  // Models
  var Amendment = hdcServer.conn.model('Amendment');
  var Merkle    = hdcServer.conn.model('Merkle');

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

  this.viewAM = {

    signatures: function (req, res) {
      amendmentMerkle(req, res, Merkle.signaturesOfAmendment.bind(Merkle), Merkle.mapForSignatures.bind(Merkle));
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
          Merkle.signaturesOfAmendment(number, hash, function (err, merkle) {
            next(err, merkle, number);
          });
        },
        function (merkle, number, next){
          MerkleService.processForURL(req, merkle, async.apply(Merkle.mapForSignatures.bind(Merkle), number), next);
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
      var onError = http400(res);
      http2raw.vote(req, onError)
        .pipe(unix2dos())
        .pipe(parsers.parseVote(onError))
        .pipe(versionFilter(onError))
        .pipe(currencyFilter(conf.currency, onError))
        .pipe(extractSignature(onError))
        .pipe(link2pubkey(hdcServer.PublicKeyService, onError))
        .pipe(verifySignature(hdcServer.PublicKeyService, onError))
        .pipe(hdcServer.singleWriteStream(onError))
        .pipe(es.stringify())
        .pipe(res);
    }
  }
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
