var jpgp       = require('../../lib/jpgp');
var async      = require('async');
var mongoose   = require('mongoose');
var _          = require('underscore');
var Membership = mongoose.model('Membership');
var Amendment  = mongoose.model('Amendment');
var PublicKey  = mongoose.model('PublicKey');
var Merkle     = mongoose.model('Merkle');
var Vote       = mongoose.model('Vote');

module.exports = function (pgp, currency, conf, shouldBePromoted) {

  this.signatures = function (req, res) {
    if(!req.params.amendment_id){
      res.send(400, "Amendment ID is required");
      return;
    }
    var matches = req.params.amendment_id.match(/(\d+)-(\w{40})/);
    if(!matches){
      res.send(400, "Amendment ID format is incorrect, must be 'number-hash'");
      return;
    }
    async.waterfall([
      function (next){
        var number = matches[1];
        var hash = matches[2];
        Merkle.signaturesWrittenForAmendment(number, hash, next);
      },
      function (merkle, next){
        Merkle.processForURL(req, merkle, function (hashes, done) {
          Vote
          .find({ hash: { $in: hashes } })
          .sort('hash')
          .exec(function (err, votes) {
            var map = {};
            votes.forEach(function (vote){
              map[vote.hash] = vote.signature;
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
      merkleDone(req, res, json);
    });

    function merkleDone(req, res, json) {
      if(req.query.nice){
        res.setHeader("Content-Type", "text/plain");
        res.end(JSON.stringify(json, null, "  "));
      }
      else res.end(JSON.stringify(json));
    }
  };

  this.self = function (req, res) {
    if(!req.params.amendment_id){
      res.send(400, "Amendment ID is required");
      return;
    }
    var matches = req.params.amendment_id.match(/(\d+)-(\w{40})/);
    if(!matches){
      res.send(400, "Amendment ID format is incorrect, must be 'number-hash'");
      return;
    }
    async.waterfall([
      function (next){
        var number = matches[1];
        var hash = matches[2];
        Amendment.find({ number: number, hash: hash }, next);
      },
      function (ams, next){
        var am = null;
        if(ams.length > 0){
          am = ams[0];
        }
        if(!am){
          next('Amendment not found');
          return;
        }
        next(null, am);
      }
    ], function (err, found) {
      if(err){
        res.send(404, err);
        return;
      }
      res.setHeader("Content-Type", "text/plain");
      res.send(JSON.stringify(found.json(), null, "  "));
    });
  };

  return this;
}
