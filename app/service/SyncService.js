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
var cflowlog = require('../lib/logger')('cflow');

mathlog.setLevel('INFO');

// Constants
var WITH_VOTING    = true;
var WITHOUT_VOTING = false;

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
  var CommunityFlow = conn.model('CommunityFlow');
  var Peer          = conn.model('Peer');
  var Key           = conn.model('Key');
  var Forward       = conn.model('Forward');
  
  var fifoMembershipOrVoting = async.queue(function (task, callback) {
    task(callback);
  }, 1);
  
  var fifoCF = async.queue(function (task, callback) {
    task(callback);
  }, 1);
  
  var fifoSelfVote = async.queue(function (task, callback) {
    task(callback);
  }, 1);
  
  var fifoSelfCommunityFlow = async.queue(function (task, callback) {
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
              dependingInterval(entry,
                function isTooLate (entryTS, minimalTS) {
                  next('Too late for this membership (' + toDateString(entryTS) + '): your membership must be at least ' + toDateString(minimalTS) + ', time of current amendment. Retry.');
                },
                function isTooEarly (entryTS, nextTS) {
                  next('Too early for this membership (' + toDateString(entryTS) + '): your membership must be max ' + toDateString(nextTS - 1) + ' (next AM date)');
                },
                function isGood (am) {
                  entry.amNumber = am && am.number >= 0 ? am.number : -1;
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
              vlogger.debug('⬇ %s\'s voting', "0x" + entry.issuer.substr(32));
              dependingInterval(entry,
                function isTooLate () {
                  next('Too late for this voting: amendment already voted. Retry.');
                },
                function isTooEarly () {
                  next('Too early for this voting: retry when next amendment is voted.');
                },
                function isGood (am) {
                  entry.amNumber = am && am.number >= 0 ? am.number : -1;
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

  this.submitCF = function (obj, done) {
    var entry = new CommunityFlow(obj);
    fifoCF.push(function (cb) {
      async.waterfall([
        function (next) {
          cflowlog.debug('⬇ CF from %s', entry.issuer);
          if (['AnyKey', '1Sig'].indexOf(entry.algorithm) == -1) {
            next('Algorithm must be either AnyKey or 1Sig');
            return;
          }
          // OK
          if (entry.selfGenerated) {
            // Check Merkles & create ckeys
            async.parallel({
              membersJoining: async.apply(createCKeysFromLocalMerkle, async.apply(Merkle.membersIn.bind(Merkle),  entry.amendmentNumber + 1, entry.algorithm), '+', 'AnyKey', true),
              membersLeaving: async.apply(createCKeysFromLocalMerkle, async.apply(Merkle.membersOut.bind(Merkle), entry.amendmentNumber + 1, entry.algorithm), '-', 'AnyKey', true),
              votersJoining:  async.apply(createCKeysFromLocalMerkle, async.apply(Merkle.votersIn.bind(Merkle),   entry.amendmentNumber + 1, entry.algorithm), '+', 'AnyKey', false),
              votersLeaving:  async.apply(createCKeysFromLocalMerkle, async.apply(Merkle.votersOut.bind(Merkle),  entry.amendmentNumber + 1, entry.algorithm), '-', 'AnyKey', false),
            }, next);
          } else {
            // Increment count of witnesses
            async.parallel({
              membersJoining: async.apply(updateCKeysFromRemoteMerkle, entry.issuer, entry.amendmentNumber + 1, 'node.registry.amendment.membersIn',  '+', 'AnyKey', true),
              membersLeaving: async.apply(updateCKeysFromRemoteMerkle, entry.issuer, entry.amendmentNumber + 1, 'node.registry.amendment.membersOut', '-', 'AnyKey', true),
              votersJoining:  async.apply(updateCKeysFromRemoteMerkle, entry.issuer, entry.amendmentNumber + 1, 'node.registry.amendment.votersIn',   '+', 'AnyKey', false),
              votersLeaving:  async.apply(updateCKeysFromRemoteMerkle, entry.issuer, entry.amendmentNumber + 1, 'node.registry.amendment.votersOut',  '-', 'AnyKey', false),
            }, next);
          }
        },
        function (res, next){
          entry.save(function (err) {
            next(err);
          });
        },
        function (next){
          cflowlog.debug('✔ CF from %s', entry.issuer);
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
        CommunityFlow.getForAmendmentAndAlgo(amNumber -1, algo, next);
      },
      function (cfs, next){
        logger.debug("%s flows / %s voters = %s%", cfs.length, amCurrent.votersCount, cfs.length/amCurrent.votersCount*100)
        if (cfs.length/amCurrent.votersCount < 0.6) {
          next('Not voting yet, waiting for >= 60% voters');
          return;
        } else {
          next();
        }
      },
      function (next){
        getOrCreateAmendment(amNumber, conf.sync.Algorithm, next);
      },
      function (amNext, next){
        if (daemonJudgesTimeForVote(amNext)) {

          var amReal = amNext;
          var raw = "";
          async.waterfall([
            function (next){
              // Prepare AM
              if (algo != amNext.algo) {
                amReal = new Amendment();
                amNext.copyTo(amReal);
                raw = amReal.getRaw();
                async.waterfall([
                  function (next){
                    async.parallel({
                      membersJoining: async.apply(lookForCKeys, '+', algo, true),
                      membersLeaving: async.apply(lookForCKeys, '-', algo, true),
                      votersJoining:  async.apply(lookForCKeys, '+', algo, false),
                      votersLeaving:  async.apply(lookForCKeys, '-', algo, false),
                      members:        async.apply(Key.getMembers.bind(Key)),
                      voters:         async.apply(Key.getVoters.bind(Key)),
                    }, next);
                  },
                  function (res, next){
                    // Update Merkle of proposed members
                    var members = [];
                    var voters = [];
                    res.members.forEach(function(m){
                      members.push(m.fingerprint);
                    });
                    res.voters.forEach(function(m){
                      voters.push(m.fingerprint);
                    });
                    amReal.membersChanges = [];
                    amReal.votersChanges = [];
                    res.membersJoining.forEach(function(fpr){
                      amReal.membersChanges.push('+' + fpr);
                      members.push(fpr);
                    });
                    res.membersLeaving.forEach(function(fpr){
                      amReal.membersChanges.push('-' + fpr);
                      var index = members.indexOf(fpr);
                      if (~index) {
                        members.splice(index, 1);
                      }
                    });
                    res.votersJoining.forEach(function(fpr){
                      amReal.votersChanges.push('+' + fpr);
                      voters.push(fpr);
                    });
                    res.votersLeaving.forEach(function(fpr){
                      amReal.votersChanges.push('-' + fpr);
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
                    amReal.membersChanges.sort();
                    amReal.membersCount = members.length;
                    amReal.membersRoot = merkleMembers.root();
                    amReal.votersChanges.sort();
                    amReal.votersCount = voters.length;
                    amReal.votersRoot = merkleVoters.root();
                    amReal.save(function (err) {
                      raw = amReal.getRaw();
                      next(err);
                    });
                  }
                ], next);
              } else {
                raw = amReal.getRaw();
                next();
              }
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
              var hash = json.signature.unix2dos().hash();
              var basis = json.amendment.number;
              Vote.getByIssuerHashAndBasis(issuer, hash, basis, next);
            },
            function (vote, next){
              if (!vote) {
                next('Strange! self vote was not found ... not recorded?');
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
        async.forEach(json.leaves, function(leaf, callback){
          CKey.increment(leaf, op, algo, isMember, callback);
        }, next);
      },
    ], done);
  }

  function createCKeysFromLocalMerkle (merkleGet, op, algo, isMember, done) {
    async.waterfall([
      function (next){
        merkleGet(next);
      },
      function (merkle, next){
        createCKeys(merkle.leaves(), op, algo, isMember, next);
      },
    ], done);
  }

  function createCKeys (leaves, op, algo, isMember, done) {
    async.forEach(leaves, function(leaf, callback){
      var ck = new CKey();
      ck.fingerprint = leaf;
      ck.operation = op;
      ck.algorithm = algo;
      ck.member = isMember;
      ck.count = 1;
      ck.save(function (err) {
        callback(null, ck);
      });
    }, done);
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

  this.getFlow = function (amNumber, algo, done) {
    if (amNumber == 0) {
      done('Not available for AM#0');
      return;
    }
    fifoSelfCommunityFlow.push(function (cb) {
      async.waterfall([
        function (next){
          CommunityFlow.getSelf(amNumber - 1, algo, function (err, flow) {
            next(null, flow);
          });
        },
        function (cf, next){
          if (cf){
            next(null, cf);
            return;
          }
          // Tries to create CF
          var now = new Date();
          async.waterfall([
            function (next){
              Amendment.findPromotedByNumber(amNumber - 1, next);
            },
            function (amPrevious, next){
              if (daemonJudgesTimeForVote({ generated: amPrevious.generated + conf.sync.AMFreq })) {

                var cert = PeeringService.cert;
                var cf = new CommunityFlow();
                cf.version = "1";
                cf.currency = currency;
                cf.algorithm = algo;
                cf.date = new Date();
                cf.issuer = cert.fingerprint;
                cf.amendmentNumber = amPrevious.number;
                cf.amendmentHash = amPrevious.hash;
                var raw = "";
                async.waterfall([
                  function (next) {
                    computeLocalMSandVTChanges(amNumber, algo, next);
                  },
                  function (membersJoining, membersLeaving, votersJoining, votersLeaving, members, voters, next){
                    var membersJoiningTree = merkle(membersJoining, 'sha1').process();
                    var membersLeavingTree = merkle(membersLeaving, 'sha1').process();
                    var votersJoiningTree = merkle(votersJoining, 'sha1').process();
                    var votersLeavingTree = merkle(votersLeaving, 'sha1').process();
                    cf.membersJoiningCount = membersJoining.length;
                    cf.membersLeavingCount = membersLeaving.length;
                    cf.votersJoiningCount =  votersJoining.length;
                    cf.votersLeavingCount =  votersLeaving.length;
                    cf.membersJoiningRoot = membersJoiningTree.root();
                    cf.membersLeavingRoot = membersLeavingTree.root();
                    cf.votersJoiningRoot =  votersJoiningTree.root();
                    cf.votersLeavingRoot =  votersLeavingTree.root();
                    raw = cf.getRaw();
                    signsDetached(raw, next);
                  },
                  function (signature, next){
                    cf.signature = signature;
                    cf.selfGenerated = true;
                    that.submitCF(cf, next);
                  },
                  function (submitted, next){
                    CommunityFlow.getTheOne(submitted.amendmentNumber, submitted.issuer, algo, next);
                  },
                  function (cf, next){
                    if (!cf) {
                      next('Self CommunityFlow was not found');
                      return;
                    }
                    next(null, cf);
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

  this.getOrCreateAM0 = function (algo, done) {
    getOrCreateAmendment(0, algo, done);
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
        computeLocalMSandVTChanges(basis, algo, next);
      },
      function (membersJoining, membersLeaving, votersJoining, votersLeaving, members, voters, next){
        membersJoining.forEach(function (fpr) {
          members.push(fpr);
        });
        votersJoining.forEach(function (fpr) {
          voters.push(fpr);
        });
        membersLeaving.forEach(function(fpr){
          var index = members.indexOf(fpr);
          if (~index) members.splice(index, 1);
        });
        votersLeaving.forEach(function(fpr){
          var index = voters.indexOf(fpr);
          if (~index) voters.splice(index, 1);
        });
        members.sort();
        voters.sort();
        var treeMembers = merkle(members, 'sha1').process();
        var treeVoters = merkle(voters, 'sha1').process();
        amNext.membersCount = members.length;
        amNext.membersRoot = treeMembers.root();
        membersJoining.forEach(function (fpr) {
          amNext.membersChanges.push('+' + fpr);
        });
        membersLeaving.forEach(function (fpr) {
          amNext.membersChanges.push('-' + fpr);
        });
        amNext.votersCount = voters.length;
        amNext.votersRoot = treeVoters.root();
        votersJoining.forEach(function (fpr) {
          amNext.votersChanges.push('+' + fpr);
        });
        votersLeaving.forEach(function (fpr) {
          amNext.votersChanges.push('-' + fpr);
        });
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
              var isBecoming = indicators.membership == 1;
              if (!isMember && isBecoming)                         membersJoining.push(fpr);
              if (isMember && indicators.membership == -1)         membersLeaving.push(fpr);
              if ((isMember || isBecoming) && indicators.key == 1) votersJoining.push(fpr);
              if (isMember && indicators.key == -1)                votersLeaving.push(fpr);
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
      currentVoting: function (callback){
        // Get lastly emitted & confirmed voting BEFORE amNumber
        Voting.getCurrentForIssuerAndAmendment(member, amNumber, function (err, obj) {
          callback(null, err ? null : obj);
        });
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
