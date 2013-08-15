var async      = require('async');
var mongoose   = require('mongoose');
var _ = require('underscore');
var Amendment  = mongoose.model('Amendment');
var Merkle  = mongoose.model('Merkle');

module.exports = function (pgp, currency, conf) {

  this.votes = require('./votes')(pgp, currency, conf, defaultPromotion);
  this.view = require('./view')(pgp, currency, conf);

  this.current = function (req, res) {
    async.waterfall([
      function (next){
        Amendment.current(next);
      }
    ], function (err, current) {
      if(!current){
        res.send(404, 'No amendment yet promoted');
        return;
      }
      res.setHeader("Content-Type", "text/plain");
      res.send(JSON.stringify(current.json(), null, "  "));
    });
  };
  
  return this;
}

function defaultPromotion (amendment, decision) {
  async.waterfall([
    function (next) {
      if(!amendment){
        next('No new amendment for promotion');
        return;
      }
      next();
    },
    function (next){
      Amendment.current(next);
    },
    function (am, next){
      if(!next){
        next = am;
        am = null;
      }
      if(!am && amendment.number == 0){
        next(null, true);
        return;
      }
      if(!am && amendment.number != 0){
        next('Not promoted: need root amendment first');
        return;
      }
      async.waterfall([
        function (pass){
          if(amendment.number != am.number + 1){
            pass('Not promoted: not a follower of current amendment');
            return;
          }
          pass();
        },
        function (pass){
          if(am.hash != amendment.previousHash){
            pass('Not promoted: this amendment does not have current amendment as previous');
            return;
          }
          pass();
        },
        function (pass){
          Merkle.signaturesOfAmendment(am.number, am.hash, pass);
        },
        function (sigMerkle, pass){
          if(sigMerkle.root() != amendment.votersSigRoot || sigMerkle.leaves().length != amendment.votersCount){
            pass('Not promoted: this amendment does not match received signatures of current amendment');
            return;
          }
          pass();
        },
        function (pass){
          Merkle.signatoriesOfAmendment(am.number, am.hash, pass);
        },
        function (prevVotersMerkle, pass){
          Merkle.signatoriesOfAmendment(am.number, am.hash, function (err, merkle) {
            pass(err, prevVotersMerkle, merkle);
          });
        },
        function (prevVotersMerkle, votersMerkle, pass) {
          var inVoters = _(votersMerkle).difference(prevVotersMerkle);
          var outVoters = _(prevVotersMerkle).difference(votersMerkle);
          pass(null, prevVotersMerkle, votersMerkle, inVoters, outVoters);
        },
        function (prevVotersMerkle, votersMerkle, inVoters, outVoters, pass) {
          if(outVoters.length > prevVotersMerkle.length / 3.0){
            pass('Not promoted: not enough votes for this amendment (requires at least 2/3 of the previous voters)');
            return;
          }
          pass();
        }
      ], next);
    }
  ], function (err) {
    decision(err, err ? false : true);
  });
}
