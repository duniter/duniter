var jpgp       = require('../lib/jpgp');
var async      = require('async');
var mongoose   = require('mongoose');
var _          = require('underscore');
var Membership = mongoose.model('Membership');
var Amendment  = mongoose.model('Amendment');
var PublicKey  = mongoose.model('PublicKey');
var Merkle     = mongoose.model('Merkle');

module.exports = function (pgp, currency, conf) {

  this.community = {

    join: function (req, res) {
      async.waterfall([

        // Parameters
        function(callback){
          if(!(req.body && req.body.request && req.body.signature)){
            callback('Requires a membership request + signature');
            return;
          }
          callback(null, req.body.request, req.body.signature);
        },

        // Check signature's key ID
        function(msr, sig, callback){
          var keyID = jpgp().signature(sig).issuer();
          if(!(keyID && keyID.length == 16)){
            callback('Cannot identify signature issuer`s keyID');
            return;
          }
          callback(null, msr + sig, keyID);
        },

        // Looking for corresponding public key
        function(signedMSR, keyID, callback){
          PublicKey.search("0x" + keyID, function (err, keys) {
            if(keys.length > 1){
              callback('Multiple PGP keys found for this keyID.');
              return;
            }
            if(keys.length < 1){
              callback('Corresponding Public Key not found.');
              return;
            }
            var pubkey = keys[0];
            var ms = new Membership();
            callback(null, ms, signedMSR, pubkey);
          });
        },

        // Verify signature
        function(ms, signedMSR, pubkey, callback){
          async.waterfall([
            function (next){
              ms.parse(signedMSR, next);
            },
            function (ms, next){
              ms.verify(currency, next);
            },
            function (valid, next){
              ms.verifySignature(pubkey.raw, next);
            },
            function (verified, next){
              var cert = jpgp().certificate(pubkey.raw);
              Membership.find({ fingerprint: cert.fingerprint, basis: ms.basis }, next);
            },
            function (requests, next){
              var msEntity = ms;
              if(requests.length > 0){
                msEntity = requests[0];
                ms.copyValues(msEntity);
              }
              msEntity.fingerprint = pubkey.fingerprint;
              msEntity.save(function (err) {
                next(err, msEntity);
              });
            },
            function (ms, next) {
              Merkle.forNextMembership(function (err, merkle) {
                next(err, ms, merkle);
              });
            },
            function (ms, merkle, next) {
              merkle.push(ms.hash);
              merkle.save(function (err) {
                next(err, ms);
              });
            }
          ], callback);
        }
      ], function (err, recordedMS) {
        if(err){
          res.send(400, err);
        }
        else res.end(JSON.stringify({
          request: recordedMS.hdc(),
          signature: recordedMS.signature
        }));
      });
    },

    members: function (req, res) {
      Merkle.forNextMembership(function (err, merkle) {
        if(err){
          res.send(500, err);
          return;
        }
        // Level
        var lstart = req.query.lstart ? parseInt(req.query.lstart) : 0;
        var lend   = req.query.lend ? parseInt(req.query.lend) : lstart + 1;
        if(req.query.extract){
          lstart = merkle.depth;
          lend = lstart + 1;
        }
        // Start
        var start = req.query.start ? parseInt(req.query.start) : 0;
        // End
        var end = req.query.end ? parseInt(req.query.end) : merkle.levels[merkle.depth.length];
        // Result
        var json = {
          "merkle": {
            "depth": merkle.depth,
            "nodesCount": merkle.nodes,
            "levelsCount": merkle.levels.length
          }
        };
        if(isNaN(lstart)) lstart = 0;
        if(isNaN(lend)) lend = lstart + 1;
        if(isNaN(start)) start = 0;
        if(!req.query.extract){
          json.merkle.levels = [];
          for (var i = Math.max(lstart, 0); i < merkle.levels.length && i < lend; i++) {
            var rowEnd = isNaN(end) ? merkle.levels[i].length : end;
            json.merkle.levels.push({
              "level": i,
              "nodes": merkle.levels[i].slice(Math.max(start, 0), Math.min(rowEnd, merkle.levels[i].length))
            });
          };
          merkleDone(req, res, json);
        }
        else {
          json.merkle.leaves = [];
          var rowEnd = isNaN(end) ? merkle.levels[merkle.depth].length : end;
          var hashes = merkle.levels[merkle.depth].slice(Math.max(start, 0), Math.min(rowEnd, merkle.levels[lstart].length));
          Membership
          .find({ hash: { $in: hashes } })
          .sort('hash')
          .exec(function (err, memberships) {
            var map = {};
            memberships.forEach(function (m){
              map[m.hash] = m;
            });
            hashes.forEach(function (hash, index){
              json.merkle.leaves.push({
                "index": index,
                "hash": merkle.levels[lstart][index],
                "value": {
                  "signature": map[hash].signature,
                  "request": {
                    "version": map[hash].version,
                    "currency": map[hash].currency,
                    "status": map[hash].status,
                    "basis": map[hash].basis
                  }
                },
              });
            });
            merkleDone(req, res, json);
          });
        }
      });
    }
  };
  
  return this;
}

function merkleDone(req, res, json) {
  if(req.query.nice){
    res.setHeader("Content-Type", "text/plain");
    res.end(JSON.stringify(json, null, "  "));
  }
  else res.end(JSON.stringify(json));
}
