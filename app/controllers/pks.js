var fs    = require('fs'),
util      = require('util'),
async     = require('async'),
mongoose  = require('mongoose'),
PublicKey = mongoose.model('PublicKey'),
Merkle    = mongoose.model('Merkle'),
_         = require('underscore'),
stream    = require('stream');
var MerkleService     = require('../service/MerkleService');
var ParametersService = require('../service/ParametersService');

module.exports = function (pgp, currency, conf) {

  var PeeringService = require('../service/PeeringService').get(pgp, currency, conf);

  this.all = function (req, res) {
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
    var pubkey;
    async.waterfall([
      function (next){
        ParametersService.getPubkey(req, next);
      },
      function (aaPubkey, aaSignature, next){
        PublicKey.verify(aaPubkey, aaSignature, function (err, verified) {
          next(err, aaPubkey, aaSignature);
        });
      },
      function (aaPubkey, aaSignature, next) {
        pubkey = new PublicKey({ raw: aaPubkey, signature: aaSignature });
        pubkey.construct(next);
      },
      function (next) {
        PublicKey.persist(pubkey, next);
      }
    ], function (err) {
      if(err){
        res.send(400, err);
        console.error(err);
        return;
      }
      res.send(200, JSON.stringify(pubkey.json()));
      if(!err){
        PeeringService.propagatePubkey(pubkey);
      }
    });
  };

  return this;
};
