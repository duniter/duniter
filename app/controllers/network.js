"use strict";
var async            = require('async');
var es               = require('event-stream');
var dos2unix         = require('../lib/dos2unix');
var versionFilter    = require('../lib/streams/versionFilter');
var currencyFilter   = require('../lib/streams/currencyFilter');
var http2raw         = require('../lib/streams/parsers/http2raw');
var jsoner           = require('../lib/streams/jsoner');
var http400          = require('../lib/http/http400');
var parsers          = require('../lib/streams/parsers/doc');
var constants        = require('../lib/constants');
var Peer             = require('../lib/entity/peer');

module.exports = function (peerServer, conf) {
  return new NetworkBinding(peerServer, conf);
};

function NetworkBinding (peerServer, conf) {

  // Services
  var MerkleService     = peerServer.MerkleService;
  var PeeringService    = peerServer.PeeringService;

  this.cert = PeeringService.cert;

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
            });
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
      .pipe(peerServer.singleWriteStream(onError))
      .pipe(jsoner())
      .pipe(es.stringify())
      .pipe(res);
  };

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
            .pipe(peerServer.singleWriteStream(errorPeer))
            .pipe(es.mapSync(function () {
              next();
            }));
        }
        else next();
      },
      function (next) {
        http2raw.status(req, next)
          .pipe(dos2unix())
          .pipe(parsers.parseStatus(next))
          .pipe(versionFilter(next))
          .pipe(currencyFilter(conf.currency, next))
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
  };
}
