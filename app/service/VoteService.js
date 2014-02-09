var jpgp      = require('../lib/jpgp');
var async     = require('async');
var mongoose  = require('mongoose');
var _         = require('underscore');
var merkle    = require('merkle');
var Amendment = mongoose.model('Amendment');
var PublicKey = mongoose.model('PublicKey');
var Merkle    = mongoose.model('Merkle');
var Peer      = mongoose.model('Peer');
var Vote      = mongoose.model('Vote');
var log4js    = require('log4js');
var logger    = log4js.getLogger('vote');

module.exports = function (currency) {

  this.submit = function(rawVote, peerFPR, callback) {
    var that = this;
    if(arguments.length == 2){
      callback = peerFPR;
      peerFPR = undefined;
    }
    var vote = new Vote();
    async.waterfall([
      function (next){
        // Extract data
        vote.parse(rawVote, next);
      },
      function (vote, next){
        // Verify content and signature
        vote.verify(currency, next);
      },
      function (verified, next){
        logger.debug('⬇ %s for %s-%s', "0x" + vote.issuer.substr(32), vote.amendment.number, vote.amendment.hash);
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
      // Issuer is a voter
      function (next){
        vote.issuerIsVoter(next);
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
        vote.saveAmendment(signaturesMerkle, next);
      },
      function (am, next){
        // Find preceding vote of the issuer, for this amendment
        Vote.find({ issuer: vote.issuer, basis: vote.basis, amendmentHash: am.hash }, next);
      },
      function (votes, next){
        // Save vote
        var voteEntity = vote;
        var previousHash = voteEntity.hash;
        if(votes.length > 0){
          if(votes[0].sigDate >= voteEntity.sigDate){
            next('This vote is not more recent than already recorded');
            return;
          }
          voteEntity = votes[0];
          previousHash = voteEntity.hash;
          vote.copyValues(voteEntity);
        }
        voteEntity.save(function (err) {
          next(err, voteEntity, previousHash, votes.length == 0);
        });
      },
      function (voteEntity, previousHash, newAm, next){
        voteEntity.getAmendment(function (err, am) {
          next(null, am, voteEntity, previousHash, newAm);
        })
      },
      function (am, voteEntity, previousHash, newAm, next) {
        if(newAm){
          /* Update Merkles for URLs:
            - hdc/amendments/[AMENDMENT_ID]/voters
            - hdc/amendments/[AMENDMENT_ID]/members */
          am.updateMerkles(function (err) {
            next(err, am, voteEntity, previousHash);
          });
        }
        else next(null, am, voteEntity, previousHash);
      },
      function (am, voteEntity, previousHash, next) {
        // Update signatures (hdc/amendments/votes/[AMENDMENT_ID])
        Merkle.updateSignaturesOfAmendment(am, previousHash, vote.hash, function (err) {
          next(err, am, voteEntity);
        });
      }
    ], function (err, am, vote) {
      callback(err, am, vote);
    });
  };

  this.votesIndex = function (onceDone) {
    async.waterfall([
      function (next){
        Vote.find(next);
      },
      function (votes, next){
        var map = {};
        votes.forEach(function (v) {
          map[v._amendment] = map[v._amendment] ? map[v._amendment] + 1 : 1;
        });
        var tab = [];
        for(var id in map){
          tab.push({ id: id, count: map[id] });
        }
        next(null, tab);
      },
      function (tab, next) {
        var stats = [];
        async.forEach(tab, function (entry, done) {
          Amendment.findById(entry.id, function (err, amendment) {
            stats.push({
              number: amendment.number,
              hash: amendment.hash,
              count: entry.count
            });
            done(err);
          });
        }, function (err) {
          next(err, stats);
        });
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

  return this;
}
