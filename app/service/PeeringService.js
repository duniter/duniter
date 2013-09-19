var jpgp      = require('../lib/jpgp');
var async     = require('async');
var mongoose  = require('mongoose');
var _         = require('underscore');
var THTEntry  = mongoose.model('THTEntry');
var Amendment = mongoose.model('Amendment');
var PublicKey = mongoose.model('PublicKey');
var Merkle    = mongoose.model('Merkle');
var Vote      = mongoose.model('Vote');
var Peer      = mongoose.model('Peer');

module.exports.get = function (currency) {

  this.submit = function(signedPR, keyID, callback){
    var peer = new Peer();
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
        PublicKey.persistFromRaw(body, '', function (err) {
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

  return this;
}