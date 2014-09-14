var jpgp             = require('../lib/jpgp');
var async            = require('async');
var vucoin           = require('vucoin');
var _                = require('underscore');
var openpgp          = require('openpgp');
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
var flogger          = logger('forward');
var slogger          = logger('status');
var tlogger          = logger('wallet');

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
  var Forward   = peerServer.conn.model('Forward');
  var Amendment = peerServer.conn.model('Amendment');
  var PublicKey = peerServer.conn.model('PublicKey');
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

  function givePeers (criterias, req, res) {
    var that = this;
    var watcher = criterias.from ? 'to' : 'from';
    async.waterfall([
      function (next){
        Forward.find(criterias, next);
      },
      function (forwards, next){
        var json = { peers: [] };
        async.forEach(forwards, function(fwd, callback){
          var p = { fingerprint: fwd[watcher] || "" };
          async.waterfall([
            function (cb){
              Peer.find({ fingerprint: fwd[watcher] }, cb);
            },
            function (peers, cb){
              if(peers.length == 0){
                cb();
                return;
              }
              json.peers.push(p.fingerprint);
              cb();
            }
          ], callback);
        }, function(err){
          next(null, json);
        });
      }
    ], function (err, json) {
      if(err){
        res.send(500, err);
        return;
      }
      res.send(200, JSON.stringify(json, null, "  "));
    });
  }

  this.statusPOST = function(req, res) {
    var onError = http400(res);
    http2raw.status(req, onError)
      .pipe(dos2unix())
      .pipe(parsers.parseStatus(onError))
      .pipe(versionFilter(onError))
      .pipe(currencyFilter(conf.currency, onError))
      .pipe(extractSignature(onError))
      .pipe(link2pubkey(peerServer.PublicKeyService, onError))
      .pipe(verifySignature(onError))
      .pipe(peerServer.singleWriteStream(onError))
      .pipe(jsoner())
      .pipe(es.stringify())
      .pipe(res);
  }
}
