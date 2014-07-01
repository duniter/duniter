var jpgp     = require('../lib/jpgp');
var async    = require('async');
var moment   = require('moment');
var request  = require('request');
var vucoin   = require('vucoin');
var merkle   = require('merkle');
var _        = require('underscore');
var openpgp  = require('openpgp');
var Status   = require('../models/statusMessage');
var coiner   = require('../lib/coiner');
var log4js   = require('log4js');
var logger   = require('../lib/logger')('sync');
var mlogger  = require('../lib/logger')('membership');
var vlogger  = require('../lib/logger')('voting');
var mathlog  = require('../lib/logger')('registryp');

mathlog.setLevel('INFO');

// Constants
var NO_CHANGES = "NO_CHANGES";

module.exports.get = function (conn, conf, signsDetached, ContractService, PeeringService, daemonJudgesTimeForVote) {
  return new SyncService(conn, conf, signsDetached, ContractService, PeeringService, daemonJudgesTimeForVote);
};

function SyncService (conn, conf, signsDetached, ContractService, PeeringService, daemonJudgesTimeForVote) {

  var that = this;
  var currency = conf.currency;

  var Amendment     = conn.model('Amendment');
  var PublicKey     = conn.model('PublicKey');
  var Membership    = conn.model('Membership');
  var Voting        = conn.model('Voting');
  var Merkle        = conn.model('Merkle');
  var Vote          = conn.model('Vote');
  var CKey          = conn.model('CKey');
  var Statement = conn.model('Statement');
  var Peer          = conn.model('Peer');
  var Key           = conn.model('Key');
  var Forward       = conn.model('Forward');
  
  var fifoMembershipOrVoting = async.queue(function (task, callback) {
    task(callback);
  }, 1);
  
  var fifoStatement = async.queue(function (task, callback) {
    task(callback);
  }, 1);
  
  var fifoSelfVote = async.queue(function (task, callback) {
    task(callback);
  }, 1);
  
  var fifoSelfStatement = async.queue(function (task, callback) {
    task(callback);
  }, 1);

  this.submit = function (obj, done) {
    var entry = new Membership(obj);
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
              if (ContractService.current().number != entry.amNumber) {
                next('Wrong amendment number: should be \'' + ContractService.current().number + '\' but was \'' + entry.amNumber + '\'');
                return;
              }
              if (ContractService.current().hash != entry.amHash) {
                next('Wrong amendment hash: should be \'' + ContractService.current().hash + '\' but was \'' + entry.amHash + '\'');
                return;
              }
              dependingInterval(entry,
                function isTooLate (entryTS, minimalTS) {
                  next('Too late for this membership (' + toDateString(entryTS) + '): your membership must be at least ' + toDateString(minimalTS) + ', time of current amendment. Retry.');
                },
                function isTooEarly (entryTS, nextTS) {
                  next('Too early for this membership (' + toDateString(entryTS) + '): your membership must be max ' + toDateString(nextTS - 1) + ' (next AM date)');
                },
                function isGood () {
                  Key.wasMember(entry.issuer, entry.amNumber, next);
                }
              );
            },
            function (isMember, next){
              if (!isMember && entry.membership == 'OUT') {
                next('You can only opt-in right now');
              } else if (isMember && entry.membership == 'IN') {
                next('You can only opt-out right now');
              } else {
                next();
              }
            },
            function (next){
              // Get already existing Membership for same amendment
              Membership.getForAmendmentAndIssuer(entry.amNumber, entry.issuer, next);
            },
            function (entries, next){
              if (entries.length > 0) {
                next('Already received membership');
              }
              else next();
            },
            function (next){
              // Saves entry
              entry.propagated = false;
              entry.save(function (err) {
                next(err);
              });
            },
            function (next){
              mlogger.debug('✔ %s %s', entry.issuer, entry.membership);
              next(null, entry);
            }
          ], callback);
        }
      ], cb);
    }, done);
  };

  this.submitVoting = function (obj, done) {
    var entry = new Voting(obj);
    fifoMembershipOrVoting.push(function (cb) {
      async.waterfall([

        function (next){
          PublicKey.getTheOne(entry.issuer, next);
        },

        function(pubkey, callback){
          var current = null;
          async.waterfall([
            function (next){
              if (ContractService.current().number != entry.amNumber) {
                next('Wrong amendment number: should be \'' + ContractService.current().number + '\' but was \'' + entry.amNumber + '\'');
                return;
              }
              if (ContractService.current().hash != entry.amHash) {
                next('Wrong amendment hash: should be \'' + ContractService.current().hash + '\' but was \'' + entry.amHash + '\'');
                return;
              }
              dependingInterval(entry,
                function isTooLate (entryTS, minimalTS) {
                  next('Too late for this voting(' + toDateString(entryTS) + '): amendment already voted. Retry.');
                },
                function isTooEarly () {
                  next('Too early for this voting: retry when next amendment is voted.');
                },
                function isGood () {
                  async.waterfall([
                    function (next) {
                      // Get already existing Membership for same amendment
                      Voting.getForAmendmentAndIssuer(entry.amNumber, entry.issuer, next);
                    },
                    function (entries, next){
                      if (entries.length > 0) {
                        next('Refused: already received.');
                        return;
                      } else next();
                    },
                    function (next){
                      // Saves entry
                      entry.propagated = false;
                      entry.save(function (err) {
                        next(err);
                      });
                    },
                    function (next) {
                      // Returns the entry
                      next(null, entry);
                    },
                  ], next);
                }
              );
            },
          ], callback);
        }
      ], cb);
    }, done);
  };

  this.submitStatement = function (obj, done) {
    var entry = new Statement(obj);
    fifoStatement.push(function (cb) {
      async.waterfall([
        function (next) {
          if (['AnyKey', '1Sig'].indexOf(entry.algorithm) == -1) {
            next('Algorithm must be either AnyKey or 1Sig');
            return;
          }
          Statement.getByIssuerAlgoAmendmentHashAndNumber(entry.issuer, entry.algorithm, entry.amendmentHash, entry.amendmentNumber, next);
        },
        function (cf, next) {
          if (cf && cf.length > 0) {
            next('Already received');
            return;
          }
          Amendment.findPromotedByNumber(entry.amendmentNumber, next);
        },
        function (promoted, next) {
          if (promoted.hash != entry.amendmentHash) {
            next('Statement rejected: based on a non-promoted amendment');
            return;
          }
          entry.save(function (err) {
            next(err);
          });
        },
        function (next) {
          // OK
          if (false && entry.selfGenerated) {
            // Check Merkles & create ckeys
            async.parallel({
              membersJoining: async.apply(updateCKeysFromLocalMerkle, async.apply(Merkle.membersIn.bind(Merkle),  entry.amendmentNumber, entry.algorithm), '+', entry.algorithm, true),
              membersLeaving: async.apply(updateCKeysFromLocalMerkle, async.apply(Merkle.membersOut.bind(Merkle), entry.amendmentNumber, entry.algorithm), '-', entry.algorithm, true),
              votersJoining:  async.apply(updateCKeysFromLocalMerkle, async.apply(Merkle.votersIn.bind(Merkle),   entry.amendmentNumber, entry.algorithm), '+', entry.algorithm, false),
              votersLeaving:  async.apply(updateCKeysFromLocalMerkle, async.apply(Merkle.votersOut.bind(Merkle),  entry.amendmentNumber, entry.algorithm), '-', entry.algorithm, false),
            }, next);
          } else {
            // Increment count of witnesses
            async.parallel({
              membersJoining: async.apply(updateCKeysFromRemoteMerkle, entry.issuer, entry.amendmentNumber, 'node.registry.amendment.membersIn',  '+', entry.algorithm, true),
              membersLeaving: async.apply(updateCKeysFromRemoteMerkle, entry.issuer, entry.amendmentNumber, 'node.registry.amendment.membersOut', '-', entry.algorithm, true),
              votersJoining:  async.apply(updateCKeysFromRemoteMerkle, entry.issuer, entry.amendmentNumber, 'node.registry.amendment.votersIn',   '+', entry.algorithm, false),
              votersLeaving:  async.apply(updateCKeysFromRemoteMerkle, entry.issuer, entry.amendmentNumber, 'node.registry.amendment.votersOut',  '-', entry.algorithm, false),
            }, next);
          }
        },
        function (res, next){
          that.tryToVote(entry.amendmentNumber + 1, entry.algorithm, function (err) {
            if (err) logger.warn(err);
            next(null, entry);
          });
        },
      ], cb);
    }, done);
  };

  that.tryToVote = function (amNumber, algo, done) {
    // Tries to vote
    var now = new Date();
    var amCurrent = null;
    async.waterfall([
      function (next){
        Amendment.current(next);
      },
      function (current, next) {
        amCurrent = current;
        Statement.getForAmendmentAndAlgo(amNumber -1, algo, next);
      },
      function (cfs, next){
        logger.debug("%s statements / %s voters = %s%", cfs.length, amCurrent.votersCount, cfs.length/amCurrent.votersCount*100)
        if (cfs.length/amCurrent.votersCount < 0.6) {
          next('Not voting yet, waiting for >= 60% voters');
          return;
        } else {
          next();
        }
      },
      function (next){
        getOrCreateAmendment(amNumber, algo, next);
      },
      function (amNext, next){
        if (daemonJudgesTimeForVote(amNext)) {

          var raw = "";
          async.waterfall([
            function (next){
              // Prepare AM
              async.waterfall([
                function (next){
                  async.parallel({
                    membersJoining: async.apply(lookForCKeys, '+', algo, true),
                    membersLeaving: async.apply(lookForCKeys, '-', algo, true),
                    votersJoining:  async.apply(lookForCKeys, '+', algo, false),
                    votersLeaving:  async.apply(lookForCKeys, '-', algo, false),
                    members:        async.apply(Key.getMembers.bind(Key)),
                    voters:         async.apply(Key.getVoters.bind(Key))
                  }, next);
                },
                function (res, next){
                  // Update Merkle of proposed members
                  var members = [];
                  var voters = [];
                  if (~res.membersJoining.indexOf(NO_CHANGES)) res.membersJoining = [];
                  if (~res.membersLeaving.indexOf(NO_CHANGES)) res.membersLeaving = [];
                  if (~res.votersJoining.indexOf(NO_CHANGES)) res.votersJoining = [];
                  if (~res.votersLeaving.indexOf(NO_CHANGES)) res.votersLeaving = [];
                  res.members.forEach(function(m){
                    members.push(m.fingerprint);
                  });
                  res.voters.forEach(function(m){
                    voters.push(m.fingerprint);
                  });
                  amNext.membersChanges = [];
                  amNext.votersChanges = [];
                  res.membersJoining.forEach(function(fpr){
                    amNext.membersChanges.push('+' + fpr);
                    if (members.indexOf(fpr) == -1)
                      members.push(fpr);
                  });
                  res.membersLeaving.forEach(function(fpr){
                    amNext.membersChanges.push('-' + fpr);
                    var index = members.indexOf(fpr);
                    if (~index) {
                      members.splice(index, 1);
                    }
                  });
                  res.votersJoining.forEach(function(fpr){
                    amNext.votersChanges.push('+' + fpr);
                    if (voters.indexOf(fpr) == -1)
                      voters.push(fpr);
                  });
                  res.votersLeaving.forEach(function(fpr){
                    amNext.votersChanges.push('-' + fpr);
                    var index = voters.indexOf(fpr);
                    if (~index) {
                      voters.splice(index, 1);
                    }
                  });
                  var merkleMembers = new Merkle();
                  var merkleVoters = new Merkle();
                  members.sort();
                  voters.sort();
                  merkleMembers.initialize(members);
                  merkleVoters.initialize(voters);
                  amNext.membersChanges.sort();
                  amNext.membersCount = members.length;
                  amNext.membersRoot = merkleMembers.root();
                  amNext.votersChanges.sort();
                  amNext.votersCount = voters.length;
                  amNext.votersRoot = merkleVoters.root();
                  // Update UniversalDividend
                  updateUniversalDividend(amNext, next);
                },
                function (next) {
                  amNext.save(function (err) {
                    raw = amNext.getRaw();
                    next(err);
                  });
                }
              ], next);
            },
            function (next){
              signsDetached(raw, next);
            },
            function (signature, next){
              // TODO: à remplacer par _write
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
              var issuer = PeeringService.cert.fingerprint;
              var hash = (am.getRaw() + json.signature).unix2dos().hash();
              var basis = json.amendment.number;
              Vote.getByIssuerHashAndBasis(issuer, hash, basis, function (err, vote) {
                next(err, vote, hash, basis);
              });
            },
            function (vote, hash, basis, next){
              if (!vote) {
                next('Strange! self vote was not found for #' + basis + '-' + hash + '... not recorded?');
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
    ], done);
  };

  function updateCKeysFromRemoteMerkle (peerFPR, amNumber, method, op, algo, isMember, done) {
    async.waterfall([
      function (next){
        Peer.getTheOne(peerFPR, next);
      },
      function (peer, next){
        peer.connect(next);
      },
      function (node, next){
        var f = eval(method);
        f(amNumber, algo, { leaves: true }, next);
      },
      function (json, next){
        incrementForKeys(json.leaves, op, algo, isMember, done);
      },
    ], function (err) {
      if (err) logger.warn(err);
      done(err);
    });
  }

  function updateCKeysFromLocalMerkle (merkleGet, op, algo, isMember, done) {
    async.waterfall([
      function (next){
        merkleGet(next);
      },
      function (merkle, next){
        incrementForKeys(merkle.leaves(), op, algo, isMember, done);
      },
    ], done);
  }

  function incrementForKeys (keys, op, algo, isMember, done) {
    if (keys.length == 0) {
      CKey.increment(NO_CHANGES, op, algo, isMember, function (err) {
        done(err);
      });
    }
    else {
      async.forEach(keys, function(leaf, callback){
        CKey.increment(leaf, op, algo, isMember, callback);
      }, done);
    }
  }

  this.getVote = function (amNumber, algo, done) {
    fifoSelfVote.push(function (cb) {
      async.waterfall([
        function (next){
          Vote.getSelfForAlgo(amNumber, algo, next);
        },
        function (vote, next){
          if (vote){
            next(null, vote);
            return;
          }
          next('Vote unavailable for now');
        },
      ], cb);
    }, done);
  };

  function lookForCKeys (op, algo, areMembers, done) {
    async.waterfall([
      function (next){
        CKey.findThose(op, algo, areMembers, next);
      },
      function (ckeys, next){
        // Take all keys between AVG and +/- STDVAR
        var total = 0;
        ckeys.forEach(function(ck){
          total += ck.count;
        });
        if (total > 0) {
          var avg = total / ckeys.length;
          var variance = 0;
          ckeys.forEach(function(ck){
            variance += (ck.count - avg)*(ck.count - avg);
          });
          variance /= ckeys.length;
          var stdvar = Math.sqrt(variance);
          var min = avg - stdvar;
          var max = avg + stdvar;
          var keys = [];
          ckeys.forEach(function(ck){
            if (ck.count >= min || ck.count <= max)
              keys.push(ck.fingerprint);
          });
          next(null, keys);
        } else {
          // No keys
          next(null, []);
        }
      },
    ], done);
  }

  this.getStatement = function (amNumber, algo, done) {
    if (amNumber == 0) {
      done('Not available for AM#0');
      return;
    }
    var basis = amNumber - 1;
    fifoSelfStatement.push(function (cb) {
      async.waterfall([
        function (next){
          Statement.getSelf(basis, algo, function (err, statement) {
            next(null, statement);
          });
        },
        function (st, next){
          if (st){
            next(null, st);
            return;
          }
          // Tries to create Statement
          var now = new Date();
          async.waterfall([
            function (next){
              Amendment.findPromotedByNumber(basis, next);
            },
            function (amPrevious, next){
              if (daemonJudgesTimeForVote({ generated: amPrevious.generated + conf.sync.AMFreq })) {

                var cert = PeeringService.cert;
                var st = new Statement();
                st.version = "1";
                st.currency = currency;
                st.algorithm = algo;
                st.date = new Date();
                st.issuer = cert.fingerprint;
                st.amendmentNumber = amPrevious.number;
                st.amendmentHash = amPrevious.hash;
                async.waterfall([
                  function (next) {
                    computeLocalMSandVTChanges(basis, algo, next);
                  },
                  function (membersJoining, membersLeaving, votersJoining, votersLeaving, members, voters, next){
                    async.parallel({
                      membersJoining: function(cb) {
                        async.waterfall([
                          async.apply(Merkle.membersIn.bind(Merkle), basis, algo),
                          function (merkle, next) {
                            merkle.initialize(membersJoining);
                            merkle.save(function(err){
                              next(err, merkle);
                            });
                          },
                          function (merkle, next) {
                            st.membersJoiningRoot = merkle.root();
                            st.membersJoiningCount = membersJoining.length;
                            next();
                          }
                        ], cb);
                      },
                      membersLeaving: function(cb) {
                        async.waterfall([
                          async.apply(Merkle.membersOut.bind(Merkle), basis, algo),
                          function (merkle, next) {
                            merkle.initialize(membersLeaving);
                            merkle.save(function(err){
                              next(err, merkle);
                            });
                          },
                          function (merkle, next) {
                            st.membersLeavingRoot = merkle.root();
                            st.membersLeavingCount = membersLeaving.length;
                            next();
                          }
                        ], cb);
                      },
                      votersJoining:  function(cb) {
                        async.waterfall([
                          async.apply(Merkle.votersIn.bind(Merkle), basis, algo),
                          function (merkle, next) {
                            merkle.initialize(votersJoining);
                            merkle.save(function(err){
                              next(err, merkle);
                            });
                          },
                          function (merkle, next) {
                            st.votersJoiningRoot = merkle.root();
                            st.votersJoiningCount = votersJoining.length;
                            next();
                          }
                        ], cb);
                      },
                      votersLeaving:  function(cb) {
                        async.waterfall([
                          async.apply(Merkle.votersOut.bind(Merkle), basis, algo),
                          function (merkle, next) {
                            merkle.initialize(votersLeaving);
                            merkle.save(function(err){
                              next(err, merkle);
                            });
                          },
                          function (merkle, next) {
                            st.votersLeavingRoot = merkle.root();
                            st.votersLeavingCount = votersLeaving.length;
                            next();
                          }
                        ], cb);
                      },
                    }, function (err) {
                      next(err);
                    });
                  },
                  function (next) {
                    signsDetached(st.getRaw(), next);
                  },
                  function (signature, next){
                    st.signature = signature;
                    st.selfGenerated = true;
                    next(null, st);
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

  this.createSelfVoting = function (promoted, done) {
    var vt = new Voting({
      version: 1,
      currency: currency,
      type: "VOTING",
      issuer: PeeringService.cert.fingerprint,
      date: new Date(promoted.generated*1000),
      amNumber: promoted.number,
      amHash: promoted.hash
    });
    async.waterfall([
      function (next){
        signsDetached(vt.getRaw(), next);
      },
      function (signature, next){
        vt.signature = signature;
        PublicKey.getTheOne(PeeringService.cert.fingerprint, next);
      },
      function (pubkey, next) {
        next(null, vt, pubkey);
      },
    ], done);
  }

  this.getLastVoterOn = function (fpr, done) {
    // Get last presence timestamp as a voter
    async.waterfall([
      function (next){
        Key.getLastVotingAmNumber(fpr, next);
      },
      function (amNumber, next){
        if (amNumber == null) {
          next('Key has never been a voter', null);
          return;
        } else {
          Amendment.findPromotedByNumber(amNumber, next);
        }
      },
      function (am, next){
        next(null, am.generated);
      },
    ], function (err, voterOn) {
      done(null, voterOn);
    });
  }

  function dependingInterval (entry, isTooLate, isTooEarly, isGood) {
    Amendment.current(function (err, am) {
      var currentGenerated = am ? am.generated : conf.sync.AMStart;
      var entryTimestamp = parseInt(entry.date.getTime()/1000, 10);
      if (currentGenerated > entryTimestamp) {
        isTooLate(entryTimestamp, currentGenerated);
      } else if(entryTimestamp >= currentGenerated + conf.sync.AMFreq) {
        isTooEarly(entryTimestamp, currentGenerated + conf.sync.AMFreq);
      } else {
        isGood(am);
      }
    });
  }

  function getOrCreateAmendment (amNumber, algo, done) {
    Amendment.getTheOneToBeVoted(amNumber, algo, function (err, am) {
      if (am) done(null, am);
      else createAmendment(amNumber - 1, algo, function (err, amCreated) {
        done(err, amCreated);
      });
    });
  }

  /**
  * Create next amendment following the one with `basis` amendment number, taking in account memberships,
  * votings and pubkeys locally received.
  **/
  function createAmendment (basis, algo, done) {
    var amNext = new Amendment();
    async.waterfall([
      function (next){
        Amendment.findPromotedByNumber(basis, function (err, am) {
          next(null, am);
        });
      },
      function (am, next){
        amNext.selfGenerated = true;
        amNext.algo = algo;
        amNext.version = 1;
        amNext.currency = currency;
        amNext.coinAlgo = "Base2Draft";
        amNext.membersChanges = [];
        amNext.votersChanges = [];
        // amNext.nextVotes = Math.ceil(((am && am.votersCount) || 0) * conf.sync.Consensus);
        if (am) {
          amNext.number = am.number + 1;
          amNext.monetaryMass = am.monetaryMass;
          amNext.generated = am.generated + conf.sync.AMFreq;
          amNext.previousHash = am.hash;
        } else {
          amNext.number = 0;
          amNext.monetaryMass = 0;
          amNext.generated = conf.sync.AMStart;
        }
        amNext.save(function (err) {
          next(err);
        });
      },
    ], function (err) {
      done(err, amNext);
    });
  }

  function computeLocalMSandVTChanges (basis, algo, done) {
    if (['1Sig', 'AnyKey'].indexOf(algo) == -1)
      done('Algorithm \'' + algo + '\' not managed');
    var isMember = function (fpr, done) {
      if (basis == -1)
        done(null, true);
      else
        Key.wasMember(fpr, basis, done);
    };
    var getPubkey = PublicKey.getTheOne.bind(PublicKey);
    var algoFunc = algo == "1Sig" ? require('../lib/algos/community/1Sig')(isMember, getPubkey) : require('../lib/algos/community/AnyKey');
    var members = [];
    var voters = [];
    var membersJoining = [];
    var membersLeaving = [];
    var votersJoining = [];
    var votersLeaving = [];
    async.waterfall([
      function (next){
        async.parallel({
          members:     async.apply(Key.getMembersOn.bind(Key), basis),
          voters:      async.apply(Key.getVotersOn.bind(Key), basis),
          memberships: async.apply(Membership.getEligibleForAmendment.bind(Membership), basis),
          votings:     async.apply(Voting.getEligibleForAmendment.bind(Voting), basis),
        }, next);
      },
      function (result, next){
        result.members.forEach(function(k) { members.push(k.fingerprint); });
        result.voters.forEach(function(k) { voters.push(k.fingerprint); });
        var changingKeys = members.slice().concat(voters);
        result.memberships.forEach(function(ms){ changingKeys.push(ms.issuer); });
        result.votings.forEach(function(ms){ changingKeys.push(ms.issuer); });
        // Duplicate free array
        changingKeys = _(changingKeys).uniq();
        async.forEach(changingKeys, function (fpr, cb) {
          async.waterfall([
            function (next){
              memberContext(fpr, basis, next);
            },
            function (context, next){
              if (~members.indexOf(fpr))
                context.currentMembership = { membership: 'IN' };
              else
                context.currentMembership = null;
              algoFunc(context.pubkey, context, { generated: conf.sync.AMStart + basis*conf.sync.AMFreq }, next);
            },
            function (indicators, next){
              var isMember = ~members.indexOf(fpr);
              if (indicators.membership == 1)  membersJoining.push(fpr);
              if (indicators.membership == -1) membersLeaving.push(fpr);
              if (isMember && indicators.key == 1)  votersJoining.push(fpr);
              if (isMember && indicators.key == -1) votersLeaving.push(fpr);
              next();
            },
          ], cb);
        }, next);
      },
      function (next){
        members.sort();
        voters.sort();
        membersJoining.sort();
        membersLeaving.sort();
        votersJoining.sort();
        votersLeaving.sort();
        next(null, membersJoining, membersLeaving, votersJoining, votersLeaving, members, voters);
      },
    ], done);
  }

  /**
  * Retrieve member's membership & voting context for next promoted amendment.
  */
  function memberContext (member, amNumber, done) {
    async.parallel({
      voterOn: function (callback){
        that.getLastVoterOn(member, callback);
      },
      nextMembership: function (callback){
        // Get lastly emitted & valid (not confirmed) membership FOR amNumber
        Membership.getForAmendmentAndIssuer(amNumber, member, function (err, records) {
          var res = (err || !records || records.length == 0) ? null : records[0];
          callback(null, res);
        });
      },
      nextVoting: function (callback){
        // Get lastly emitted & valid (not confirmed) votings FOR amNumber
        Voting.getForAmendmentAndIssuer(amNumber, member, function (err, votings) {
          var res = (err || !votings || votings.length == 0) ? null : votings[0];
          callback(null, res);
        });
      },
      pubkey: function (callback){
        // Get lastly emitted & valid (not confirmed) votings FOR amNumber
        PublicKey.getTheOne(member, callback);
      }
    }, function (err, ctx) {
      // Add amendment number
      ctx.amNumber = amNumber;
      done(err, ctx);
    });
  }

  function updateUniversalDividend (amNext, done) {
    // Time for Universal Dividend (and we have members)
    var delayPassedSinceRootAM = (amNext.generated - conf.sync.AMStart);
    if (delayPassedSinceRootAM > 0 && delayPassedSinceRootAM % conf.sync.UDFreq == 0 && amNext.membersCount > 0) {
      async.waterfall([
        function (next) {
          Amendment.getPreviouslyPromotedWithDividend(next);
        },
        function (previousWithUD, next){
          var prevM = (previousWithUD && previousWithUD.monetaryMass) || 0;
          var prevUD = (previousWithUD && previousWithUD.dividend) || conf.sync.UD0;
          var prevN = (previousWithUD && previousWithUD.membersCount) || 0;
          amNext.monetaryMass = prevM + prevUD*prevN;
          var c = conf.sync.UDPercent;
          var UD = Math.ceil(c*amNext.monetaryMass/amNext.membersCount);
          amNext.dividend = Math.max(prevUD, UD); // Integer
          var coinage = coiner(amNext.dividend, 0, 0);
          amNext.coinBase = coinage.coinBase;
          amNext.coinList = coinage.coinList;
          next();
        },
      ], done);
    }
    else done(null);
  }
};
/**************** Utils ***********************/

function toDateString (timestamp) {
  var intTimpestamp = parseInt(timestamp);
  var d = new Date();
  d.setTime(timestamp*1000);
  return moment(d).format("GGGG-MM-DD hh:mm:ss");
}
