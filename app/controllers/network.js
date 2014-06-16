var jpgp             = require('../lib/jpgp');
var async            = require('async');
var vucoin           = require('vucoin');
var _                = require('underscore');
var openpgp          = require('openpgp');
var es               = require('event-stream');
var http2raw         = require('../lib/streams/parsers/http2raw');
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
  var WalletService     = peerServer.WalletService;
  var PeeringService    = peerServer.PeeringService;

  // Models
  var Peer      = peerServer.conn.model('Peer');
  var Forward   = peerServer.conn.model('Forward');
  var Amendment = peerServer.conn.model('Amendment');
  var PublicKey = peerServer.conn.model('PublicKey');
  var Merkle    = peerServer.conn.model('Merkle');
  var Wallet    = peerServer.conn.model('Wallet');
  var Key       = peerServer.conn.model('Key');

  this.cert = PeeringService.cert;

  var that = this;

  this.pubkey = function (req, res) {
    res.send(200, PeeringService.ascciiPubkey);
  },

  this.forward = function (req, res) {
    var onError = http400(res);
    http2raw.forward(req, onError)
      .pipe(parsers.parseForward(onError))
      .pipe(extractSignature(onError))
      .pipe(link2pubkey(peerServer.PublicKeyService, onError))
      .pipe(verifySignature(peerServer.PublicKeyService, onError))
      .pipe(peerServer.singleWriteStream(onError))
      .pipe(es.stringify())
      .pipe(res);
  }

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
      .pipe(parsers.parsePeer(onError))
      .pipe(extractSignature(onError))
      .pipe(link2pubkey(peerServer.PublicKeyService, onError))
      .pipe(verifySignature(peerServer.PublicKeyService, onError))
      .pipe(peerServer.singleWriteStream(onError))
      .pipe(es.stringify())
      .pipe(res);
  }

  this.upstreamAll = function (req, res) {
    givePeers({ forward: "ALL", from: this.cert.fingerprint }, req, res);
  }

  this.upstreamKey = function (req, res) {

    if(!req.params.fingerprint){
      res.send(400, "Key fingerprint is required");
      return;
    }
    var matches = req.params.fingerprint.match(/^([A-Z\d]{40})$/);
    if(!matches){
      res.send(400, "Key fingerprint format is incorrect, must be an upper-cased SHA1 hash");
      return;
    }
    givePeers({ forward: "KEYS", from: this.cert.fingerprint, keys: { $in: [matches[1]] } }, req, res);
  }

  this.downstreamAll = function (req, res) {
    givePeers({ forward: "ALL", to: this.cert.fingerprint }, req, res);
  }

  this.downstreamKey = function (req, res) {

    if(!req.params.fingerprint){
      res.send(400, "Key fingerprint is required");
      return;
    }
    var matches = req.params.fingerprint.match(/^([A-Z\d]{40})$/);
    if(!matches){
      res.send(400, "Key fingerprint format is incorrect, must be an upper-cased SHA1 hash");
      return;
    }
    givePeers({ forward: "KEYS", to: this.cert.fingerprint, keys: { $in: [matches[1]] } }, req, res);
  },

  this.walletPOST = function(req, res) {
    var that = this;
    async.waterfall([
      function (callback) {
        ParametersService.getWallet(req, callback);
      },
      function(entry, callback){
        WalletService.submit(entry, callback);
      }
    ], function (err, entry) {
      if(err){
        res.send(400, err);
      }
      else{
        async.series({
          answers: function(callback){
            res.end(JSON.stringify(entry.json()));
            callback();
          },
          manageKey: function(callback){
            var all = conf.kmanagement == 'ALL';
            if(all){
              // Wallet entry new/changed: if kmanagement == ALL, manage it
              Key.setManaged(entry.fingerprint, true, callback);
              return;
            }
            // If kmanagement == KEYS, then it should have been set manually earlier, or can be later
            callback();
          },
          propagates: function(callback){
            PeeringService.propagateWallet(entry, function (err, propagated) {
              if(err && !propagated){
                tlogger.error('Not propagated: %s', err);
              }
              else if(!propagated){
                tlogger.error('Unknown error during propagation');
              }
              callback();
            });
          }
        },
        function(err) {
          if(err) tlogger.error('Error during Wallet POST: ' + err);
        });
      }
    });
  },

  this.walletGET = function(req, res) {
    async.waterfall([
      function (next){
        Merkle.WalletEntries(next);
      },
      function (merkle, next){
        MerkleService.processForURL(req, merkle, Merkle.mapForWalletEntries.bind(Merkle), next);
      }
    ], function (err, json) {
      if(err){
        res.send(500, err);
        return;
      }
      MerkleService.merkleDone(req, res, json);
    });
  },

  this.walletFPR = function(req, res) {
    var errCode = 404;
    async.waterfall([
      function (next){
        ParametersService.getFingerprint(req, function (err, fpr) {
          if(err) errCode = 400;
          next(err, fpr);
        });
      },
      function (fingerprint, next){
        Wallet.getTheOne(fingerprint, next);
      }
    ], function (err, entry) {
      if(err){
        res.send(errCode, err);
        return;
      }
      res.send(200, JSON.stringify(entry.json(), null, "  "));
    });
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
      .pipe(parsers.parseStatus(onError))
      .pipe(extractSignature(onError))
      .pipe(link2pubkey(peerServer.PublicKeyService, onError))
      .pipe(verifySignature(peerServer.PublicKeyService, onError))
      .pipe(peerServer.singleWriteStream(onError))
      .pipe(es.stringify())
      .pipe(res);
  }
}
