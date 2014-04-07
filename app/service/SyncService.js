var service    = require('../service');
var jpgp       = require('../lib/jpgp');
var async      = require('async');
var request    = require('request');
var mongoose   = require('mongoose');
var vucoin     = require('vucoin');
var _          = require('underscore');
var THTEntry   = mongoose.model('THTEntry');
var Amendment  = mongoose.model('Amendment');
var PublicKey  = mongoose.model('PublicKey');
var Membership = mongoose.model('Membership');
var Voting     = mongoose.model('Voting');
var Merkle     = mongoose.model('Merkle');
var Vote       = mongoose.model('Vote');
var Peer       = mongoose.model('Peer');
var Key        = mongoose.model('Key');
var Forward    = mongoose.model('Forward');
var Status     = require('../models/statusMessage');
var log4js     = require('log4js');
var logger     = require('../lib/logger')('sync');
var mlogger    = require('../lib/logger')('membership');
var vlogger    = require('../lib/logger')('voting');
var mathlog    = require('../lib/logger')('registryp');

mathlog.setLevel('INFO');

// Services
var ParametersService = service.Parameters;
var ContractService   = service.Contract;
var PeeringService    = service.Peering;

// Constants
var WITH_VOTING    = true;
var WITHOUT_VOTING = false;

module.exports.get = function (pgp, currency, conf) {
  
  var fifoCreateNextAM = async.queue(function (task, callback) {
    task(callback);
  }, 1);
  
  var fifoMembershipOrVoting = async.queue(function (task, callback) {
    task(callback);
  }, 1);
  
  var fifoSelfVote = async.queue(function (task, callback) {
    task(callback);
  }, 1);

  this.createNext = function (am, done) {
    fifoCreateNextAM.push(function (cb) {
      var amNext = new Amendment();
      var leavingMembers = [];
      var currentVoters = [];
      async.waterfall([
        function (next){
          amNext.selfGenerated = true;
          if (am) {
            ["version", "currency", "membersRoot", "membersCount", "votersRoot", "votersCount", "monetaryMass"].forEach(function(property){
              amNext[property] = am[property];
            });
            amNext.number = am.number + 1;
            amNext.previousHash = am.hash;
            amNext.generated = am.generated + conf.sync.AMFreq;
            amNext.membersChanges = [];
            amNext.votersChanges = [];
          } else {
            amNext.version = 1;
            amNext.currency = currency;
            amNext.number = 0;
            amNext.generated = conf.sync.AMStart;
            amNext.membersChanges = [];
            amNext.membersRoot = "";
            amNext.membersCount = 0;
            amNext.votersChanges = [];
            amNext.votersRoot = "";
            amNext.votersCount = 0;
            amNext.monetaryMass = 0;
          }
          amNext.nextVotes = Math.ceil(((am && am.votersCount) || 0) * conf.sync.Consensus);
          // Update UD
          updateUniversalDividend(amNext, am, next);
        },
        function (next){
          // Finally save proposed amendment
          amNext.hash = amNext.getRaw().hash();
          amNext.save(function (err) {
            ContractService.proposed(amNext);
            next(err);
          });
        },
        function (next){
          if (am && am.number > 0) {
            // Apply members/voters auto changes
            applyAutoMembersAndVotersChanges(amNext, next);
          } else {
            // We do not need to check previous voters, as there were no!
            next();
          }
        },
        function (next){
          var now = new Date().timestamp();
          require('../lib/daemon').nextIn((amNext.generated - now)*1000);
          next();
        },
      ], cb);
    }, done);
  };

  function applyAutoMembersAndVotersChanges (amNext, done) {
    async.waterfall([
      function (next){
        Key.getMembers(next);
      },
      function (members, next){
        async.forEachSeries(members, function(member, callback){
          async.waterfall([
            function (next){
              async.parallel({
                context: function(callback){
                  // Look at current amendment for membership validity comparison
                  memberContext(member.fingerprint, amNext.number - 1, callback);
                },
                isVoter: function(callback){
                  Key.wasVoter(member.fingerprint, amNext.number, callback);
                },
              }, next);
            },
            function (res, next){
              computeSingleMemberChanges(member.fingerprint, res.context, amNext, res.isVoter, next);
            },
          ], callback);
        }, next);
      }
    ], done);
  }

  this.takeCountOfVote = function (v, done) {
    if (v.basis > 0) {
      async.waterfall([
        function (next){
          Amendment.current(function (err, am) {
            next(null, am ? am.number + 1 : 0);
          });
        },
        function (amNumber, next){
          Amendment.getTheOneToBeVoted(amNumber, next);
        },
        function (amNext, next){
          if (v.amendmentHash == amNext.previousHash) {
            async.waterfall([
              function (next){
                memberContext(v.issuer, amNext.number - 1, next);
              },
              function (ctx, next){
                computeSingleMemberChanges(v.issuer, ctx, amNext, WITH_VOTING, next);
              },
            ], next);
            return;
          }
          else next();
        },
      ], done);
    } else {
      // Vote of AM0 has not to be taken in account for voters leaving purposes
      done();
    }
  };

  this.submit = function (entry, done) {
    fifoMembershipOrVoting.push(function (cb) {
      async.waterfall([

        function (next){
          PublicKey.getTheOne(entry.issuer, next);
        },

        // Verify signature
        function(pubkey, callback){
          var previous;
          var current = null;
          var nowIsIgnored = false;
          var merkleOfNextMembers;
          var amNext;
          var currentContext, newContext;
          async.waterfall([
            function (next){
              mlogger.debug('⬇ %s %s', entry.issuer, entry.membership);
              Membership.find({ issuer: pubkey.fingerprint, hash: entry.hash }, next);
            },
            function (entries, next){
              if (entries.length > 0) {
                next('Already received membership');
                return;
              }
              next();
            },
            function (next){
              dependingInterval(entry,
                function isTooLate (entryTS, minimalTS) {
                  next('Too late for this membership (' + entryTS + '): your membership must be at least ' + minimalTS + ', time of current amendment. Retry.');
                },
                function isTooEarly (entryTS, nextTS) {
                  next('Too early for this membership (' + entryTS + '): your membership must be max ' + (nextTS - 1) + '.');
                },
                function isGood (am) {
                  entry.amNumber = (am && am.number) || -1;
                  Membership.getCurrent(entry.issuer, next);
                }
              );
            },
            function (currentlyRecorded, next){
              current = currentlyRecorded;
              // Case new is OUT
              if (entry.membership == 'OUT') {
                if (!current) {
                  next('Have not opted-in yet');
                  return;
                } else if (current.membership == 'OUT') {
                  next('Already opted-out');
                  return;
                }
              }
              next();
            },
            function (next){
              // Get already existing Membership for same amendment
              Membership.getForAmendmentAndIssuer(entry.amNumber, entry.issuer, next);
            },
            function (entries, next){
              if (entries.length > 1) {
                next('Refused: already received more than one membership for next amendment.');
                return;
              } else if(entries.length > 0){
                // Already existing membership for this AM : this membership and the previous for this AM
                // are no more to be considered
                entry.eligible = false;
                previous = entries[0];
                entries[0].eligible = false;
                entries[0].save(function (err) {
                  nowIsIgnored = true;
                  next(err);
                });
              } else {
                next();
              }
            },
            function (next){
              // Saves entry
              entry.propagated = false;
              entry.save(function (err) {
                next(err);
              });
            },
            function (next){
              memberContext(entry.issuer, entry.amNumber, next);
            },
            function (ctx, next){
              newContext = ctx;
              Amendment.getTheOneToBeVoted(entry.amNumber + 1, next);
            },
            function (amendmentNext, next){
              amNext = amendmentNext;
              computeSingleMemberChanges(entry.issuer, newContext, amNext, WITH_VOTING, next);
            },
            function (next){
              mlogger.debug('✔ %s %s', entry.issuer, entry.membership);
              PeeringService.propagateMembership(entry);
              async.waterfall([
                function (next) {
                  if (nowIsIgnored) {
                    next('Cancelled: a previous membership was found, thus none of your memberships will be taken for next amendment');
                    return;
                  }
                  else next(null, entry);
                }
              ], next);
            }
          ], callback);
        }
      ], cb);
    }, done);
  };

  this.submitVoting = function (entry, done) {
    fifoMembershipOrVoting.push(function (cb) {
      async.waterfall([

        function (next){
          PublicKey.getTheOne(entry.issuer, next);
        },

        function(pubkey, callback){
          var current = null;
          async.waterfall([
            function (next){
              vlogger.debug('⬇ %s\'s voting', "0x" + entry.issuer.substr(32));
              Voting.find({ issuer: pubkey.fingerprint, hash: entry.hash }, next);
            },
            function (entries, next){
              if (entries.length > 0) {
                next('Already received voting');
                return;
              }
              next();
            },
            function (next){
              dependingInterval(entry,
                function isTooLate () {
                  next('Too late for this voting: amendment already voted. Retry.');
                },
                function isTooEarly () {
                  next('Too early for this voting: retry when next amendment is voted.');
                },
                function isGood (am) {
                  entry.amNumber = (am && am.number) || -1;
                  Voting.getCurrent(entry.issuer, next);
                }
              );
            },
            function (currentlyRecorded, next){
              current = currentlyRecorded;
              async.waterfall([
                function (next){
                  Amendment.isProposedMember(entry.issuer, entry.amNumber + 1, next);
                },
                function (isMember, next){
                  if (!isMember) {
                    next('Only members may be voters');
                    return;
                  }
                  next();
                },
              ], next);
            },
            function (next){
              Amendment.getTheOneToBeVoted(entry.amNumber + 1, next);
            },
            function (amNext, next){
              async.waterfall([
                function (next) {
                  Amendment.isVoter(entry.issuer, entry.amNumber, next);
                },
                function (isVoter, next){
                  if (isVoter) {
                    next('Already a voter currently');
                    return;
                  }
                  // Saves entry
                  entry.propagated = false;
                  entry.save(function (err) {
                    next(err);
                  });
                },
                function (next){
                  memberContext(entry.issuer, entry.amNumber, next);
                },
                function (ctx, next){
                  computeSingleMemberChanges(entry.issuer, ctx, amNext, WITH_VOTING, next);
                },
                function (next) {
                  // Returns the entry
                  next(null, entry);
                },
              ], next);
            },
          ], callback);
        }
      ], cb);
    }, done);
  };

  this.getVote = function (amNumber, done) {
    fifoSelfVote.push(function (cb) {
      async.waterfall([
        function (next){
          Vote.getSelf(amNumber, next);
        },
        function (vote, next){
          if (vote){
            next(null, vote);
            return;
          }
          // Tries to vote
          var now = new Date();
          async.waterfall([
            function (next){
              Amendment.getTheOneToBeVoted(amNumber, next);
            },
            function (amNext, next){
              var daemon = require('../lib/daemon');
              if (daemon.judges.timeForVote(amNext)) {

                var privateKey = pgp.keyring.privateKeys[0];
                var cert = jpgp().certificate(this.ascciiPubkey);
                var raw = amNext.getRaw();
                async.waterfall([
                  function (next){
                    jpgp().signsDetached(raw, privateKey, next);
                  },
                  function (signature, next){
                    var signedAm = raw + signature;
                    vucoin(conf.ipv6 || conf.ipv4 || conf.dns, conf.port, false, false, function (err, node) {
                      next(null, signedAm, node);
                    });
                  },
                  function (vote, node, next){
                    node.hdc.amendments.votes.post(vote, next);
                  },
                  function (json, next){
                    var am = new Amendment(json.amendment);
                    var issuer = cert.fingerprint;
                    var hash = json.signature.unix2dos().hash();
                    var basis = json.amendment.number;
                    Vote.getByIssuerHashAndBasis(issuer, hash, basis, next);
                  },
                  function (vote, next){
                    if (!vote) {
                      next('Self vote was not found');
                      return;
                    }
                    vote.selfGenerated = true;
                    vote.save(function  (err) {
                      next(err, vote);
                    });
                  },
                ], next);
                return;
              }
              next('Not yet');
            },
          ], next);
        },
      ], cb);
    }, done);
  };

  function dependingInterval (entry, isTooLate, isTooEarly, isGood) {
    Amendment.current(function (err, am) {
      var currentGenerated = am ? am.generated : conf.sync.AMStart;
      var entryTimestamp = parseInt(entry.sigDate.getTime()/1000, 10);
      if (currentGenerated > entryTimestamp) {
        isTooLate(entryTimestamp, currentGenerated);
      } else if(entryTimestamp >= currentGenerated + conf.sync.AMFreq) {
        isTooEarly(entryTimestamp, currentGenerated + conf.sync.AMFreq);
      } else {
        isGood(am);
      }
    });
  }

  function getExclusionDate (amNext) {
    var nextTimestamp = amNext.generated;
    var exclusionDate = new Date();
    exclusionDate.setTime(nextTimestamp*1000 - conf.sync.MSExpires*1000);
    return exclusionDate;
  }

  function updateUniversalDividend (amNext, amCurrent, done) {
    // Time for Universal Dividend (and we have members)
    var delayPassedSinceRootAM = (amNext.generated - conf.sync.AMStart);
    if (delayPassedSinceRootAM > 0 && delayPassedSinceRootAM % conf.sync.UDFreq == 0 && amNext.membersCount > 0) {
      async.waterfall([
        function (next) {
          Amendment.getPreviouslyPromotedWithDividend(next);
        },
        function (previousWithUD, next){
          var currentMass = (amCurrent && amCurrent.monetaryMass) || 0;
          var monetaryMassDelta = currentMass * conf.sync.UDPercent;
          var dividendPerMember = monetaryMassDelta / amNext.membersCount;
          var previousUD = (previousWithUD && previousWithUD.dividend) || conf.sync.UD0;
          amNext.dividend = Math.max(previousUD, Math.floor(dividendPerMember)); // Integer
          amNext.monetaryMass += amNext.dividend * amNext.membersCount; // Integer
          next();
        },
      ], done);
    }
    else done(null);
  }

  /**
  * Retrieve member's context and update members & voters merkles + proposed contract consequently.
  */
  function computeSingleMemberChanges (key, ctx, amNext, withVoting, done) {
    async.waterfall([
      async.apply(computeIndicators, ctx, amNext),
      function (indicator, next){
        async.series({
          member: function(callback){
            mathlog.debug('ms delta for %s = %s', key, indicator.membership);
            mathlog.debug('withVoting = %s', withVoting);
            updateMembersFromIndicator(key, indicator.membership, amNext, callback);
          },
          key: function(callback){
            if (!withVoting) {
              callback();
              return;
            }
            mathlog.debug('k delta for %s = %s', key, indicator.key);
            // This does NOT NECESSARILY update the key: it depends on indicators' values
            updateVotersFromIndicator(key, indicator.key, amNext, callback);
          }
        }, function (err) {
          next(err);
        });
      },
      function (next) {
        Amendment.current(function (err, am) {
          next(null, am);
        });
      },
      function (currentAm, next){
        // Update UD with new members count
        updateUniversalDividend(amNext, currentAm, next);
      },
      function (next) {
        // Update amendment changes
        amNext.nextVotes = Math.ceil((amNext.votersCount || 0) * conf.sync.Consensus);
        amNext.hash = amNext.getRaw().hash();
        amNext.save(function (err) {
          ContractService.proposed(amNext);
          next(err);
        });
      }
    ], done);
  }

  /**
  * Compute member's indicators according to a given context.
  */
  function computeIndicators (ctx, amNext, done) {
    var res = {};
    async.waterfall([
      async.apply(memberContext2AnalyticalParameters, ctx, amNext),
      async.apply(Computing.Membership.Delta),
      function (msIndicator, next){
        res.membership = msIndicator;
        voterContext2AnalyticalParameters(ctx, msIndicator == -1, next);
      },
      async.apply(Computing.Voting),
      function (vtIndicator, next) {
        res.key = vtIndicator;
        next();
      }
    ], function (err) {
      // Mark out indicators to -1 and 1
      res.membership = Math.max(-1, Math.min(1, res.membership));
      res.key = Math.max(-1, Math.min(1, res.key));
      done(err, res);
    });
  }

  /**
  * Converts member context vars to analytical expression parameters (for Computing functions' namespace)
  */
  function memberContext2AnalyticalParameters (context, amNext, done) {
    var ctx = context || { currentMembership: null, nextMemberships: [] };
    var hasIn = ctx.currentMembership && ctx.currentMembership.membership == 'IN';
    var hasOut = ctx.currentMembership && ctx.currentMembership.membership == 'OUT';
    var hasInTooOld = (hasIn && ctx.currentMembership.sigDate < getExclusionDate(amNext));
    var ms = [
      ctx.currentMembership == null ? 1 : 0,
      hasIn && !hasInTooOld ? 1 : 0,
      hasOut ? 1 : 0,
      hasInTooOld ? 1 : 0
    ];
    var hasNextIn = ctx.nextMemberships.length > 0 && ctx.nextMemberships[0].membership == 'IN';
    var hasNextInCancelled = false;
    if (ctx.nextMemberships.length > 1) {
      hasNextInCancelled = ctx.nextMemberships[0].created < ctx.nextMemberships[1].created ?
        ctx.nextMemberships[0].membership == 'IN' :
        ctx.nextMemberships[1].membership == 'IN';
    }
    var hasNextOut = ctx.nextMemberships.length > 0 && ctx.nextMemberships[0].membership == 'OUT';
    var hasNextOutCancelled = false;
    if (ctx.nextMemberships.length > 1) {
      hasNextOutCancelled = ctx.nextMemberships[0].created < ctx.nextMemberships[1].created ?
        ctx.nextMemberships[0].membership == 'OUT' :
        ctx.nextMemberships[1].membership == 'OUT';
    }
    var p = [
      1,
      hasNextIn ? 1 : 0,
      hasNextOut ? 1 : 0,
      hasNextInCancelled ? 1 : 0,
      hasNextOutCancelled ? 1 : 0
    ];
    mathlog.debug('ms = ', ms);
    mathlog.debug('p = ', p);
    done(null, ms, p);
  }

  /**
  * Converts voter context vars to analytical expression parameters (for Computing functions' namespace)
  */
  function voterContext2AnalyticalParameters (context, memberLeaving, done) {
    var memberCtx = context || { currentVote: null, nextVoting: null };
    var vt = [
      memberCtx.currentVoting ? 0 : 1,
      memberCtx.currentVoting ? 1 : 0
    ];
    var p = [
      memberCtx.amNumber > 0 ? 1 : 0,
      memberCtx.amNumber > 0 && memberCtx.currentVote != null ? 1 : 0,
      memberCtx.nextVoting != null ? 1 : 0,
      memberLeaving == 1 ? 1 : 0
    ];
    mathlog.debug('vt = ', vt);
    mathlog.debug('p = ', p);
    done(null, vt, p);
  }

  /**
  * Retrieve member's membership & voting context for next promoted amendment.
  */
  function memberContext (member, amNumber, done) {
    async.parallel({
      currentMembership: function (callback){
        // Get lastly emitted & confirmed membership BEFORE amNumber
        Membership.getCurrentForIssuerAndAmendment(member, amNumber, function (err, records) {
          callback(null, err ? [] : records);
        });
      },
      nextMemberships: function (callback){
        // Get lastly emitted & valid (not confirmed) memberships FOR amNumber
        Membership.getForAmendmentAndIssuer(amNumber, member, function (err, records) {
          callback(null, err ? [] : records);
        });
      },
      currentVoting: function (callback){
        // Get lastly emitted & confirmed voting at N-2 (meaning has voting UNDER N-1)
        Voting.getCurrentForIssuerAndAmendment(member, amNumber - 1, function (err, obj) {
          callback(null, err ? null : obj);
        });
      },
      nextVoting: function (callback){
        // Get lastly emitted & valid (not confirmed) votings FOR amNumber
        Voting.getForAmendmentAndIssuer(amNumber, member, function (err, obj) {
          callback(null, err ? null : obj);
        });
      },
      currentVote: function (callback) {
        var voting = null;
        async.waterfall([
          function (next){
            // Get lastly emitted & confirmed voting at N-2 (meaning has voting UNDER N-1)
            Voting.getCurrentForIssuerAndAmendment(member, amNumber - 1, function (err, obj) {
              if (err || obj == null) {
                next('No voting for this key');
                return;
              }
              voting = obj;
              next();
            });
          },
          function (next){
            // Get THIS promoted amendment
            Amendment.findPromotedByNumber(amNumber, next);
          },
          function (am, next){
            // Get emitted vote for promoted amNumber
            Vote.getByIssuerAmendmentHashAndBasis(voting.issuer, am.hash, am.number, next);
          }
        ], function (err, v) {
          callback(null, v);
        });
      }
    }, function (err, ctx) {
      // Add amendment number
      ctx.amNumber = amNumber;
      done(err, ctx);
    });
  }

  function updateMembersFromIndicator (member, statusTo, amNext, done) {
    var whatToDo = {
      changes: { "0": {}, "1" :{}, "-1": {}},
      merkle: { "0": {}, "1" :{}, "-1": {}},
      state: { "0": {}, "1" :{}, "-1": {}}
    };
    whatToDo.changes["0"]["1"] = function (k, changes, done) {
      mathlog.info('MS +%s', k);
      keyAdd(k, changes, done);
    };
    whatToDo.changes["1"]["0"] = function (k, changes, done) {
      mathlog.info('MS CANCEL -%s', k);
      keyUndoAdd(k, changes, done);
    };
    whatToDo.changes["0"]["-1"] = function (k, changes, done) {
      mathlog.info('MS -%s', k);
      keyRemove(k, changes, done);
    };
    whatToDo.changes["-1"]["0"] = function (k, changes, done) {
      mathlog.info('MS CANCEL -%s', k);
      keyUndoRemove(k, changes, done);
    };
    whatToDo.merkle["0"]["1"] = addInMemberMerkle;
    whatToDo.merkle["1"]["0"] = removeFromMemberMerkle;
    whatToDo.merkle["0"]["-1"] = removeFromMemberMerkle;
    whatToDo.merkle["-1"]["0"] = addInMemberMerkle;
    whatToDo.state["0"]["1"] = Key.setLastMSState;
    whatToDo.state["1"]["0"] = Key.setLastMSState;
    whatToDo.state["0"]["-1"] = Key.setLastMSState;
    whatToDo.state["-1"]["0"] = Key.setLastMSState;

    function doNothing (k, changes, done) {
      done();
    }

    function doNothingWithState (k, state, done) {
      done();
    }

    async.waterfall([
      function (next){
        Key.getLastMSState(member, next);
      },
      function (statusFrom, next){
        // console.log('ms %s from %s => %s', member, statusFrom, statusTo);
        var stateFunc = async.apply(whatToDo.state[statusFrom.toString()][statusTo.toString()] || doNothingWithState, member, statusTo);
        async.auto({
          updateMemberState: stateFunc,
          updateMembersChanges: async.apply(whatToDo.changes[statusFrom.toString()][statusTo.toString()] || doNothing, member, amNext.membersChanges),
          updateMembersMerkle: function(callback){
            async.waterfall([
              function (next){
                Merkle.proposedMembers(next);
              },
              function (merkle, next){
                var f = whatToDo.merkle[statusFrom.toString()][statusTo.toString()] || function (k, merkle, done) {
                  done(null, merkle);
                };
                f(member, merkle, next);
              },
              function (merkle, next){
                merkle.save(function (err) {
                  next(err, { leaves: merkle.leaves() || [], root: merkle.root() });
                });
              },
            ], callback);
          },
          saveAmendmentChanges: ['updateMembersChanges', 'updateMembersMerkle', function (callback, res) {
            amNext.membersCount = res.updateMembersMerkle.leaves.length;
            amNext.membersRoot = res.updateMembersMerkle.root;
            amNext.hash = amNext.getRaw().hash();
            amNext.save(function (err) {
              callback(err);
            });
          }]
        }, next);
      },
    ], done);
  }

  function updateVotersFromIndicator (key, statusTo, amNext, done) {
    var whatToDo = {
      changes: { "0": {}, "1" :{}, "-1": {}},
      merkle: { "0": {}, "1" :{}, "-1": {}},
      state: { "0": {}, "1" :{}, "-1": {}}
    };
    whatToDo.changes["0"]["1"] = keyAdd;
    whatToDo.changes["1"]["0"] = keyUndoAdd;
    whatToDo.changes["0"]["-1"] = keyRemove;
    whatToDo.changes["-1"]["0"] = keyUndoRemove;
    whatToDo.merkle["0"]["1"] = addInVoterMerkle;
    whatToDo.merkle["1"]["0"] = removeFromVoterMerkle;
    whatToDo.merkle["0"]["-1"] = removeFromVoterMerkle;
    whatToDo.merkle["-1"]["0"] = addInVoterMerkle;
    whatToDo.state["0"]["1"] = Key.setLastState;
    whatToDo.state["1"]["0"] = Key.setLastState;
    whatToDo.state["0"]["-1"] = Key.setLastState;
    whatToDo.state["-1"]["0"] = Key.setLastState;

    function doNothingWithKey (k, changes, done) {
      done();
    }

    function doNothingWithMerkle (k, merkle, done) {
      done(null, merkle);
    }

    function doNothingWithState (k, state, done) {
      done();
    }

    async.waterfall([
      function (next){
        async.parallel({
          state: async.apply(Key.getLastState, key)
        }, next);
      },
      function (res, next){
        var lastKeyState = res.state;
        // console.log('vt\' %s from %s => %s', key, lastKeyState, statusTo);
        if (lastKeyState == -1 && statusTo == 1) {
          statusTo = 0;
        }
        if (lastKeyState == 1 && statusTo == -1) {
          statusTo = 0
        }
        // console.log('vt\'\' %s from %s => %s', key, lastKeyState, statusTo);
        async.waterfall([
          function (next){
            // See what operation it is
            var merkleFunc = async.apply(whatToDo.merkle[lastKeyState.toString()][statusTo.toString()] || doNothingWithMerkle, key);
            var keysFunc  = async.apply(whatToDo.changes[lastKeyState.toString()][statusTo.toString()] || doNothingWithKey, key, amNext.votersChanges);
            var stateFunc = async.apply(whatToDo.state[lastKeyState.toString()][statusTo.toString()] || doNothingWithState, key, statusTo);
            if ((lastKeyState == 0 && statusTo == 1) || (lastKeyState == -1 && statusTo == 0)) {
              // Make positive change
              mathlog.info('VT +%s', key);
              actionForVoters(merkleFunc, keysFunc, stateFunc, amNext, next);
            } else if ((lastKeyState == 1 && statusTo == 0) || (lastKeyState == 0 && statusTo == -1)) {
              // Make negative change
              mathlog.info('VT -%s', key);
              actionForVoters(merkleFunc, keysFunc, stateFunc, amNext, next);
            } else {
              // Do nothing!
              next();
            }
          }
        ], next);
      },
    ], function (err) {
      done(err);
    });
  }

  function actionForVoters (merkleFunc, votersFunc, stateFunc, amNext, done) {
    async.auto({
      updateStat: stateFunc,
      updateVotersChanges: votersFunc,
      updateVotersMerkle: function(callback){
        async.waterfall([
          function (next){
            Merkle.proposedVoters(next);
          },
          function (merkle, next){
            merkleFunc(merkle, next);
          },
          function (merkle, next){
            merkle.save(function (err) {
              next(err, merkle);
            });
          },
        ], callback);
      },
      saveAmendmentChanges: ['updateVotersChanges', 'updateVotersMerkle', function (callback, res) {
        amNext.votersCount = res.updateVotersMerkle.leaves().length;
        amNext.votersRoot = res.updateVotersMerkle.root();
        amNext.hash = amNext.getRaw().hash();
        amNext.save(function (err) {
          callback(err);
        });
      }]
    }, function (err) {
      done(err);
    });
  }

  function keyAdd (key, keyChanges, done) {
    if (keyChanges.indexOf('+' + key) == -1) {
      keyChanges.push('+' + key);
      keyChanges.sort();
    }
    done();
  }

  function keyUndoAdd (key, keyChanges, done) {
    var index = keyChanges.indexOf('+' + key);
    if (~index) {
      keyChanges.splice(index, 1);
      keyChanges.sort();
    }
    done();
  }

  function keyRemove (key, keyChanges, done) {
    if (keyChanges.indexOf('-' + key) == -1) {
      keyChanges.push('-' + key);
      keyChanges.sort();
    }
    done();
  }

  function keyUndoRemove (key, keyChanges, done) {
    var index = keyChanges.indexOf('-' + key);
    if (~index) {
      keyChanges.splice(index, 1);
      keyChanges.sort();
    }
    done();
  }

  function addInMemberMerkle (key, merkle, done) {
    Key.addProposedMember(key, function (err) {
      merkle.push(key);
      done(null, merkle);
    });
  }

  function removeFromMemberMerkle (key, merkle, done) {
    Key.removeProposedMember(key, function (err) {
      merkle.remove(key);
      done(null, merkle);
    });
  }

  function addInVoterMerkle (key, merkle, done) {
    Key.addProposedVoter(key, function (err) {
      merkle.push(key);
      done(null, merkle);
    });
  }

  function removeFromVoterMerkle (key, merkle, done) {
    Key.removeProposedVoter(key, function (err) {
      merkle.remove(key);
      done(null, merkle);
    });
  }

  return this;
}

var Computing = { Membership: {}, Voting: {} };

/**
* Computes changes for a key, given its current state + changes.
* @parameter ms Array of 4 Integers: [currentNone, currentIn, currentOut, currentInTooOld].
*   Each integer is either 1 or 0:
*   * currentNone: 1 if current membership of a key doesn't exist, 0 otherwise
*   * currentIn: 1 if current membership of a key is a valid IN, 0 otherwise
*   * currentOut: 1 if current membership of a key is OUT, 0 otherwise
*   * currentInTooOld: 1 if current membership of a key is a too old IN, 0 otherwise
*   __Sum of those 4 integers MUST always be 1.__
*
* @parameter p Array of 4 Integers: [newNone, newIn, newOut, newInCancelled, newOutCancelled].
*   Each integer is either 1 or 0:
*   * newNone: 1 if new membership of a key doesn't exist, 0 otherwise
*   * newIn: 1 if new membership of a key is IN, 0 otherwise
*   * newOut: 1 if new membership of a key is OUT, 0 otherwise
*   * newInCancelled: 1 if new membership of a key is IN, which has been cancelled, 0 otherwise
*   * newOutCancelled: 1 if new membership of a key is OUT, which has been cancelled, 0 otherwise
*/
Computing.Membership.Delta = function (ms, p, done) {

  if (ms.reduce(function(a,b){ return a + b; }) !== 1) {
    done('Wrong membership state array: should be either in, out, in too old or no membership at all.');
  }

  /**
  * Computes changes for a key given changes with and initial state
  * @param p array of changes
  */
  function MSNone (p) {
    return p[1] - p[3];
  }

  /**
  * Computes changes for a key given changes with and initial state
  * @param m 1 if initial state is no membership, 0 otherwise
  * @param p array of changes
  */
  function MSIn (p) {
    return - p[2] + p[4];
  }

  /**
  * Computes changes for a key given changes with and initial state
  * @param m 1 if initial state is no membership, 0 otherwise
  * @param p array of changes
  */
  function MSOut (p) {
    return p[1] - p[3];
  }

  /**
  * Computes changes for a key given changes with and initial state
  * @param m 1 if initial state is no membership, 0 otherwise
  * @param p array of changes
  */
  function MSInx (p) {
    return - p[0] + p[1] - p[3];
  }

  // console.log('params = ', ms, p);
  // console.log('partial res = ', MSNone(p), MSIn(p), MSOut(p), MSInx(p));
  // console.log('real = %s', ms[0]*MSNone(p) + ms[1]*MSIn(p) + ms[2]*MSOut(p) + ms[3]*MSInx(p));
  // console.log('-----');
  done(null, ms[0]*MSNone(p) + ms[1]*MSIn(p) + ms[2]*MSOut(p) + ms[3]*MSInx(p));
}

/**
* Computes changes for a voter, using given voting & membership events.
* @parameter vt Array of 2 Integers: [wasNotVoter, wasVoter].
*   Each integer is either 1 or 0:
*   * wasNotVoter: 1 if key was not voter, 0 otherwise
*   * wasVoter: 1 if key was voter, 0 otherwise
*   __Sum of those 2 integers MUST always be 1.__

* @parameter p Array of 4 Integers: [hasNotVoted, hasVoted, hasNewVoting, isLeavingMember].
*   Each integer is either 1 or 0:
*   * hasNotVoted: 1 if voter has voted current amendment, 0 otherwise
*   * hasVoted: 1 if voter has voted current amendment, 0 otherwise
*   * hasNewVoting: 1 if member submitted new voting key, 0 otherwise
*   * isLeavingMember: 1 if member is leaving, 0 otherwise
*/
Computing.Voting = function (vt, p, done) {

  mathlog.debug(vt[0]*VTNone(p), vt[1]*VTNext(p));
  mathlog.debug(vt[0]*VTNone(p) + vt[1]*VTNext(p));
  done(null, vt[0]*VTNone(p) + vt[1]*VTNext(p));
}

function VTNone (p) {
  return p[2] - p[3];
}

function VTNext (p) {
  return - p[0] + p[1] - p[3];
}
