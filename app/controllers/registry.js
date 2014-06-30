var jpgp             = require('../lib/jpgp');
var async            = require('async');
var vucoin           = require('vucoin');
var _                = require('underscore');
var es               = require('event-stream');
var unix2dos         = require('../lib/unix2dos');
var versionFilter    = require('../lib/streams/versionFilter');
var currencyFilter   = require('../lib/streams/currencyFilter');
var http2raw         = require('../lib/streams/parsers/http2raw');
var jsoner           = require('../lib/streams/jsoner');
var http400          = require('../lib/http/http400');
var parsers          = require('../lib/streams/parsers/doc');
var link2pubkey      = require('../lib/streams/link2pubkey');
var extractSignature = require('../lib/streams/extractSignature');
var verifySignature  = require('../lib/streams/verifySignature');
var logger           = require('../lib/logger')();
var mlogger          = require('../lib/logger')('membership');
var vlogger          = require('../lib/logger')('voting');

module.exports = function (registryServer, conf) {
  return new RegistryBinding(registryServer, conf);
};

function RegistryBinding (registryServer, conf) {

  var that = this;

  // Services
  var http              = registryServer.HTTPService;
  var MerkleService     = registryServer.MerkleService;
  var ParametersService = registryServer.ParametersService;
  var PeeringService    = registryServer.PeeringService;
  var SyncService       = registryServer.SyncService;
  var ContractService   = registryServer.ContractService;

  // Models
  var Peer       = registryServer.conn.model('Peer');
  var Forward    = registryServer.conn.model('Forward');
  var Amendment  = registryServer.conn.model('Amendment');
  var Membership = registryServer.conn.model('Membership');
  var Voting     = registryServer.conn.model('Voting');
  var PublicKey  = registryServer.conn.model('PublicKey');
  var Merkle     = registryServer.conn.model('Merkle');
  var Key        = registryServer.conn.model('Key');

  this.parameters = function (req, res) {
    res.end(JSON.stringify({
      AMStart: conf.sync.AMStart,
      AMFrequency: conf.sync.AMFreq,
      UDFrequency: conf.sync.UDFreq,
      UD0: conf.sync.UD0,
      UDPercent: conf.sync.UDPercent,
      UDMinCoin: conf.sync.UDMinCoin,
      Consensus: conf.sync.Consensus
    }, null, "  "));
  };

  this.membershipPost = function (req, res) {
    var onError = http400(res);
    http2raw.membership(req, onError)
      .pipe(unix2dos())
      .pipe(parsers.parseMembership(onError))
      .pipe(versionFilter(onError))
      .pipe(currencyFilter(conf.currency, onError))
      .pipe(extractSignature(onError))
      .pipe(link2pubkey(registryServer.PublicKeyService, onError))
      .pipe(verifySignature(onError))
      .pipe(registryServer.singleWriteStream(onError))
      .pipe(jsoner())
      .pipe(es.stringify())
      .pipe(res);
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
    var onError = http400(res);
    http2raw.voting(req, onError)
      .pipe(unix2dos())
      .pipe(parsers.parseVoting(onError))
      .pipe(versionFilter(onError))
      .pipe(currencyFilter(conf.currency, onError))
      .pipe(extractSignature(onError))
      .pipe(link2pubkey(registryServer.PublicKeyService, onError))
      .pipe(verifySignature(onError))
      .pipe(registryServer.singleWriteStream(onError))
      .pipe(jsoner())
      .pipe(es.stringify())
      .pipe(res);
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

  this.membersIn = function (req, res) {
    processMerkle(Merkle.membersIn.bind(Merkle), Merkle.mapForMemberships.bind(Merkle), req, res);
  };

  this.membersOut = function (req, res) {
    processMerkle(Merkle.membersOut.bind(Merkle), Merkle.mapForMemberships.bind(Merkle), req, res);
  };

  this.votersIn = function (req, res) {
    processMerkle(Merkle.votersIn.bind(Merkle), Merkle.mapForVotings.bind(Merkle), req, res);
  };

  this.votersOut = function (req, res) {
    processMerkle(Merkle.votersOut.bind(Merkle), Merkle.mapForVotings.bind(Merkle), req, res);
  };

  this.communityFlowPost = function (req, res) {
    var onError = http400(res);
    http2raw.communityFlow(req, onError)
      .pipe(unix2dos())
      .pipe(parsers.parseCommunityFlow(onError))
      .pipe(versionFilter(onError))
      .pipe(currencyFilter(conf.currency, onError))
      .pipe(extractSignature(onError))
      .pipe(link2pubkey(registryServer.PublicKeyService, onError))
      .pipe(verifySignature(onError))
      .pipe(registryServer.singleWriteStream(onError))
      .pipe(jsoner())
      .pipe(es.stringify())
      .pipe(res);
  };

  function processMerkle (getMerkle, mapMerkle, req, res) {
    var that = this;
    async.waterfall([
      function (next) {
        ParametersService.getAmendmentNumberAndAlgo(req, next);
      },
      function (number, algo, next){
        getMerkle(number, algo, next);
      },
      function (merkle, next){
        MerkleService.processForURL(req, merkle, mapMerkle, next);
      }
    ], function (err, json) {
      if(err){
        res.send(400, err);
        return;
      }
      MerkleService.merkleDone(req, res, json);
    });
  }

  this.askSelf = function (req, res) {
    async.waterfall([

      function (next){
        ParametersService.getAmendmentNumberAndAlgo(req, next);
      },
      function (amNumber, algo, next){
        Amendment.getTheOneToBeVoted(amNumber, algo, next);
      },

    ], function (err, am) {
      http.answer(res, 404, err, function () {
        // Render the amendment
        res.end(JSON.stringify(am.json(), null, "  "));
      });
    });
  };

  this.askFlow = function (req, res) {
    var that = this;
    async.waterfall([

      // Parameters
      function(next){
        ParametersService.getAmendmentNumberAndAlgo(req, next);
      },

      function (amNumber, algo, next) {
        SyncService.getFlow(parseInt(amNumber), algo, next)
      },

    ], function (err, cf, am) {

      http.answer(res, 404, err, function () {
        res.end(JSON.stringify({
          "communityflow": cf.json()
        }, null, "  "));
      });
    });
  };

  this.askVote = function (req, res) {
    var that = this;
    async.waterfall([

      // Parameters
      function(next){
        ParametersService.getAmendmentNumberAndAlgo(req, next);
      },

      function (amNumber, algo, next) {
        SyncService.getVote(amNumber, algo, next);
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
}
