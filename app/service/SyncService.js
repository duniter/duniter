var jpgp        = require('../lib/jpgp');
var async       = require('async');
var request     = require('request');
var mongoose    = require('mongoose');
var _           = require('underscore');
var THTEntry    = mongoose.model('THTEntry');
var Amendment   = mongoose.model('Amendment');
var PublicKey   = mongoose.model('PublicKey');
var Membership  = mongoose.model('Membership');
var Merkle      = mongoose.model('Merkle');
var Vote        = mongoose.model('Vote');
var Peer        = mongoose.model('Peer');
var Key         = mongoose.model('Key');
var Forward     = mongoose.model('Forward');
var Status      = require('../models/statusMessage');
var log4js      = require('log4js');
var logger      = log4js.getLogger('peering');

module.exports.get = function (pgp, currency, conf) {

  var ParametersService = require('./ParametersService');

  this.createNext = function (am, done) {
    var amNext = new Amendment();
    async.waterfall([
      function(next){
        amNext.selfGenerated = true;
        ["version", "currency", "membersRoot", "membersCount", "votersRoot", "votersCount"].forEach(function(property){
          amNext[property] = am[property];
        });
        amNext.number = am.number + 1;
        amNext.previousHash = am.hash;
        amNext.generated = am.generated + conf.sync.votingFrequence;
        amNext.membersChanges = [];
        amNext.votersChanges = [];
        amNext.monetaryMass = am.monetaryMass
        // Time for Universal Dividend
        if (amNext.generated % conf.sync.UDFrequence == 0) {
          var monetaryMassDelta = am.monetaryMass * conf.sync.UDPercent;
          var dividendPerMember = monetaryMassDelta / am.membersCount;
          amNext.dividend = Math.max(conf.sync.UDMin, Math.floor(dividendPerMember));
          amNext.monetaryMass += am.dividend * am.membersCount;
        }
        amNext.nextVotes = Math.ceil((am.votersCount || 0) * conf.sync.VotesPercent);
        next();
      },
      function (next){
        // Computes changes due to too old JOIN/ACTUALIZE
        var nextTimestamp = amNext.generated;
        var exclusionDate = new Date();
        exclusionDate.setTime(nextTimestamp*1000 - conf.sync.ActualizeFrequence*1000);
        Membership.getCurrentJoinOrActuOlderThan(exclusionDate, next);
      },
      function (membershipsToExclude, next){
        var changes = [];
        membershipsToExclude.forEach(function(ms){
          changes.push("-" + ms.issuer);
        });
        changes.sort();
        amNext.membersChanges = changes;
        amNext.save(function (err) {
          next(err);
        });
      },
    ], done);
  };

  this.submit = function (signedEntry, done) {
    
    async.waterfall([

      function (callback) {
        if(signedEntry.indexOf('-----BEGIN') == -1){
          callback('Signature not found in given THT entry');
          return;
        }
        callback();
      },

      // Check signature's key ID
      function(callback){
        var sig = signedEntry.substring(signedEntry.indexOf('-----BEGIN'));
        var keyID = jpgp().signature(sig).issuer();
        if(!(keyID && keyID.length == 16)){
          callback('Cannot identify signature issuer`s keyID');
          return;
        }
        callback(null, keyID);
      },

      // Looking for corresponding public key
      function(keyID, callback){
        PublicKey.getTheOne(keyID, function (err, pubkey) {
          callback(err, pubkey);
        });
      },

      // Verify signature
      function(pubkey, callback){
        var entry = new Membership();
        async.waterfall([
          function (next){
            entry.parse(signedEntry, next);
          },
          function (entry, next){
            entry.verify(currency, next);
          },
          function (valid, next){
            entry.verifySignature(pubkey.raw, next);
          },
          function (verified, next){
            if(!verified){
              next('Bad signature');
              return;
            }
            if(pubkey.fingerprint != entry.issuer){
              next('Fingerprint in Membership (' + entry.issuer + ') does not match signatory (' + pubkey.fingerprint + ')');
              return;
            }
            next();
          },
          function (next){
            Membership.find({ issuer: pubkey.fingerprint, hash: entry.hash }, next);
          },
          function (entries, next){
            if (entries.length > 0) {
              next('Already received membership');
              return;
            }
            next();
          },
          function (next){
            // var timestampInSeconds = parseInt(entry.sigDate.getTime()/1000, 10);
            // Amendment.findPromotedPreceding(timestampInSeconds, next);
            Amendment.current(next);
          },
          function (am, next){
            var entryTimestamp = parseInt(entry.sigDate.getTime()/1000, 10);
            if (am.generated > entryTimestamp) {
              next('Too late for this membership. Retry.');
              return;
            }
            entry.amNumber = am.number;
            // Get already existing Membership for same amendment
            Membership.getForAmendmentAndIssuer(am.number, entry.issuer, next);
          },
          function (entries, next){
            if (entries.length > 1) {
              next('Refused: already received more than one membership for next amendment.');
              return;
            } else if(entries.length > 0){
              // Already existing membership for this AM : this membership and the previous for this AM
              // are no more to be considered
              entry.eligible = false;
              entry.current = false;
              entries[0].current = false;
              entries[0].eligible = false;
              entries[0].save(function (err) {
                next(err, true);
              })
            } else {
              entry.current = true;
              next(null, false);
            }
          },
          function (nowIsIgnored, next){
            // Saves entry
            entry.propagated = false;
            entry.save(function (err) {
              next(err);
            });
          },
          function (next){
            // Impacts on changes
            // Impacts on reason
            // Impacts on tree
            //nowIsIgnored && "Already received membership: all received membership for this key will be ignored for next amendment"
            next(null, entry);
          },
        ], callback);
      }
    ], done);
  }

  return this;
}
