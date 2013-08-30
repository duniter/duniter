var jpgp       = require('../lib/jpgp');
var async      = require('async');
var mongoose   = require('mongoose');
var _          = require('underscore');
var Membership = mongoose.model('Membership');
var Amendment  = mongoose.model('Amendment');
var PublicKey  = mongoose.model('PublicKey');
var Merkle     = mongoose.model('Merkle');
var Vote       = mongoose.model('Vote');

module.exports = function (pgp, currency, conf) {

  this.all = function (req, res) {
    showMerkle(Merkle.txAll, null, req, res);
  }

  this.sender = {

    get: function (req, res) {
      showMerkle(Merkle.txOfSender, null, null, req, res);
    },

    issuance: function (req, res) {
      showMerkle(Merkle.txIssuanceOfSender, null, null, req, res);
    },

    dividend: function (req, res) {
      showMerkle(Merkle.txDividendOfSender, null, null, req, res);
    },

    amDividend: function (req, res) {
      showMerkle(Merkle.txDividendOfSenderByAmendment, null, req.params.amnum, req, res);
    },

    transfert: function (req, res) {
      showMerkle(Merkle.txFusionOfSender, null, null, req, res);
    },

    fusion: function (req, res) {
      showMerkle(Merkle.txTransfertOfSender, null, null, req, res);
    }
  };
  
  return this;
}

function showMerkle (merkleGetFunc, merkleHashFunc, amNumber, req, res) {
  if(!req.params.fpr){
    res.send(400, "Fingerprint is required");
    return;
  }
  var matches = req.params.fpr.match(/(\w{40})/);
  if(!matches){
    res.send(400, "Fingerprint format is incorrect, must be an upper-cased SHA1 hash");
    return;
  }

  var hash = matches[1];
  async.waterfall([
    function (next){
      if(amNumber)
        merkleGetFunc.call(merkleGetFunc, hash, amNumber, next);
      else
        merkleGetFunc.call(merkleGetFunc, hash, next);
    },
    function (merkle, next){
      Merkle.processForURL(req, merkle, function (hashes, done) {
        var map = {};
        hashes.forEach(function (hash){
          map[hash] = hash;
        });
        done(null, map);
      }, next);
    }
  ], function (err, json) {
    if(err){
      res.send(404, err);
      return;
    }
    merkleDone(req, res, json);
  });
}

function merkleDone(req, res, json) {
  if(req.query.nice){
    res.setHeader("Content-Type", "text/plain");
    res.end(JSON.stringify(json, null, "  "));
  }
  else res.end(JSON.stringify(json));
}
