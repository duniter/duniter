var fs        = require('fs');
var util      = require('util');
var async     = require('async');
var mongoose  = require('mongoose');
var PublicKey = mongoose.model('PublicKey');
var Merkle    = mongoose.model('Merkle');
var _         = require('underscore');
var stream    = require('stream');
var log4js    = require('log4js');
var logger    = log4js.getLogger();
var service   = require('../service');

// Services
var MerkleService     = service.Merkle;
var ParametersService = service.Parameters;
var PeeringService    = service.Peering;
var PublicKeyService  = service.PublicKey;
var http              = service.HTTP;

module.exports = function (pgp, currency, conf) {

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
      async.apply(ParametersService.getPubkey, req),
      PublicKeyService.submitPubkey.bind(PublicKeyService)
    ],
    function (err, pubkey) {
      http.answer(res, 400, err, function () {
        res.send(200, JSON.stringify(pubkey.json()));
        if (!pubkey.propagated) {
          PeeringService.propagatePubkey(pubkey);
        }
      });
    });
  };

  return this;
};
