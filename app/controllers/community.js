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
  
  var MerkleService     = require('../service/MerkleService');
  var ParametersService = require('../service/ParametersService');
  var MembershipService = require('../service/MembershipService').get(currency);
  var PeeringService    = require('../service/PeeringService').get(pgp, currency, conf);

  this.currentVotes = function (req, res) {
    async.waterfall([
      function (next){
        Amendment.current(next);
      },
      function (am, next){
        Merkle.signaturesOfAmendment(am.number, am.hash, next);
      },
      function (merkle, next){
        MerkleService.processForURL(req, merkle, Merkle.mapForSignatures, next);
      }
    ], function (err, json) {
      if(err){
        res.send(404, err);
        return;
      }
      MerkleService.merkleDone(req, res, json);
    });
  };

  this.join = function (req, res) {
    async.waterfall([
      function (callback) {
        ParametersService.getMembership(req, callback);
      },
      function(signedMSR, callback){
        MembershipService.submit(signedMSR, callback);
      }
    ], function (err, recordedMS) {
      if(err){
        res.send(400, err);
      }
      else{
        res.end(JSON.stringify({
          request: recordedMS.hdc(),
          signature: recordedMS.signature
        }));
        PeeringService.propagateMembership(recordedMS);
      }
    });
  };

  this.memberships = function (req, res) {
    async.waterfall([
      function (next){
        Merkle.forNextMembership(next);
      },
      function (merkle, next){
        MerkleService.processForURL(req, merkle, Merkle.mapForMemberships, next);
      }
    ], function (err, json) {
      if(err){
        res.send(500, err);
        return;
      }
      MerkleService.merkleDone(req, res, json);
    });
  }
  
  return this;
}
