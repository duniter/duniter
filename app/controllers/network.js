var async            = require('async');
var vucoin           = require('vucoin');
var _                = require('underscore');
var es               = require('event-stream');
var dos2unix         = require('../lib/dos2unix');
var versionFilter    = require('../lib/streams/versionFilter');
var currencyFilter   = require('../lib/streams/currencyFilter');
var http2raw         = require('../lib/streams/parsers/http2raw');
var jsoner           = require('../lib/streams/jsoner');
var http400          = require('../lib/http/http400');
var parsers          = require('../lib/streams/parsers/doc');
var link2pubkey      = require('../lib/streams/link2pubkey');
var extractSignature = require('../lib/streams/extractSignature');
var verifySignature  = require('../lib/streams/verifySignature');
var logger           = require('../lib/logger');
var constants        = require('../lib/constants');
var Peer             = require('../lib/entity/peer');
var plogger          = logger('peering');
var slogger          = logger('status');

module.exports = function (peerServer, conf) {
  return new NetworkBinding(peerServer, conf);
};

function NetworkBinding (peerServer, conf) {

  // Services
  var http              = peerServer.HTTPService;
  var MerkleService     = peerServer.MerkleService;
  var ParametersService = peerServer.ParametersService;
  var PeeringService    = peerServer.PeeringService;

  this.cert = PeeringService.cert;

  var that = this;

  this.peer = function (req, res) {
    res.type('application/json');
    var p = PeeringService.peer();
    p ? res.send(200, JSON.stringify(p.json(), null, "  ")) : res.send(500, 'Self peering was not found.');
  };

  this.peersGet = function (req, res) {
    res.type('application/json');
    async.waterfall([
      function (next){
        peerServer.dal.merkleForPeers(next);
      },
      function (merkle, next){
        MerkleService.processForURL(req, merkle, function (hashes, done) {
          peerServer.dal.findPeersWhoseHashIsIn(hashes)
            .then(function(peers) {
              var map = {};
              peers.forEach(function (peer){
                map[peer.hash] = Peer.statics.peerize(peer).json();
              });
              done(null, map);
            })
        }, next);
      }
    ], function (err, json) {
      if(err){
        res.send(500, err);
        return;
      }
      MerkleService.merkleDone(req, res, json);
    });
  };

  this.peersPost = function (req, res) {
    res.type('application/json');
    var onError = http400(res);
    http2raw.peer(req, onError)
      .pipe(dos2unix())
      .pipe(parsers.parsePeer(onError))
      .pipe(versionFilter(onError))
      .pipe(currencyFilter(conf.currency, onError))
      // .pipe(verifySignature(onError))
      .pipe(peerServer.singleWriteStream(onError))
      .pipe(jsoner())
      .pipe(es.stringify())
      .pipe(res);
  }

  this.statusPOST = function(req, res) {
    res.type('application/json');
    var onError = http400(res);
    async.waterfall([
      function (next) {
        function errorPeer (err) {
          if (err == constants.ERROR.PEER.ALREADY_RECORDED)
            next();
          else
            next(err);
        }
        // If peer is provided, parse it first
        if (req.body && req.body.peer) {
          http2raw.peer(req, errorPeer)
            .pipe(dos2unix())
            .pipe(parsers.parsePeer(errorPeer))
            .pipe(versionFilter(errorPeer))
            .pipe(currencyFilter(conf.currency, errorPeer))
            // .pipe(verifySignature(errorPeer))
            .pipe(peerServer.singleWriteStream(errorPeer))
            .pipe(es.mapSync(function (data) {
              next();
            }))
        }
        else next();
      },
      function (next) {
        http2raw.status(req, next)
          .pipe(dos2unix())
          .pipe(parsers.parseStatus(next))
          .pipe(versionFilter(next))
          .pipe(currencyFilter(conf.currency, next))
          // .pipe(extractSignature(next))
          // .pipe(link2pubkey(peerServer.PublicKeyService, next))
          // .pipe(verifySignature(next))
          .pipe(peerServer.singleWriteStream(next))
          .pipe(jsoner())
          .pipe(es.stringify())
          .pipe(res);
        next();
      }
    ], function (err) {
      if (err)
        onError(err);
    });
  }
}
