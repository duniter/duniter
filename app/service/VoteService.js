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
      // Issuer is a member
      function (verified, next){
        vote.issuerIsMember(next);
      },
      function (isMember, next){
        if(!isMember && vote.amendment.number != 0){
          next('Only members may be voters');
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
              if(signaturesMerkle.root() == pendingAm.previousVotesRoot){
                // We already have exactly the same signatures Merkle, use it for saving
                next(null, signaturesMerkle.leaves());
              } else {
                var node;
                // Tries to get it from remote peer
                async.waterfall([
                  function (next){
                    // Find peer in local DB
                    if(!peerFPR){
                      next('Signatures of previous amendment not foud, and no peer was provided.');
                      return;
                    }
                    Peer.getTheOne(peerFPR, next);
                  },
                  function (peer, next){
                    // Tries to connect
                    peer.connect(next);
                  },
                  function (remoteNode, next){
                    // Check Merkle tree
                    node = remoteNode;
                    node.hdc.amendments.view.signatures(pendingAm.number, pendingAm.hash, next);
                  },
                  function (json, next){
                    var signaturesRoot = json.levels["0"][0];
                    if(signaturesRoot != pendingAm.previousVotesRoot){
                      next("Given remote peer's signatures Merkle tree root for amendment #" + pendingAm.number + "-" + pendingAm.hash + " does not match: exptected " + pendingAm.previousVotesRoot + ", given " + signaturesRoot);
                      return;
                    }
                    // Get the whole leaves (hashes)
                    node.hdc.amendments.view.signatures(pendingAm.number, pendingAm.hash, { lstart: json.levelsCount - 1 }, next);
                  },
                  function (json, next){
                    var hashes = json.levels[json.levelsCount - 1];
                    var leavesMerkle = merkle(hashes, 'sha1').process();
                    var missing = [];
                    if(leavesMerkle.root() != pendingAm.previousVotesRoot){
                      next("Computed remote peer's signatures Merkle tree root for amendment #" + pendingAm.number + "-" + pendingAm.hash + ", according to its leaves, does not match: exptected " + pendingAm.previousVotesRoot + ", given " + leavesMerkle.root());
                      return;
                    }
                    async.forEach(hashes, function(hash, callback){
                      Vote.findByHashAndBasis(hash, pendingAm.number - 1, function (err){
                        if(err){
                          missing.push(hash);
                        }
                        callback();
                      });
                    }, function(err, result){
                      next(null, json, hashes, missing);
                    });
                  },
                  function (json, hashes, missing, next){
                    var previousAm = new Amendment({});
                    async.waterfall([
                      function (next){
                        node.hdc.amendments.view.self(pendingAm.number - 1, pendingAm.previousHash, next);
                      },
                      function (jsonAM, next){
                        previousAm.parse(jsonAM.raw, next);
                      },
                      function (next){
                        async.forEachSeries(missing, function(hash, callback){
                          // Get every leaf's value that is not recorded yet
                          var index = hashes.indexOf(hash);
                          async.waterfall([
                            function (next){
                              var options = {
                                lstart: json.levelsCount - 1,
                                start: index,
                                end: index + 1,
                                extract: true
                              };
                              node.hdc.amendments.view.signatures(pendingAm.number, pendingAm.hash, options, next);
                            },
                            function (json, next){
                              var leaf = json.leaves[index];
                              // Begin a sub cycle submitting the vote
                              that.submit(previousAm.getRaw() + leaf.value.signature, peerFPR, next);
                            }
                          ], callback);
                        }, function (err){
                          next(err, hashes);
                        });
                      },
                    ], next);
                  },
                ], next);
              }
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
