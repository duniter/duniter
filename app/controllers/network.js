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

  // Models
  var Peer      = peerServer.conn.model('Peer');
  var Amendment = peerServer.conn.model('Amendment');
  var Merkle    = peerServer.conn.model('Merkle');
  var Key       = peerServer.conn.model('Key');

  this.cert = PeeringService.cert;

  var that = this;

  this.peer = function (req, res) {
    var p = PeeringService.peer();
    p ? res.send(200, JSON.stringify(p.json(), null, "  ")) : res.send(500, 'Self peering was not found.');
  };

  this.peersGet = function (req, res) {
    async.waterfall([
      function (next){
        Merkle.peers(next);
      },
      function (merkle, next){
        MerkleService.processForURL(req, merkle, function (hashes, done) {
          Peer
          .find({ hash: { $in: hashes } })
          .sort('hash')
          .exec(function (err, peers) {
            var map = {};
            peers.forEach(function (peer){
              map[peer.hash] = peer.json();
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
  }

  this.peersPost = function (req, res) {
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
    var onError = http400(res);
    http2raw.status(req, onError)
      .pipe(dos2unix())
      .pipe(parsers.parseStatus(onError))
      .pipe(versionFilter(onError))
      .pipe(currencyFilter(conf.currency, onError))
      // .pipe(extractSignature(onError))
      // .pipe(link2pubkey(peerServer.PublicKeyService, onError))
      // .pipe(verifySignature(onError))
      .pipe(peerServer.singleWriteStream(onError))
      .pipe(jsoner())
      .pipe(es.stringify())
      .pipe(res);
  }
}
