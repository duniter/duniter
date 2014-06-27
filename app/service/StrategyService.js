var jpgp       = require('../lib/jpgp');
var async      = require('async');
var _          = require('underscore');
var logger     = require('../lib/logger')('amendment');

module.exports.get = function (conn, conf, ContractService, SyncService, alertDeamon) {
  return new StrategyService(conn, conf, ContractService, SyncService, alertDeamon);
};

function StrategyService (conn, conf, ContractService, SyncService, alertDeamon) {

  var Amendment  = conn.model('Amendment');
  var Membership = conn.model('Membership');
  var Voting     = conn.model('Voting');
  var PublicKey  = conn.model('PublicKey');
  var Merkle     = conn.model('Merkle');
  var Vote       = conn.model('Vote');
  var CKey       = conn.model('CKey');
  var Coin       = conn.model('Coin');
  var Key        = conn.model('Key');
  
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
            knownMembers:   async.apply(async.forEach, am.getNewMembers(),      Key.setKnown.bind(Key)),
            knownVoters:    async.apply(async.forEach, am.getNewVoters(),       Key.setKnown.bind(Key)),
            addMembers:     async.apply(async.forEach, am.getNewMembers(),      Key.addMember.bind(Key)),
            addVoters:      async.apply(async.forEach, am.getNewVoters(),       Key.addVoter.bind(Key)),
            removeMembers:  async.apply(async.forEach, am.getLeavingMembers(),  Key.removeMember.bind(Key)),
            removeVoters:   async.apply(async.forEach, am.getLeavingVoters(),   Key.removeVoter.bind(Key)),
            removeCKeys:    async.apply(CKey.remove.bind(CKey), {}),

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
          Key.getMembers(next);
        },
        function (members, next){
          // Update Merkle of proposed members
          async.waterfall([
            function (next){
              Merkle.proposedMembers(next);
            },
            function (merkle, next){
              var fingerprints = [];
              members.forEach(function(m){
                fingerprints.push(m.fingerprint);
              });
              fingerprints.sort();
              merkle.initialize(fingerprints);
              merkle.save(function (err) {
                next(err);
              });
            },
          ], next);
        },
        function (next){
          Key.getVoters(next);
        },
        function (voters, next){
          // Update Merkle of proposed voters
          async.waterfall([
            function (next){
              Merkle.proposedVoters(next);
            },
            function (merkle, next){
              var fingerprints = [];
              voters.forEach(function(v){
                fingerprints.push(v.fingerprint);
              });
              fingerprints.sort();
              merkle.initialize(fingerprints);
              merkle.save(function (err) {
                next(err);
              });
            },
          ], next);
        },
        // Create coins
        function (next){
          Key.getManaged(next);
        },
        function (keys, next){
          if (!am.dividend) {
            next();
            return;
          }
          async.forEachSeries(keys, function(key, callback){
            var coins = [];
            var power = am.coinBase;
            var cNumber = 0;
            am.coinList.forEach(function(quantity){
              for (var i = cNumber; i < cNumber + quantity; i++) {
                var c = new Coin();
                c.owner = key.fingerprint;
                c.issuer = key.fingerprint;
                c.amNumber = am.number;
                c.coinNumber = i;
                c.power = power;
                coins.push(c);
              }
              cNumber += quantity;
              power++;
            });
            // console.log(coins);
            async.forEach(coins, function(c, saved){
              c.save(function (err) {
                saved(err);
              });
            }, function (err) {
              if (err)
                logger.error(err);
              callback(err);
            });
          }, next);
        },
        function (next){
          if (alertDeamon) {
            var now = new Date().timestamp();
            alertDeamon((am.generated + conf.sync.AMFreq - now)*1000);
          }
          next(null, true);
        },
      ], cb);
    }, done);
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
}
