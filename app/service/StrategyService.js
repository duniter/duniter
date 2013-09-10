var jpgp       = require('../lib/jpgp');
var async      = require('async');
var mongoose   = require('mongoose');
var _          = require('underscore');
var Membership = mongoose.model('Membership');
var Amendment  = mongoose.model('Amendment');
var PublicKey  = mongoose.model('PublicKey');
var Merkle     = mongoose.model('Merkle');
var Vote       = mongoose.model('Vote');

module.exports = function () {
  
  this.tryToPromote = function (am, done) {
    async.waterfall([
      function (next){
        defaultPromotion(am, next);
      },
      function (decision, next){
        if(decision){
          am.promoted = true;
          am.save(function (err) {
            if(!err){
              console.log("Promoted Amendment #" + am.number + " with hash " + am.hash);
              next(null);
            }
            else next(err);
          })
        }
        else next(null)
      }
    ], done);
  }

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
      Amendment.current(function (err, am) {
        next(null, am);
      });
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
      if(am && am.number == amendment.number && am.hash == amendment.hash){
        next('Stacked vote of currently promoted');
        return;
      }
      async.waterfall([
        function (pass){
          if(amendment.number != am.number + 1){
            pass('Not promoted: not a follower of current amendment (#' + amendment.number + ' does not follow #' + am.number + ')');
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
            pass('Not promoted: this amendment does not match received signatures of current amendment (expect ' + sigMerkle.leaves().length + " votes with root " + sigMerkle.root() + ", got " + amendment.votersCount + " votes with root " + amendment.votersSigRoot);
            return;
          }
          pass();
        },
        function (pass){
          Merkle.signatoriesOfAmendment(am.number, am.hash, pass);
        },
        function (prevVotersMerkle, pass){
          Merkle.signatoriesOfAmendment(amendment.number, amendment.hash, function (err, merkle) {
            pass(err, prevVotersMerkle, merkle);
          });
        },
        function (prevVotersMerkle, votersMerkle, pass) {
          var inVoters = _(votersMerkle.leaves()).difference(prevVotersMerkle.leaves());
          var outVoters = _(prevVotersMerkle.leaves()).difference(votersMerkle.leaves());
          pass(null, prevVotersMerkle, votersMerkle, inVoters, outVoters);
        },
        function (prevVotersMerkle, votersMerkle, inVoters, outVoters, pass) {
          console.log("Prevs: " + prevVotersMerkle.leaves());
          console.log("Voter: " + votersMerkle.leaves());
          console.log("In: " + inVoters);
          console.log("Out: " + outVoters);
          // if(outVoters.length > 0){
          if(outVoters.length > prevVotersMerkle.leaves().length / 3.0){
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
