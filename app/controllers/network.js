var jpgp      = require('../lib/jpgp');
var async     = require('async');
var vucoin    = require('vucoin');
var mongoose  = require('mongoose');
var Peer      = mongoose.model('Peer');
var Forward   = mongoose.model('Forward');
var Amendment = mongoose.model('Amendment');
var PublicKey = mongoose.model('PublicKey');
var Merkle    = mongoose.model('Merkle');
var Wallet    = mongoose.model('Wallet');
var Key       = mongoose.model('Key');
var _         = require('underscore');
var openpgp   = require('openpgp');
var logger    = require('../lib/logger');
var plogger   = logger('peering');
var flogger   = logger('forward');
var slogger   = logger('status');
var tlogger   = logger('tht');
var service   = require('../service');

// Services
var http              = service.HTTP;
var MerkleService     = service.Merkle;
var ParametersService = service.Parameters;
var WalletService        = service.Wallet;
var PeeringService    = service.Peering;

module.exports = function (pgp, currency, conf) {

  var privateKey = openpgp.key.readArmored(conf.pgpkey).keys[0];
  this.ascciiPubkey = privateKey ? privateKey.toPublic().armor() : "";
  this.cert = this.ascciiPubkey ? jpgp().certificate(this.ascciiPubkey) : { fingerprint: '' };

  var that = this;

  this.pubkey = function (req, res) {
    res.send(200, this.ascciiPubkey);
  },

  this.forward = function (req, res) {
    var errCode = 400;
    async.waterfall([

      // Parameters
      function(callback){
        if(!(req.body && req.body.forward && req.body.signature)){
          callback('Requires a peering forward + signature');
          return;
        }
        callback(null, req.body.forward, req.body.signature);
      },

      // Check signature's key ID
      function(pr, sig, callback){
        PublicKey.getFromSignature(sig, function (err, pubkey) {
          callback(null, new Forward(), pr + sig, pubkey);
        });
      },

      // Verify signature
      function(fwd, signedPR, pubkey, callback){

        async.waterfall([
          function (next){
            fwd.parse(signedPR, next);
          },
          function (fwd, next){
            fwd.verify(currency, next);
          },
          function(valid, next){
            if(!valid){
              next('Not a valid peering request');
              return;
            }
            flogger.debug('⬇ %s type %s', fwd.from, fwd.forward);
            next();
          },
          function (next) {
            Peer.find({ fingerprint: fwd.from }, next);
          },
          function (peers, next) {
            if(peers.length == 0){
              errCode = 404;
              next('Peer ' + fwd.from + ' not found, POST at ucg/peering/peers first');
              return;
            }
            next();
          },
          function (next){
            if(!pubkey){
              next('Public key not found, POST at ucg/peering/peers to make the node retrieve it');
              return;
            }
            next();
          },
          function (next){
            if(!fwd.to.match(new RegExp("^" + cert.fingerprint + "$", "g"))){
              next('Node\'s fingerprint ('+cert.fingerprint+') is not concerned by this forwarding (' + fwd.to + ')');
              return;
            }
            if(!fwd.from.match(new RegExp("^" + pubkey.fingerprint + "$", "g"))){
              next('Forwarder\'s fingerprint ('+fwd.from+') does not match signatory (' + pubkey.fingerprint + ')');
              return;
            }
            fwd.verifySignature(pubkey.raw, next);
          },
          function (verified, next){
            if(!verified){
              next('Signature does not match');
              return;
            }
            next();
          },
          function (next){
            Forward.find({ from: fwd.from, to: this.cert.fingerprint }, next);
          },
          function (fwds, next){
            var fwdEntity = fwd;
            if(fwds.length > 0){
              // Already existing fwd
              fwdEntity = fwds[0];
              fwd.copyValues(fwdEntity);
            }
            fwdEntity.save(function (err) {
              next(err, fwdEntity);
            });
          }
        ], callback);
      }
    ], function (err, recordedFWD) {
      http.answer(res, errCode, err, function () {
        flogger.debug('✔ %s type %s', recordedFWD.from, recordedFWD.forward);
        res.end(JSON.stringify(recordedFWD.json(), null, "  "));
      });
    });
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
    var that = this;
    async.waterfall([

      // Parameters
      function(next){
        ParametersService.getPeeringEntry(req, next);
      },

      function (signedPR, pubkey, next) {
        PeeringService.submit(signedPR, pubkey, next);
      }

    ], function (err, recordedPR) {
      http.answer(res, 400, err, function () {
        plogger.debug('✔ %s %s:%s', recordedPR.fingerprint, recordedPR.getIPv4() || recordedPR.getIPv6(), recordedPR.getPort());
        res.end(JSON.stringify(recordedPR.json(), null, "  "));
        PeeringService.propagatePeering(recordedPR);
        PeeringService.helloToPeer(recordedPR);
      });
    });
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

  this.thtPOST = function(req, res) {
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

  this.thtGET = function(req, res) {
    async.waterfall([
      function (next){
        Merkle.WalletEntries(next);
      },
      function (merkle, next){
        MerkleService.processForURL(req, merkle, Merkle.mapForWalletEntries, next);
      }
    ], function (err, json) {
      if(err){
        res.send(500, err);
        return;
      }
      MerkleService.merkleDone(req, res, json);
    });
  },

  this.thtFPR = function(req, res) {
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
    var that = this;
    async.waterfall([
      function (callback) {
        ParametersService.getStatus(req, callback);
      },
      function(signedStatus, callback){
        PeeringService.submitStatus(signedStatus, callback);
      }
    ], function (err, status, peer, wasStatus) {
      http.answer(res, 400, err, function () {
        slogger.debug('⬇ %s status %s', peer.fingerprint, status.status);
        res.end(JSON.stringify(status.json()));
      })
    });
  }
  
  return this;
}
