var jpgp      = require('../lib/jpgp');
var async     = require('async');
var vucoin    = require('vucoin');
var mongoose  = require('mongoose');
var Peer      = mongoose.model('Peer');
var Amendment = mongoose.model('Amendment');
var Merkle    = mongoose.model('Merkle');

module.exports = function (pgp, currency, conf) {
  
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
        Merkle.processForURL(req, merkle, null, next);
      },
      function (json, next){
        pkMerkle = json;
        Merkle.forNextMembership(next);
      },
      function (merkle, next){
        Merkle.processForURL(req, merkle, null, next);
      },
      function (json, next){
        msMerkle = json;
        async.waterfall([
          function (cb){
            Merkle.signaturesOfAmendment(am ? am.number : undefined, am ? am.hash : undefined, cb);
          },
          function (merkle, cb){
            Merkle.processForURL(req, merkle, null, cb);
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

  this.subscribe = function (req, res) {
    async.waterfall([

      // Parameters
      function(callback){
        if(!(req.body && req.body.subscription && req.body.signature)){
          callback('Requires a peering subscription + signature');
          return;
        }
        callback(null, req.body.subscription, req.body.signature);
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
              next('Peer\'s public key ('+cert.fingerprint+') does not match peering request signatory (0x' + keyID + ')');
              return;
            }
            peer.fingerprint = cert.fingerprint;
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
            Peer.find({ fingerprint: peer.fingerprint, upstream: false }, next);
          },
          function (peers, next){
            var peerEntity = peer;
            if(peers.length > 0){
              // Already existing peer
              peerEntity = peers[0];
              peer.copyValues(peerEntity);
            }
            peerEntity.save(function (err) {
              next(err, peerEntity);
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

  this.downstreamAll = function (req, res) {
    async.waterfall([
      function (next){
        Peer.find({ forward: "ALL", upstream: true }, next);
      },
      function (peers, next){
        var json = { peers: [] };
        peers.forEach(function (peer) {
          json.peers.push({});
          ['key', 'dns', 'ipv4', 'ipv6'].forEach(function (key) {
            json.peers[json.peers.length - 1][key] = peer[key] || "";
          });
        });
        next(null, json);
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
