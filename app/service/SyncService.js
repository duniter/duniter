var jpgp          = require('../lib/jpgp');
var async         = require('async');
var moment        = require('moment');
var request       = require('request');
var vucoin        = require('vucoin');
var _             = require('underscore');
var openpgp       = require('openpgp');
var Status        = require('../models/statusMessage');
var coiner        = require('../lib/coiner');
var log4js        = require('log4js');
var logger        = require('../lib/logger')('sync');
var mlogger       = require('../lib/logger')('membership');
var vlogger       = require('../lib/logger')('voting');
var mathlog       = require('../lib/logger')('registryp');
var cflowlog      = require('../lib/logger')('cflow');

mathlog.setLevel('INFO');

// Constants
var WITH_VOTING    = true;
var WITHOUT_VOTING = false;

module.exports.get = function (conn, conf, signsDetached, ContractService, PeeringService, alertDeamon, daemonJudgesTimeForVote) {
  return new SyncService(conn, conf, signsDetached, ContractService, PeeringService, alertDeamon, daemonJudgesTimeForVote);
};

function SyncService (conn, conf, signsDetached, ContractService, PeeringService, alertDeamon, daemonJudgesTimeForVote) {

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

  // Function to override according to chosen algorithm for pubkey validity
  var isValidPubkey = conf.isValidPubkey || function (pubkey, am) {
    return true;
  }
  
  var fifoCreateNextAM = async.queue(function (task, callback) {
    task(callback);
  }, 1);
  
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

  this.createNext = function (am, done) {
    fifoCreateNextAM.push(function (cb) {
      logger.info('Creating next AM (#%d) proposal...', (am && am.number + 1 || 0));
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
          amNext.coinAlgo = "Base2Draft";
          amNext.algo = conf.sync.Algorithm;
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
          alertDeamon((amNext.generated - now)*1000);
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
                  Key.wasVoter(member.fingerprint, amNext.number - 1, callback);
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
              memberContext(entry.issuer, entry.amNumber, next);
            },
            function (ctx, next){
              newContext = ctx;
              Amendment.getTheOneToBeVoted(entry.amNumber + 1, conf.sync.Algorithm, next);
            },
            function (amendmentNext, next){
              amNext = amendmentNext;
              computeSingleMemberChanges(entry.issuer, newContext, amNext, WITH_VOTING, next);
            },
            function (next){
              mlogger.debug('✔ %s %s', entry.issuer, entry.membership);
              PeeringService.propagateMembership(entry);
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
                  Amendment.isProposedMember(entry.issuer, entry.amNumber + 1, next);
                }
              );
            },
            function (isMember, next){
              if (!isMember) {
                next('Only members may be voters');
                return;
              }
              next();
            },
            function (next){
              Amendment.getTheOneToBeVoted(entry.amNumber + 1, conf.sync.Algorithm, next);
            },
            function (amNext, next){
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
        Amendment.getTheOneToBeVoted(amNumber, conf.sync.Algorithm, next);
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
          // // Tries to vote
          // var now = new Date();
          // async.waterfall([
          //   function (next){
          //     Amendment.getTheOneToBeVoted(amNumber, conf.sync.Algorithm, next);
          //   },
          //   function (amNext, next){
          //     if (daemonJudgesTimeForVote(amNext)) {

          //       var amReal = amNext;
          //       var raw = "";
          //       async.waterfall([
          //         function (next){
          //           // Prepare AM
          //           if (algo != amNext.algo) {
          //             amReal = new Amendment();
          //             amNext.copyTo(amReal);
          //             console.log(amReal);
          //             raw = amReal.getRaw();
          //             async.waterfall([
          //               function (next){
          //                 async.parallel({
          //                   membersJoining: async.apply(lookForCKeys, '+', algo, true),
          //                   membersLeaving: async.apply(lookForCKeys, '-', algo, true),
          //                   votersJoining:  async.apply(lookForCKeys, '+', algo, false),
          //                   votersLeaving:  async.apply(lookForCKeys, '-', algo, false),
          //                   members:        async.apply(Key.getMembers.bind(Key)),
          //                   voters:         async.apply(Key.getVoters.bind(Key)),
          //                 }, next);
          //               },
          //               function (res, next){
          //                 // Update Merkle of proposed members
          //                 var members = [];
          //                 var voters = [];
          //                 res.members.forEach(function(m){
          //                   members.push(m.fingerprint);
          //                 });
          //                 res.voters.forEach(function(m){
          //                   voters.push(m.fingerprint);
          //                 });
          //                 amReal.membersChanges = [];
          //                 amReal.votersChanges = [];
          //                 res.membersJoining.forEach(function(fpr){
          //                   amReal.membersChanges.push('+' + fpr);
          //                   members.push(fpr);
          //                 });
          //                 res.membersLeaving.forEach(function(fpr){
          //                   amReal.membersChanges.push('-' + fpr);
          //                   var index = members.indexOf(fpr);
          //                   if (~index) {
          //                     members.splice(index, 1);
          //                   }
          //                 });
          //                 res.votersJoining.forEach(function(fpr){
          //                   amReal.votersChanges.push('+' + fpr);
          //                   voters.push(fpr);
          //                 });
          //                 res.votersLeaving.forEach(function(fpr){
          //                   amReal.votersChanges.push('-' + fpr);
          //                   var index = voters.indexOf(fpr);
          //                   if (~index) {
          //                     voters.splice(index, 1);
          //                   }
          //                 });
          //                 var merkleMembers = new Merkle();
          //                 var merkleVoters = new Merkle();
          //                 members.sort();
          //                 voters.sort();
          //                 merkleMembers.initialize(members);
          //                 merkleVoters.initialize(voters);
          //                 amReal.membersChanges.sort();
          //                 amReal.membersCount = members.length;
          //                 amReal.membersRoot = merkleMembers.root();
          //                 amReal.votersChanges.sort();
          //                 amReal.votersCount = voters.length;
          //                 amReal.votersRoot = merkleVoters.root();
          //                 amReal.save(function (err2) {
          //                   raw = amReal.getRaw();
          //                   next(err || err2);
          //                 });
          //               }
          //             ], next);
          //           } else {
          //             raw = amReal.getRaw();
          //             next();
          //           }
          //         },
          //         function (next){
          //           signsDetached(raw, next);
          //         },
          //         function (signature, next){
          //           var signedAm = raw + signature;
          //           vucoin(conf.ipv6 || conf.ipv4 || conf.dns, conf.port, false, false, function (err, node) {
          //             next(null, signedAm, node);
          //           });
          //         },
          //         function (vote, node, next){
          //           node.hdc.amendments.votes.post(vote, next);
          //         },
          //         function (json, next){
          //           var am = new Amendment(json.amendment);
          //           var issuer = PeeringService.cert.fingerprint;
          //           var hash = json.signature.unix2dos().hash();
          //           var basis = json.amendment.number;
          //           Vote.getByIssuerHashAndBasis(issuer, hash, basis, next);
          //         },
          //         function (vote, next){
          //           if (!vote) {
          //             next('Self vote was not found');
          //             return;
          //           }
          //           vote.selfGenerated = true;
          //           vote.save(function  (err) {
          //             next(err, vote);
          //           });
          //         },
          //       ], next);
          //       return;
          //     }
          //     next('Not yet');
          //   },
          // ], next);
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
              Amendment.getTheOneToBeVoted(amNumber, conf.sync.Algorithm, next);
            },
            function (amNext, next){
              if (daemonJudgesTimeForVote(amNext)) {

                var cert = PeeringService.cert;
                var cf = new CommunityFlow();
                cf.version = "1";
                cf.currency = currency;
                cf.algorithm = algo;
                cf.date = new Date();
                cf.issuer = cert.fingerprint;
                cf.amendmentNumber = amNext.number - 1;
                cf.amendmentHash = amNext.previousHash;
                var raw = "";
                async.waterfall([
                  function (next) {
                    async.parallel({
                      merkleMembersJoining: async.apply(Merkle.membersIn.bind(Merkle),  amNext.number, algo),
                      merkleMembersLeaving: async.apply(Merkle.membersOut.bind(Merkle), amNext.number, algo),
                      merkleVotersJoining:  async.apply(Merkle.votersIn.bind(Merkle),   amNext.number, algo),
                      merkleVotersLeaving:  async.apply(Merkle.votersOut.bind(Merkle),  amNext.number, algo),
                    }, next);
                  },
                  function (merkles, next){
                    cf.membersJoiningCount = merkles.merkleMembersJoining.count();
                    cf.membersLeavingCount = merkles.merkleMembersLeaving.count();
                    cf.votersJoiningCount =  merkles.merkleVotersJoining.count();
                    cf.votersLeavingCount =  merkles.merkleVotersLeaving.count();
                    cf.membersJoiningRoot = merkles.merkleMembersJoining.root();
                    cf.membersLeavingRoot = merkles.merkleMembersLeaving.root();
                    cf.votersJoiningRoot =  merkles.merkleVotersJoining.root();
                    cf.votersLeavingRoot =  merkles.merkleVotersLeaving.root();
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

  function getMSExclusionDate (amNext) {
    var nextTimestamp = amNext.generated;
    var exclusionDate = new Date();
    exclusionDate.setTime(nextTimestamp*1000 - conf.sync.MSExpires*1000);
    return exclusionDate;
  }

  function getVTExclusionDate (amNext) {
    var nextTimestamp = amNext.generated;
    var exclusionDate = new Date();
    exclusionDate.setTime(nextTimestamp*1000 - conf.sync.VTExpires*1000);
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
        voterContext2AnalyticalParameters(ctx, amNext, msIndicator == -1, next);
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
    var isMember = ctx.currentMembership && ctx.currentMembership.membership == 'IN';
    var ms = [
      isMember ? 1 : 0,
      !isMember ? 1 : 0,
    ];
    var hasInvalidKey = !isValidPubkey(ctx.pubkey, amNext);
    var hasNextIn = ctx.nextMemberships.length > 0 && ctx.nextMemberships[0].membership == 'IN';
    var hasNextOut = ctx.nextMemberships.length > 0 && ctx.nextMemberships[0].membership == 'OUT';
    var p = [
      hasInvalidKey ? 1 : 0,
      hasNextIn ? 1 : 0,
      hasNextOut ? 1 : 0,
    ];
    mathlog.debug('ms = ', ms);
    mathlog.debug('p = ', p);
    done(null, ms, p);
  }

  /**
  * Converts voter context vars to analytical expression parameters (for Computing functions' namespace)
  */
  function voterContext2AnalyticalParameters (context, amNext, memberLeaving, done) {
    var ctx = context || { currentVoting: null, nextVoting: null };
    var isVoter = ctx.currentVoting;
    var isTooOldVT = (isVoter && ctx.currentVoting.date < getVTExclusionDate(amNext));
    var vt = [
      isVoter ? 0 : 1,
      isVoter ? 1 : 0,
      isTooOldVT ? 1 : 0
    ];
    var hasNextVoting = ctx.nextVotings.length > 0;
    var p = [
      1,
      hasNextVoting ? 1 : 0,
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
      currentVoting: function (callback){
        // Get lastly emitted & confirmed voting BEFORE amNumber
        Voting.getCurrentForIssuerAndAmendment(member, amNumber, function (err, obj) {
          callback(null, err ? null : obj);
        });
      },
      nextMemberships: function (callback){
        // Get lastly emitted & valid (not confirmed) memberships FOR amNumber
        Membership.getForAmendmentAndIssuer(amNumber, member, function (err, records) {
          callback(null, err ? [] : records);
        });
      },
      nextVotings: function (callback){
        // Get lastly emitted & valid (not confirmed) votings FOR amNumber
        Voting.getForAmendmentAndIssuer(amNumber, member, function (err, votings) {
          callback(null, err ? null : votings);
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

  function updateMembersFromIndicator (member, statusTo, amNext, done) {
    var whatToDo = {
      changes:   { "0": {}, "1" :{}, "-1": {}},
      merkle:    { "0": {}, "1" :{}, "-1": {}},
      state:     { "0": {}, "1" :{}, "-1": {}},
      merkleIn:  { "0": {}, "1" :{}, "-1": {}},
      merkleOut: { "0": {}, "1" :{}, "-1": {}}
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
    whatToDo.state["0"]["1"] = Key.setLastMSState.bind(Key);
    whatToDo.state["1"]["0"] = Key.setLastMSState.bind(Key);
    whatToDo.state["0"]["-1"] = Key.setLastMSState.bind(Key);
    whatToDo.state["-1"]["0"] = Key.setLastMSState.bind(Key);

    whatToDo.merkleIn["0"]["1"] = async.apply(addInMerkle, async.apply(Merkle.membersIn.bind(Merkle), amNext.number, conf.sync.Algorithm));
    whatToDo.merkleIn["1"]["0"] = async.apply(removeFromMerkle, async.apply(Merkle.membersIn.bind(Merkle), amNext.number, conf.sync.Algorithm));
    whatToDo.merkleIn["0"]["-1"] = doNothingWithMerkleInOut;
    whatToDo.merkleIn["-1"]["0"] = doNothingWithMerkleInOut;

    whatToDo.merkleOut["0"]["1"] = doNothingWithMerkleInOut;
    whatToDo.merkleOut["1"]["0"] = doNothingWithMerkleInOut;
    whatToDo.merkleOut["0"]["-1"] = async.apply(addInMerkle, async.apply(Merkle.membersOut.bind(Merkle), amNext.number, conf.sync.Algorithm));
    whatToDo.merkleOut["-1"]["0"] = async.apply(removeFromMerkle, async.apply(Merkle.membersOut.bind(Merkle), amNext.number, conf.sync.Algorithm));

    function doNothing (k, changes, done) {
      done();
    }

    function doNothingWithState (k, state, done) {
      done();
    }

    function doNothingWithMerkle (k, merkle, done) {
      done(null, merkle);
    }

    function doNothingWithMerkleInOut (m, done) {
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
                var f = whatToDo.merkle[statusFrom.toString()][statusTo.toString()] || doNothingWithMerkle;
                f(member, merkle, next);
              },
              function (merkle, next){
                merkle.save(function (err) {
                  next(err, { leaves: merkle.leaves() || [], root: merkle.root() });
                });
              },
            ], callback);
          },
          updateMembersIn: function(callback){
            var f = whatToDo.merkleIn[statusFrom.toString()][statusTo.toString()] || doNothingWithMerkleInOut;
            f(member, callback);
          },
          updateMembersOut: function(callback){
            var f = whatToDo.merkleOut[statusFrom.toString()][statusTo.toString()] || doNothingWithMerkleInOut;
            f(member, callback);
          },
          saveAmendmentChanges: ['updateMembersChanges', 'updateMembersMerkle', 'updateMembersIn', 'updateMembersOut', function (callback, res) {
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
      changes:   { "0": {}, "1" :{}, "-1": {}},
      merkle:    { "0": {}, "1" :{}, "-1": {}},
      state:     { "0": {}, "1" :{}, "-1": {}},
      merkleIn:  { "0": {}, "1" :{}, "-1": {}},
      merkleOut: { "0": {}, "1" :{}, "-1": {}}
    };
    // whatToDo.changes["0"]["1"] = keyAdd;
    // whatToDo.changes["1"]["0"] = keyUndoAdd;
    // whatToDo.changes["0"]["-1"] = keyRemove;
    // whatToDo.changes["-1"]["0"] = keyUndoRemove;
    whatToDo.changes["0"]["1"] = function (k, changes, done) {
      mathlog.info('VT +%s', k);
      keyAdd(k, changes, done);
    };
    whatToDo.changes["1"]["0"] = function (k, changes, done) {
      mathlog.info('VT CANCEL -%s', k);
      keyUndoAdd(k, changes, done);
    };
    whatToDo.changes["0"]["-1"] = function (k, changes, done) {
      mathlog.info('VT -%s', k);
      keyRemove(k, changes, done);
    };
    whatToDo.changes["-1"]["0"] = function (k, changes, done) {
      mathlog.info('VT CANCEL -%s', k);
      keyUndoRemove(k, changes, done);
    };
    whatToDo.merkle["0"]["1"] = addInVoterMerkle;
    whatToDo.merkle["1"]["0"] = removeFromVoterMerkle;
    whatToDo.merkle["0"]["-1"] = removeFromVoterMerkle;
    whatToDo.merkle["-1"]["0"] = addInVoterMerkle;
    whatToDo.state["0"]["1"] = Key.setLastState.bind(Key);
    whatToDo.state["1"]["0"] = Key.setLastState.bind(Key);
    whatToDo.state["0"]["-1"] = Key.setLastState.bind(Key);
    whatToDo.state["-1"]["0"] = Key.setLastState.bind(Key);

    whatToDo.merkleIn["0"]["1"] = async.apply(addInMerkle, async.apply(Merkle.votersIn.bind(Merkle), amNext.number, conf.sync.Algorithm));
    whatToDo.merkleIn["1"]["0"] = async.apply(removeFromMerkle, async.apply(Merkle.votersIn.bind(Merkle), amNext.number, conf.sync.Algorithm));
    whatToDo.merkleIn["0"]["-1"] = doNothingWithMerkleInOut;
    whatToDo.merkleIn["-1"]["0"] = doNothingWithMerkleInOut;

    whatToDo.merkleOut["0"]["1"] = doNothingWithMerkleInOut;
    whatToDo.merkleOut["1"]["0"] = doNothingWithMerkleInOut;
    whatToDo.merkleOut["0"]["-1"] = async.apply(addInMerkle, async.apply(Merkle.votersOut.bind(Merkle), amNext.number, conf.sync.Algorithm));
    whatToDo.merkleOut["-1"]["0"] = async.apply(removeFromMerkle, async.apply(Merkle.votersOut.bind(Merkle), amNext.number, conf.sync.Algorithm));

    function doNothingWithKey (k, changes, done) {
      done();
    }

    function doNothingWithMerkle (k, merkle, done) {
      done(null, merkle);
    }

    function doNothingWithState (k, state, done) {
      done();
    }

    function doNothingWithMerkleInOut (m, done) {
      done();
    }

    async.waterfall([
      function (next){
        async.parallel({
          state: async.apply(Key.getLastState.bind(Key), key)
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
            var votersInFunc = async.apply(whatToDo.merkleIn[lastKeyState.toString()][statusTo.toString()] || doNothingWithMerkleInOut, key);
            var votersOutFunc = async.apply(whatToDo.merkleOut[lastKeyState.toString()][statusTo.toString()] || doNothingWithMerkleInOut, key);
            if ((lastKeyState == 0 && statusTo == 1) || (lastKeyState == -1 && statusTo == 0)) {
              // Make positive change
              actionForVoters(merkleFunc, keysFunc, stateFunc, votersInFunc, votersOutFunc, amNext, next);
            } else if ((lastKeyState == 1 && statusTo == 0) || (lastKeyState == 0 && statusTo == -1)) {
              // Make negative change
              actionForVoters(merkleFunc, keysFunc, stateFunc, votersInFunc, votersOutFunc, amNext, next);
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

  function actionForVoters (merkleFunc, votersFunc, stateFunc, votersInFunc, votersOutFunc, amNext, done) {
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
      updateVotersIn: function(callback){
        votersInFunc(callback);
      },
      updateVotersOut: function(callback){
        votersOutFunc(callback);
      },
      saveAmendmentChanges: ['updateVotersChanges', 'updateVotersMerkle', 'updateVotersIn', 'updateVotersOut', function (callback, res) {
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

  function addInMerkle (merkleGet, key, done) {
    async.waterfall([
      function (next) {
        merkleGet(next);
      },
      function (merkle, next) {
        merkle.push(key);
        merkle.save(function (err) {
          next(err);
        });
      }
    ], done);
  }

  function removeFromMerkle (merkleGet, key, done) {
    async.waterfall([
      function (next) {
        merkleGet(next);
      },
      function (merkle, next) {
        merkle.remove(key);
        merkle.save(function (err) {
          next(err);
        });
      }
    ], done);
  }
};

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
  * @param m 1 if initial state is no membership, 0 otherwise
  * @param p array of changes
  */
  function IsMember (p) {
    return - p[0] - p[2];
  }

  /**
  * Computes changes for a key given changes with and initial state
  * @param m 1 if initial state is no membership, 0 otherwise
  * @param p array of changes
  */
  function IsNotMember (p) {
    return - p[0] + p[1];
  }

  // console.log('params = ', ms, p);
  // console.log('partial res = ', MSNone(p), IsMember(p), IsNotMember(p));
  // console.log('real = %s', ms[0]*MSNone(p) + ms[1]*IsMember(p) + ms[2]*IsNotMember(p));
  // console.log('-----');
  done(null, ms[0]*IsMember(p) + ms[1]*IsNotMember(p));
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

  mathlog.debug(vt[0]*IsNotVoter(p), vt[1]*IsVoter(p), vt[2]*IsVoterTooOld(p));
  mathlog.debug(vt[0]*IsNotVoter(p) + vt[1]*IsVoter(p) + vt[2]*IsVoterTooOld(p));
  done(null, vt[0]*IsNotVoter(p) + vt[1]*IsVoter(p) + vt[2]*IsVoterTooOld(p));
}

function IsNotVoter (p) {
  return p[1] - p[2];
}

function IsVoter (p) {
  return - p[2];
}

function IsVoterTooOld (p) {
  return - p[0] + p[1] - p[2];
}

/**************** Utils ***********************/

function toDateString (timestamp) {
  var intTimpestamp = parseInt(timestamp);
  var d = new Date();
  d.setTime(timestamp*1000);
  return moment(d).format("GGGG-MM-DD hh:mm:ss");
}
