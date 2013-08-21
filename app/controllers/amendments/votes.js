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

  this.sigs = function (req, res) {

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
        Merkle.signaturesOfAmendment(number, hash, next);
      },
      function (merkle, next){
        Merkle.processForURL(req, merkle, function (hashes, done) {
          Vote
          .find({ hash: { $in: hashes } })
          .sort('hash')
          .exec(function (err, votes) {
            var map = {};
            votes.forEach(function (vote){
              map[vote.hash] = {
                issuer: vote.issuer,
                signature: vote.signature
              };
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

  this.get = function (req, res) {
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
    ], function (err, json) {
      if(err){
        res.send(500, err);
        return;
      }
      if(req.query.nice){
        res.setHeader("Content-Type", "text/plain");
        res.end(JSON.stringify(json, null, "  "));
      }
      else res.end(JSON.stringify(json));
    });
  };

  this.post = function (req, res) {
    async.waterfall([

      // Parameters
      function (callback){
        if(!(req.body && req.body.amendment && req.body.signature)){
          callback('Requires an amendment + signature');
          return;
        }
        callback(null, req.body.amendment + req.body.signature);
      },

      // Verify signature
      function (rawVote, callback){
        var vote = new Vote();
        async.waterfall([
          function (next){
            vote.parse(rawVote, next);
          },
          function (vote, next){
            vote.verify(currency, next);
          },
          // Save amendment
          function (verified, next){
            vote.saveAmendment(next);
          },
          function (am, next){
            Vote.find({ hash: vote.hash }, next);
          },
          function (votes, next){
            var voteEntity = vote;
            if(votes.length > 0){
              voteEntity = votes[0];
              vote.copyValues(voteEntity);
            }
            voteEntity.save(function (err) {
              next(err, voteEntity);
            });
          },
          function (voteEntity, next){
            voteEntity.getAmendment(function (err, am) {
              next(null, am, voteEntity);
            })
          },
          function (am, voteEntity, next) {
            Merkle.signaturesOfAmendment(am.number, am.hash, function (err, merkle) {
              next(err, am, voteEntity, merkle);
            });
          },
          function (am, voteEntity, merkle, next) {
            merkle.push(vote.hash);
            merkle.save(function (err) {
              next(err, am, voteEntity);
            });
          },
          function (am, voteEntity, next) {
            Merkle.signatoriesOfAmendment(am.number, am.hash, function (err, merkle) {
              next(err, am, voteEntity, merkle);
            });
          },
          function (am, voteEntity, merkle, next) {
            merkle.push(vote.pubkey.fingerprint);
            merkle.save(function (err) {
              next(err, am, voteEntity);
            });
          },
          function (am, voteEntity, next) {
            am.updateMerkles(function (err) {
              next(err, am, voteEntity);
            });
          }
        ], callback);
      }
    ], function (err, am, recordedVote) {
      if(err){
        res.send(400, err);
      }
      else
      {
        shouldBePromoted(am, function (err, decision) {
          if(decision){
            am.promoted = true;
            am.save(function (err) {
              if(!err){
                console.log("Promoted Amendment #" + am.number + " with hash " + am.hash);
              }
              else console.err(err);
            })
          }
          else console.log(err);
        });
        res.end(JSON.stringify({
          amendment: am.hdc(),
          signature: recordedVote.signature
        }));
      }
    });
  };
  
  return this;
}
