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
var Key       = mongoose.model('Key');

module.exports = function (pgp, currency, conf) {

  var MerkleService = require('../service/MerkleService');
  var ParametersService = require('../service/ParametersService');
  var THTService = require('../service/THTService').get(currency);
  var PeeringService = require('../service/PeeringService').get(pgp, currency, conf);

  this.ascciiPubkey = pgp.keyring.privateKeys[0] ? pgp.keyring.privateKeys[0].obj.extractPublicKey() : '';
  this.cert = this.ascciiPubkey ? jpgp().certificate(this.ascciiPubkey) : { fingerprint: '' };

  var that = this;

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
    ], function (err, recordedPR) {
      if(err){
        console.log(err);
        res.send(errCode, err);
      }
      else res.end(JSON.stringify(recordedPR.json(), null, "  "));
    });
  }

  this.peer = function (req, res) {
    async.waterfall([
      function (next){
        Peer.getTheOne(that.cert.fingerprint, next);
      },
    ], function (err, found) {
      if(err){
        res.send(500, err);
        return;
      }
      res.send(200, JSON.stringify(found.json(), null, "  "));
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
      function(next){
        ParametersService.getPeeringEntry(req, next);
      },

      function (signedPR, pubkey, next) {
        PeeringService.submit(signedPR, pubkey, next);
      }

    ], function (err, recordedPR) {
      if(err){
        res.send(400, err);
      }
      else{
        res.end(JSON.stringify(recordedPR.json(), null, "  "));
        PeeringService.propagatePeering(recordedPR);
      }
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
        ParametersService.getTHTEntry(req, callback);
      },
      function(entry, callback){
        THTService.submit(entry, callback);
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
            var manual = conf.kmanagement == 'KEYS';
            if(manual){
              callback();
              return;
            }
            Key.setManaged(entry.fingerprint, true, that.cert.fingerprint, callback);
          },
          propagates: function(callback){
            PeeringService.propagateTHT(req, function (err, propagated) {
              if(err && !propagated){
                console.log('Not propagated: %s', err);
              }
              else if(!propagated){
                console.log('Unknown error during propagation');
              }
              callback();
            });
          },
          callback: function (callback) {
            PeeringService.initForwards(callback);
          }
        },
        function(err) {
          if(err) console.error('Error during THT POST: ' + err);
        });
      }
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

  this.managedKeys = function (req, res) {
    async.waterfall([
      function (next){
        Merkle.managedKeys(next);
      },
      function (merkle, next){
        MerkleService.processForURL(req, merkle, Merkle.mapIdentical, next);
      }
    ], function (err, json) {
      if(err){
        res.send(500, err);
        return;
      }
      MerkleService.merkleDone(req, res, json);
    });
  }

  function givePeers (criterias, req, res) {
    var that = this;
    var oneWay = criterias.from ? 'from' : 'to';
    var otherWay = criterias.from ? 'to' : 'from';
    async.waterfall([
      function (next){
        Forward.find(criterias, next);
      },
      function (forwards, next){
        var json = { peers: [] };
        async.forEach(forwards, function(fwd, callback){
          var p = { fingerprint: fwd[oneWay] || "" };
          async.waterfall([
            function (cb){
              Peer.find({ fingerprint: fwd[otherWay] }, cb);
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

  this.statusPOST = function(req, res) {
    var that = this;
    async.waterfall([
      function (callback) {
        ParametersService.getStatus(req, callback);
      },
      function(signedStatus, callback){
        PeeringService.submitStatus(signedStatus, callback);
      }
    ], function (err, status, peer) {
      if(err){
        res.send(400, err);
        return;
      }
      // Answers
      process.nextTick(function () {
        res.end(JSON.stringify(status.json()));
      });
      if(status.isNew()){
        // Send forwards for this node
        process.nextTick(function () {
          PeeringService.initForwards(function (err) {
            console.log('Renegociated FORWARD');
            if(err){
              console.error('But encountered following error: %s', err);
            }
          }, peer ? [ peer.fingerprint ] : null);
        });
      }
    });
  }
  
  return this;
}
