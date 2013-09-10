var jpgp       = require('../lib/jpgp');
var async      = require('async');
var mongoose   = require('mongoose');
var _          = require('underscore');
var Membership = mongoose.model('Membership');
var Amendment  = mongoose.model('Amendment');
var PublicKey  = mongoose.model('PublicKey');
var Merkle     = mongoose.model('Merkle');
var Vote       = mongoose.model('Vote');

module.exports = function (currency) {

  this.submit = function(rawVote, callback) {
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
      // Issuer is a member
      function (verified, next){
        vote.issuerIsMember(next);
      },
      function (isMember, next){
        if(!isMember && vote.amendment.number != 0){
          next('Only members may vote for amendments');
          return;
        }
        next();
      },
      function (next){
        Amendment.current(function (err, am) {
          var currNumber = am ? parseInt(am.number) : -1;
          var voteNumber = parseInt(vote.basis);
          if(voteNumber > currNumber + 1){
            next('Previous amendment not found, cannot record vote for amendment #' + vote.basis);
            return;
          }
          if(voteNumber < currNumber){
            next('Cannot record vote for previous amendments');
            return;
          }
          next();
        });
      },
      // Is not leaving the community
      function (next) {
        Membership.find({ fingerprint: vote.issuer, basis: vote.basis, status: 'LEAVE' }, function (err, memberships) {
          if(memberships.length > 0){
            next('Vote forbidden: a leaving request was received for this member');
            return;
          }
          next();
        });
      },
      function (next) {
        vote.saveAmendment(next);
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
          am.updateMerkles(function (err) {
            next(err, am, voteEntity, previousHash);
          });
        }
        else next(null, am, voteEntity, previousHash);
      },
      function (am, voteEntity, previousHash, next) {
        Merkle.updateSignaturesOfAmendment(am, previousHash, vote.hash, function (err) {
          next(err, am, voteEntity);
        });
      },
      function (am, voteEntity, next) {
        Merkle.updateSignatoriesOfAmendment(am, vote.pubkey.fingerprint, function (err) {
          next(err, am, voteEntity);
        });
      }
    ], callback);
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
