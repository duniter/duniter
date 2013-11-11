var fs    = require('fs'),
util      = require('util'),
async     = require('async'),
mongoose  = require('mongoose'),
PublicKey = mongoose.model('PublicKey'),
Merkle    = mongoose.model('Merkle'),
_         = require('underscore'),
stream    = require('stream');
var log4js    = require('log4js');
var logger    = log4js.getLogger();
var MerkleService     = require('../service/MerkleService');
var ParametersService = require('../service/ParametersService');
var http = require('../service/HTTPService')();

module.exports = function (pgp, currency, conf) {

  var PeeringService = require('../service/PeeringService').get(pgp, currency, conf);
  var PublicKeyService = require('../service/PublicKeyService')(currency);

  this.getAll = function (req, res) {
    async.waterfall([
      function (next){
        Merkle.forPublicKeys(next);
      },
      function (merkle, next){
        MerkleService.processForURL(req, merkle, Merkle.mapForPublicKeys, next);
      }
    ], function (err, json) {
      if(err){
        res.send(400, err);
        return;
      }
      MerkleService.merkleDone(req, res, json);
    });
  };

  this.lookup = function (req, res) {
    var op = req.query.op;
    var pattern = req.query.search;
    if(pattern !== undefined){
      PublicKey.search(pattern, function (err, foundKeys) {
        switch(op){
          case 'get':
            var count = foundKeys.length;
            var armor = '';
            if(foundKeys.length > 0){
              count = 1;
              armor = foundKeys[0].raw;
            }
            res.render('../app/views/pks/lookup_get.ejs', {"armor": armor, "search": pattern, "nbKeys": foundKeys.length}, function (err, text) {
              res.writeHead(200, {"Content-type": "text/html"});
              res.end(text);
            });
            break;
          case 'index':
            var cleaned = [];
            foundKeys.forEach(function (k) {
              cleaned.push(k.json());
            });
            res.writeHead(200);
            res.end(JSON.stringify({"keys": cleaned}, null, "  "));
            break;
          default:
            res.send(501, 'Operation not supported.');
            break;
        }
      });
    }
    else{
      res.send(500, 'No interface yet.');
    }
  };

  this.add = function (req, res) {
    async.waterfall([
      function (next){
        ParametersService.getPubkey(req, next);
      },
      function (aaPubkey, aaSignature, next){
        PublicKeyService.submitPubkey(aaPubkey, aaSignature, next);
      }
    ], function (err, pubkey) {
      http.answer(res, 400, err, function () {
        logger.debug('Incoming pubkey: from: %s', pubkey.fingerprint);
        res.send(200, JSON.stringify(pubkey.json()));
        PeeringService.propagatePubkey(pubkey);
      });
    });
  };

  return this;
};
