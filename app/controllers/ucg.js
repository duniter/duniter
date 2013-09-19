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

module.exports = function (pgp, currency, conf) {

  var MerkleService = require('../service/MerkleService');
  var ParametersService = require('../service/ParametersService');
  var THTService = require('../service/THTService').get(currency);
  
  this.ascciiPubkey = pgp.keyring.privateKeys[0] ? pgp.keyring.privateKeys[0].obj.extractPublicKey() : '';

  this.pubkey = function (req, res) {
    res.send(200, this.ascciiPubkey);
  },

  this.peering = function (req, res) {
    var am = null;
    var pkMerkle = null;
    var msMerkle = null;
    var votesMerkle = null;
    async.waterfall([
      function (next){
        Amendment.current(function (err, currentAm) {
          am = currentAm;
          next();
        });
      },
      function (next){
        Merkle.forPublicKeys(next);
      },
      function (merkle, next){
        MerkleService.processForURL(req, merkle, null, next);
      },
      function (json, next){
        pkMerkle = json;
        Merkle.forNextMembership(next);
      },
      function (merkle, next){
        MerkleService.processForURL(req, merkle, null, next);
      },
      function (json, next){
        msMerkle = json;
        async.waterfall([
          function (cb){
            Merkle.signaturesOfAmendment(am ? am.number : undefined, am ? am.hash : undefined, cb);
          },
          function (merkle, cb){
            MerkleService.processForURL(req, merkle, null, cb);
          },
          function (json, cb){
            votesMerkle = json;
            cb();
          }
        ], next);
      }
    ], function (err, result) {
      if(err){
        res.send(500, err);
        return;
      }
      res.writeHead(200);
      res.end(JSON.stringify({
        currency: currency,
        key: ascciiPubkey != '' ? jpgp().certificate(this.ascciiPubkey).fingerprint : '',
        remote: {
          host: conf.remotehost ? conf.remotehost : '',
          ipv4: conf.remoteipv4 ? conf.remoteipv4 : '',
          ipv6: conf.remoteipv6 ? conf.remoteipv6 : '',
          port: conf.remoteport ? conf.remoteport : ''
        },
        contract: {
          currentNumber: am ? "" + am.number : '',
          hash: am ? am.hash : ''
        },
        "pks/all": pkMerkle,
        "hdc/community/memberships": msMerkle,
        "hdc/community/votes": votesMerkle
      }, null, "  "));
    });
  }

  this.forward = function (req, res) {
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
            if(!pubkey){
              next('Public key not found, POST at ucg/peering/peers to make the node retrieve it');
              return;
            }
            next();
          },
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
            next();
          },
          function (next){
            if(!fwd.fingerprint.match(new RegExp("^" + pubkey.fingerprint + "$", "g"))){
              next('Forward\'s fingerprint ('+fwd.fingerprint+') does not match signatory (' + pubkey.fingerprint + ')');
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
            Forward.find({ fingerprint: fwd.fingerprint, upstream: false }, next);
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
    ], function (err, recordedPR) {
      if(err){
        res.send(400, err);
      }
      else res.end(JSON.stringify(recordedPR.json(), null, "  "));
    });
  }

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
    async.waterfall([

      // Parameters
      function(callback){
        if(!(req.body && req.body.entry && req.body.signature)){
          callback('Requires a peering entry + signature');
          return;
        }
        callback(null, req.body.entry, req.body.signature);
      },

      // Check signature's key ID
      function(pr, sig, callback){
        var keyID = jpgp().signature(sig).issuer();
        if(!(keyID && keyID.length == 16)){
          callback('Cannot identify signature issuer`s keyID');
          return;
        }
        callback(null, new Peer(), pr + sig, keyID);
      },

      // Verify signature
      function(peer, signedPR, keyID, callback){

        async.waterfall([
          function (next){
            peer.parse(signedPR, next);
          },
          function (peer, next){
            peer.verify(currency, next);
          },
          // Looking for corresponding public key
          function(valid, next){
            if(!valid){
              next('Not a valid peering request');
              return;
            }
            require('request')('http://' + peer.getURL()+ '/ucg/pubkey', next);
          },
          function (httpRes, body, next){
            var cert = jpgp().certificate(body);
            if(!cert.fingerprint.match(new RegExp(keyID + "$", "g"))){
              next('Peer\'s public key ('+cert.fingerprint+') does not match signatory (0x' + keyID + ')');
              return;
            }
            if(!peer.fingerprint.match(new RegExp(keyID + "$", "g"))){
              next('Fingerprint in peering entry ('+cert.fingerprint+') does not match signatory (0x' + keyID + ')');
              return;
            }
            PublicKey.persistFromRaw(body, function (err) {
              next(err, body);
            });
          },
          function (body, next) {
            peer.verifySignature(body, next);
          },
          function (verified, next){
            if(!verified){
              next('Signature does not match');
              return;
            }
            next();
          },
          function (next){
            Peer.find({ fingerprint: peer.fingerprint }, next);
          },
          function (peers, next){
            var peerEntity = peer;
            var previousHash = null;
            if(peers.length > 0){
              // Already existing peer
              peerEntity = peers[0];
              previousHash = peerEntity.hash;
              peer.copyValues(peerEntity);
            }
            peerEntity.save(function (err) {
              next(err, peerEntity, previousHash);
            });
          },
          function (recordedPR, previousHash, next) {
            Merkle.updatePeers(recordedPR, previousHash, function (err, code, merkle) {
              next(err, recordedPR);
            });
          }
        ], callback);
      }
    ], function (err, recordedPR) {
      if(err){
        res.send(400, err);
      }
      else res.end(JSON.stringify(recordedPR.json(), null, "  "));
    });
  }

  this.upstreamAll = function (req, res) {
    givePeers({ forward: "ALL", upstream: true }, req, res);
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
    givePeers({ forward: "KEYS", upstream: true, keys: { $in: [matches[1]] } }, req, res);
  }

  this.downstreamAll = function (req, res) {
    givePeers({ forward: "ALL", upstream: false }, req, res);
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
    givePeers({ forward: "KEYS", upstream: false, keys: { $in: [matches[1]] } }, req, res);
  },

  this.thtPOST = function(req, res) {
    async.waterfall([
      function (callback) {
        ParametersService.getTHTEntry(req, callback);
      },
      function(entry, callback){
        THTService.submit(entry, callback);
      }
    ], function (err, entry) {
      if(err){
        res.send(400, err);
      }
      else res.end(JSON.stringify(entry.json()));
    });
  },

  this.thtGET = function(req, res) {
    async.waterfall([
      function (next){
        Merkle.THTEntries(next);
      },
      function (merkle, next){
        MerkleService.processForURL(req, merkle, Merkle.mapForTHTEntries, next);
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
        THTEntry.getTheOne(fingerprint, next);
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
    async.waterfall([
      function (next){
        Forward.find(criterias, next);
      },
      function (forwards, next){
        var json = { peers: [] };
        async.forEach(forwards, function(fwd, callback){
          var p = {};
          ['fingerprint', 'dns', 'ipv4', 'ipv6', 'port'].forEach(function (key) {
            p[key] = fwd[key] || "";
          });
          async.waterfall([
            function (cb){
              Peer.find({ fingerprint: fwd.fingerprint }, cb);
            },
            function (peers, cb){
              if(peers.length == 0){
                cb();
                return;
              }
              var peer = peers[0];
              ['dns', 'ipv4', 'ipv6', 'port'].forEach(function (key) {
                p[key] = peer[key] || "";
              });
              json.peers.push(p);
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
  
  return this;
}
