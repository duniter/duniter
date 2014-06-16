var jpgp      = require('../lib/jpgp');
var async     = require('async');
var _         = require('underscore');
var merkle    = require('merkle');
var logger    = require('../lib/logger')('vote');
var alogger   = require('../lib/logger')('amendment');

module.exports.get = function (conn, StrategyService) {
  return new VoteService(conn, StrategyService);
};

function VoteService (conn, StrategyService) {

  var Amendment = conn.model('Amendment');
  var PublicKey = conn.model('PublicKey');
  var Merkle    = conn.model('Merkle');
  var Vote      = conn.model('Vote');
  var Key       = conn.model('Key');
  
  var fifo = async.queue(function (task, callback) {
    task(callback);
  }, 1);

  this.submit = function(jsonVote, callback) {
    var vote = new Vote(jsonVote);
    vote.amendment = new Amendment(jsonVote.amendment);
    var hash = vote.amendment.getHash();
    var that = this;
    fifo.push(function (cb) {
      async.waterfall([
        function (next){
          Amendment.current(function (err, am) {
            var currNumber = am ? parseInt(am.number) : -1;
            var voteNumber = parseInt(vote.basis)
            if(voteNumber > currNumber + 1){
              next('Previous amendment not found, cannot record vote for amendment #' + vote.basis);
              return;
            }
            next();
          });
        },
        function (next){
          if (vote.amendment.generated > vote.sigDate.timestamp()) {
            next('Cannot vote for future amendment');
            return;
          }
          next();
        },
        // Issuer is a voter
        function (next){
          Key.wasVoter(vote.pubkey.fingerprint, vote.amendment.number - 1, next);
        },
        function (isVoter, next){
          if(!isVoter && vote.amendment.number != 0){
            next('Only voters may vote for amendments');
            return;
          }
          next();
        },
        function (next){
          if(parseInt(vote.basis) > 0){
            // Check if previous votes tree matches
            var pendingAm;
            async.waterfall([
              function (next){
                vote.getAmendment(next);
              },
              function (am, next){
                pendingAm = am;
                Merkle.signaturesOfAmendment(pendingAm.number - 1, pendingAm.previousHash, function (err, merkle) {
                  next(err, merkle);
                });
              },
              function (signaturesMerkle, next){
                next(null, signaturesMerkle.leaves());
              }
            ], next);
          } else {
            // No previous votes exists for AM0, no need to check signatures
            next(null, []);
          }
        },
        function (signaturesMerkle, next) {
          /* Update URLs:
              - hdc/amendments/[AMENDMENT_ID]/self
              - hdc/amendments/[AMENDMENT_ID]/signatures */
          that.saveAmendmentOfVote(vote, vote.amendment, signaturesMerkle, next);
        },
        function (am, next){
          vote.amendment = am;
          // Find preceding vote of the issuer, for this amendment
          Vote.find({ issuer: vote.pubkey.fingerprint, basis: vote.basis, amendmentHash: am.hash }, next);
        },
        function (votes, next){
          // Save vote
          if(votes.length > 0){
            next('Vote already received');
            return;
          }
          vote.save(function (err) {
            next(err);
          });
        },
        function ( next){
          // Update signatures (hdc/amendments/votes/[AMENDMENT_ID])
          Merkle.updateSignaturesOfAmendment(vote.amendment, vote, function (err) {
            next(err, vote.amendment, vote);
          });
        },
        function (am, recordedVote, next) {
          // Promotion time
          StrategyService.tryToPromote(am, function (err, result) {
            if (err) logger.warn(err);
            next(null, am, recordedVote);
          });
        }
      ], cb);
    }, callback);
  };

  this.saveAmendmentOfVote = function (vote, amendment, signaturesLeaves, done) {
    var am;
    async.waterfall([
      function (next) {
        Amendment.find({ number: amendment.number, hash: amendment.hash }, next);
      },
      function (ams, next){
        am = (ams && ams[0]) || amendment;
        // Donne le Merkle des signatures (hdc/amendments/[AMENDMENT_ID]/signatures)
        Merkle.signaturesWrittenForAmendment(am.number, am.hash, next);
      },
      function (merkle, next){
        // Met à jour le Merkle
        merkle.initialize(signaturesLeaves);
        merkle.save(function (err){
          next(err);
        });
      },
      function (next){
        // Met à jour la Masse Monétaire
        am.getPrevious(function (err, previous) {
          next(null, previous);
        });
      },
      function (previous, next){
        var prevM = (previous && previous.monetaryMass) || 0;
        var prevUD = (previous && previous.dividend) || 0;
        var prevN = (previous && previous.membersCount) || 0;
        am.monetaryMass = prevM + prevUD*prevN;
        next();
      },
      function (next){
        // Termine la sauvegarde
        am.save(function (err) {
          next(err, am);
        });
      },
    ], done);
  };

  this.votesIndex = function (onceDone) {
    async.waterfall([
      function (next){
        Vote.find(next);
      },
      function (votes, next){
        var map = {};
        votes.forEach(function (v) {
          var id = [v.basis, v.amendmentHash].join('-');
          map[id] = map[id] ? map[id] + 1 : 1;
        });
        var tab = [];
        for(var id in map){
          var sp = id.split('-');
          tab.push({ number: sp[0], hash: sp[1], count: map[id] });
        }
        next(null, tab);
      },
      function (stats, next) {
        var result = {};
        async.forEach(stats, function(item, callback){
            if(!result[item.number]) result[item.number] = {};
            result[item.number][item.hash] = item.count;
            callback();
          }, function(err){
            if(err){
              next(err);
              return;
            }
            var json = { amendments: {} };
            for(var number in result){
              var hashes = {};
              for(var hash in result[number]){
                hashes[hash] = result[number][hash];
              }
              json.amendments[number] = hashes;
            }
            next(null, json);
          }
        );
      }
    ], onceDone);
  }
}
