var service    = require('../service');
var jpgp       = require('../lib/jpgp');
var async      = require('async');
var mongoose   = require('mongoose');
var _          = require('underscore');
var Amendment  = mongoose.model('Amendment');
var Membership = mongoose.model('Membership');
var Voting     = mongoose.model('Voting');
var PublicKey  = mongoose.model('PublicKey');
var Merkle     = mongoose.model('Merkle');
var Vote       = mongoose.model('Vote');
var Key        = mongoose.model('Key');
var logger     = require('../lib/logger')('amendment');

// Services
var KeyService      = service.Key;
var SyncService     = service.Sync;
var ContractService = service.Contract;

module.exports.get = function (pgp, currency, conf) {
  
  var fifo = async.queue(function (task, callback) {
    task(callback);
  }, 1);

  this.tryToPromote = function (am, done) {
    fifo.push(function (cb) {
      async.waterfall([
        function (next){
          defaultPromotion(am, next);
        },
        function (decision, next){
          if(decision){
            am.promoted = true;
            am.save(function (err) {
              if(!err){
                // Sets the promoted am as current in memory
                ContractService.current(am);
                logger.info("Promoted Amendment #" + am.number + " with hash " + am.hash);
                next(null);
              }
              else next(err);
            })
          }
          else next(null)
        },
        function (next){
          async.parallel({
            memberJoins:    async.apply(async.forEach, am.getNewMembers(),      async.apply(Key.memberJoin.bind(Key), am.number)),
            memberLeaves:   async.apply(async.forEach, am.getLeavingMembers(),  async.apply(Key.memberLeave.bind(Key), am.number)),
            voterJoins:     async.apply(async.forEach, am.getNewVoters(),       async.apply(Key.voterJoin.bind(Key), am.number)),
            voterLeaves:    async.apply(async.forEach, am.getLeavingVoters(),   async.apply(Key.voterLeave.bind(Key), am.number)),
            knownMembers:   async.apply(async.forEach, am.getNewMembers(),      Key.setKnown),
            knownVoters:    async.apply(async.forEach, am.getNewVoters(),       Key.setKnown),
            addMembers:     async.apply(async.forEach, am.getNewMembers(),      Key.addMember),
            addVoters:      async.apply(async.forEach, am.getNewVoters(),       Key.addVoter),
            removeMembers:  async.apply(async.forEach, am.getLeavingMembers(),  Key.removeMember),
            removeVoters:   async.apply(async.forEach, am.getLeavingVoters(),   Key.removeVoter),

            // Leaving voters have no more current voting document
            currentVoting:  async.apply(async.forEach, am.getLeavingVoters(),   async.apply(Voting.removeCurrents.bind(Voting))),
          }, function (err) {
            next(err);
          });
        },
        function (next){
          // Proposed member/voter => Actual member/voter
          async.parallel([
            async.apply(Key.update.bind(Key), { member: true  }, { $set: { proposedMember: true  }}, { multi: true }),
            async.apply(Key.update.bind(Key), { member: false }, { $set: { proposedMember: false }}, { multi: true }),
            async.apply(Key.update.bind(Key), { voter:  true  }, { $set: { proposedVoter:  true  }}, { multi: true }),
            async.apply(Key.update.bind(Key), { voter:  false }, { $set: { proposedVoter:  false }}, { multi: true }),
            async.apply(Key.update.bind(Key), {}, { $set: { lastVotingState: 0 }}, { multi: true }),
            async.apply(Key.update.bind(Key), {}, { $set: { lastMemberState: 0 }}, { multi: true }),
          ], function(err, results) {
            next(err);
          });
        },
        function (next){
          // Set eligible memberships as current
          Membership.getEligibleForAmendment(am.number - 1, next);
        },
        function (memberships, next) {
          async.forEach(memberships, function(ms, callback){
            ms.current = true;
            ms.save(function (err) {
              callback(err);
            });
          }, next);
        },
        function (next){
          // Set eligible memberships as current
          Voting.getEligibleForAmendment(am.number - 1, next);
        },
        function (votings, next) {
          async.forEach(votings, function(voting, callback){
            voting.current = true;
            voting.save(function (err) {
              callback(err);
            });
          }, next);
        },
        function (next){
          SyncService.createNext(am, next);
        },
      ], cb);
    }, done);
  }

  return this;
}


function defaultPromotion (followingAm, decision) {
  async.waterfall([
    function (next) {
      if(!followingAm){
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
    function (currentAm, next){
      if(!next){
        next = currentAm;
        currentAm = null;
      }
      // Root amendment does not require votes
      if(!currentAm && followingAm.number == 0){
        next(null, true);
        return;
      }
      if(!currentAm && followingAm.number != 0){
        next('Not promoted: need root amendment first');
        return;
      }
      // Vote for currently promoted: does not require promotion anymore
      if(currentAm && currentAm.number == followingAm.number && currentAm.hash == followingAm.hash){
        next('Stacked vote of currently promoted');
        return;
      }
      // The amendment may be promoted
      async.waterfall([
        function (pass){
          if(followingAm.number != currentAm.number + 1){
            pass('Not promoted: bad number: not a follower of current amendment (#' + followingAm.number + ' does not follow #' + currentAm.number + ')');
            return;
          }
          pass();
        },
        function (pass){
          if(currentAm.hash != followingAm.previousHash){
            pass('Not promoted: bad previous hash: this amendment does not have current amendment as previous');
            return;
          }
          pass();
        },
        function (pass){
          Merkle.signaturesOfAmendment(followingAm.number, followingAm.hash, function (err, merkle) {
            pass(err, merkle);
          });
        },
        function (votesMerkle, pass) {
          if(votesMerkle.leaves().length < currentAm.nextVotes){
            pass('Not promoted: not enough votes (requires at least ' + currentAm.nextVotes + ', currently have '+votesMerkle.leaves().length+')');
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
