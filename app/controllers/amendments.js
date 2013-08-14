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

  this.votes = {

    post: function (req, res) {
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
            }
          ], callback);
        }
      ], function (err, am, recordedVote) {
        if(err){
          res.send(400, err);
        }
        else res.end(JSON.stringify({
          amendment: am.hdc(),
          signature: recordedVote.signature
        }));
      });
    }
  };
  
  return this;
}
