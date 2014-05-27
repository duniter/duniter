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
var logger    = require('../lib/logger')('vote');
var alogger   = require('../lib/logger')('amendment');
var service   = require('./.');

// Services
var PeeringService  = service.Peering;
var StrategyService = service.Strategy;
var SyncService     = service.Sync;

module.exports.get = function (pgp, currency, conf) {
  
  var fifo = async.queue(function (task, callback) {
    task(callback);
  }, 1);

  this.submit = function(vote, callback) {
    var that = this;
    fifo.push(function (cb) {
      async.waterfall([
        function (next){
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
        function (next){
          if (vote.amendment.generated > vote.sigDate.timestamp()) {
            next('Cannot vote for future amendment');
            return;
          }
          next();
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
          if(votes.length > 0){
            next('Vote already received');
            return;
          }
          vote.save(function (err) {
            next(err, votes.length == 0);
          });
        },
        function (newAm, next){
          vote.getAmendment(function (err, am) {
            next(null, am);
          })
        },
        function (am, next) {
          // Update signatures (hdc/amendments/votes/[AMENDMENT_ID])
          Merkle.updateSignaturesOfAmendment(am, vote, function (err) {
            next(err, am, vote);
          });
        },
        function (am, recordedVote, next) {
          async.waterfall([
            function (next){
              SyncService.takeCountOfVote(recordedVote, function (err) {
                next();
              });
            },
            function (next){
              // Promotion time
              StrategyService.tryToPromote(am, next);
            },
          ], function (err, result) {
            if (err) logger.warn(err);
            next(null, am, recordedVote);
            // And vote is forwarded
            if (!recordedVote.propagated) {
              PeeringService.propagateVote(am, recordedVote);
            }
          });
        }
      ], cb);
    }, callback);
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
