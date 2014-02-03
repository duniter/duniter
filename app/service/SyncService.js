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
var logger     = log4js.getLogger('peering');

module.exports.get = function (pgp, currency, conf) {

  var ParametersService = require('./ParametersService');

  this.createNext = function (am, done) {
    var amNext = new Amendment();
    var membersMerklePrev = [];
    var votersMerklePrev = [];
    async.waterfall([
      function(next){
        amNext.selfGenerated = true;
        if (am) {
          ["version", "currency", "membersRoot", "membersCount", "votersRoot", "votersCount", "monetaryMass"].forEach(function(property){
            amNext[property] = am[property];
          });
          amNext.number = am.number + 1;
          amNext.previousHash = am.hash;
          amNext.generated = am.generated + conf.sync.votingFrequence;
          amNext.membersChanges = [];
          amNext.votersChanges = [];
        } else {
          amNext.version = 1;
          amNext.currency = currency;
          amNext.number = 0;
          amNext.generated = conf.sync.votingStart;
          amNext.membersChanges = [];
          amNext.membersRoot = "";
          amNext.membersCount = 0;
          amNext.votersChanges = [];
          amNext.votersRoot = "";
          amNext.votersCount = 0;
          amNext.monetaryMass = 0;
        }
        // Time for Universal Dividend
        var delayPassedSinceRootAM = (amNext.generated - conf.sync.votingStart);
        if (delayPassedSinceRootAM > 0 && delayPassedSinceRootAM % conf.sync.UDFrequence == 0) {
          var monetaryMassDelta = am.monetaryMass * conf.sync.UDPercent;
          var dividendPerMember = monetaryMassDelta / am.membersCount;
          amNext.dividend = Math.max(conf.sync.UDMin, Math.floor(dividendPerMember));
          amNext.monetaryMass += am.dividend * am.membersCount;
        }
        amNext.nextVotes = Math.ceil(((am && am.votersCount) || 0) * conf.sync.VotesPercent);
        // Computes changes due to too old JOIN/ACTUALIZE
        var exclusionDate = getExclusionDate(amNext);
        Membership.getCurrentJoinOrActuOlderThan(exclusionDate, next);
      },
      function (membershipsToExclude, next){
        var changes = [];
        membershipsToExclude.forEach(function(ms){
          changes.push("-" + ms.issuer);
        });
        changes.sort();
        amNext.membersChanges = changes;
        if (am) {
          Merkle.membersWrittenForAmendment(am.number, am.hash, function (err, merkle) {
            next(err, (merkle && merkle.leaves()) || []);
          });
        } else {
          next(null, []);
        }
      },
      function (leaves, next){
        membersMerklePrev = leaves;
        Merkle.membersWrittenForProposedAmendment(amNext.number, next);
      },
      function (merkle, next){
        var leaves = membersMerklePrev;
        // Remove from Merkle members not actualized
        amNext.membersChanges.forEach(function(change){
          var issuer = change.substring(1);
          var index = leaves.indexOf(issuer);
          if (~index) {
            leaves.splice(index, 1);
          }
        });
        merkle.initialize(leaves);
        amNext.membersRoot = merkle.root();
        amNext.membersCount = leaves.length;
        merkle.save(function (err) {
          next(err);
        });
      },
      function (next){
        if (am) {
          Merkle.votersWrittenForAmendment(am.number, am.hash, function (err, merkle) {
            next(err, (merkle && merkle.leaves()) || []);
          });
        } else {
          next(null, []);
        }
      },
      function (leaves, next){
        votersMerklePrev = leaves;
        Merkle.votersWrittenForProposedAmendment(amNext.number, next);
      },
      function (merkle, next){
        merkle.initialize(votersMerklePrev);
        merkle.save(function (err) {
          next(err);
        });
      },
      function (next){
        // Finally save proposed amendment
        amNext.membersRoot = amNext.membersRoot || "";
        amNext.votersRoot = amNext.votersRoot || "";
        amNext.hash = amNext.getRaw().hash();
        amNext.save(function (err) {
          next(err);
        });
      },
    ], done);
  };

  this.submit = function (signedEntry, done) {
    
    async.waterfall([

      function (callback) {
        if(signedEntry.indexOf('-----BEGIN') == -1){
          callback('Signature not found in given Membership');
          return;
        }
        callback();
      },

      // Check signature's key ID
      function(callback){
        var sig = signedEntry.substring(signedEntry.indexOf('-----BEGIN'));
        var keyID = jpgp().signature(sig).issuer();
        if(!(keyID && keyID.length == 16)){
          callback('Cannot identify signature issuer`s keyID');
          return;
        }
        callback(null, keyID);
      },

      // Looking for corresponding public key
      function(keyID, callback){
        PublicKey.getTheOne(keyID, function (err, pubkey) {
          callback(err, pubkey);
        });
      },

      // Verify signature
      function(pubkey, callback){
        var entry = new Membership();
        var previous;
        var current = null;
        var nowIsIgnored = false;
        var merkleOfNextMembers;
        var amNext;
        async.waterfall([
          function (next){
            entry.parse(signedEntry, next);
          },
          function (entry, next){
            entry.verify(currency, next);
          },
          function (valid, next){
            entry.verifySignature(pubkey.raw, next);
          },
          function (verified, next){
            if(!verified){
              next('Bad signature');
              return;
            }
            if(pubkey.fingerprint != entry.issuer){
              next('Fingerprint in Membership (' + entry.issuer + ') does not match signatory (' + pubkey.fingerprint + ')');
              return;
            }
            next();
          },
          function (next){
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
            // var timestampInSeconds = parseInt(entry.sigDate.getTime()/1000, 10);
            // Amendment.findPromotedPreceding(timestampInSeconds, next);
            Amendment.current(function (err, am) {
              next(null, am);
            });
          },
          function (am, next){
            if (am) {
              var entryTimestamp = parseInt(entry.sigDate.getTime()/1000, 10);
              if (am.generated > entryTimestamp) {
                next('Too late for this membership. Retry.');
                return;
              }
              entry.amNumber = am.number;
            } else {
              entry.amNumber = -1;
            }
            Membership.getCurrent(entry.issuer, next);
          },
          function (currentlyRecorded, next){
            current = currentlyRecorded;
            // Case new is JOIN
            if (entry.membership == 'JOIN') {
              if (current && (current.membership == 'JOIN' || current.membership == 'ACTUALIZE')) {
                next('Already joined');
                return;
              }
            }
            else if (entry.membership == 'ACTUALIZE' || entry.membership == 'LEAVE') {
              if (!current || current.membership == 'LEAVE') {
                next('Not a member currently');
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
            Amendment.getTheOneToBeVoted(entry.amNumber + 1, next);
          },
          function (amendmentNext, next){
            amNext = amendmentNext;
            var isLeaving = amNext.membersChanges.indexOf('-' + entry.issuer);
            var isJoining = amNext.membersChanges.indexOf('+' + entry.issuer);
            // Impacts on changes
            if (!nowIsIgnored) {
              if (~isLeaving && entry.membership == 'JOIN') {
                // Key was leaving lacking from actualization
                next('Cannot join: already a member, currently leaving lacking of actualization');
                return;
              }
              if (~isLeaving && entry.membership == 'ACTUALIZE') {
                // Key was leaving lacking from actualization
                next(null, { keyToUnleave: entry.issuer });
                return;
              }
              if (~isLeaving && entry.membership == 'LEAVE') {
                // Key was leaving lacking from actualization
                next(null, { });
                return;
              }
              if (entry.membership == 'JOIN') {
                next(null, { keyToAdd: entry.issuer });
                return;
              }
              if (entry.membership == 'ACTUALIZE') {
                // Should do nothing
                next(null, { keyToUnleave: entry.issuer });
                return;
              }
              if (entry.membership == 'LEAVE') {
                next(null, { keyToRemove: entry.issuer });
                return;
              }
            }
            else {
              // Cancelling previous

              // Case 1) key is on default of JOIN/ACTUALIZATION
              var exclusionDate = getExclusionDate(amNext);
              if (current && current.sigDate < exclusionDate) {
                // Case 1.1) Was leaving, for whatever reason
                if (~isLeaving) {
                  // Key had to leave anyway
                  next(null, { });
                  return;
                }
                // Case 1.2) Was joining
                if (~isJoining) {
                  next(null, { keyToUnadd: entry.issuer, keyToRemove: entry.issuer });
                  return;
                }
                // Case 1.3) Was nowhere because currently ACTUALIZED
                if (isJoining == -1 && isLeaving == -1) {
                  next(null, { keyToRemove: entry.issuer });
                  return;
                }
                next('Member should be excluded but no rule found!');
                console.error('Member should be excluded but no rule found!');
                return;
              }
              // Case 2) key either do not exist or is OK
              else {
                // Case 2.1) Was leaving because of LEAVE
                if (~isLeaving && previous.membership == 'LEAVE') {
                  next(null, { keyToUnleave: entry.issuer });
                  return;
                }
                // Case 2.2) Was joining because of JOIN
                if (~isJoining && previous.membership == 'JOIN') {
                  next(null, { keyToUnadd: entry.issuer });
                  return;
                }
                // Case 2.3) Was nowhere because of ACTUALIZE
                if (isJoining == -1 && isLeaving == -1 && previous.membership == 'ACTUALIZE') {
                  next(null, { });
                  return;
                }
                console.error('No rule found for this membership cancelling!');
                next('Error while cancelling your membership');
                return;
              }
            }
          },
          function (actions, next){
            var merkle;
            async.waterfall([
              function (next){
                Merkle.membersWrittenForProposedAmendment(amNext.number, next);
              },
              function (membersMerkle, next){
                merkle = membersMerkle;
                // Additions
                if (actions.keyToAdd) {
                  merkle.push(actions.keyToAdd);
                }
                if (actions.keyToUnleave) {
                  merkle.push(actions.keyToUnleave);
                }
                // Deletions
                if (actions.keyToUnadd) {
                  merkle.remove(actions.keyToUnadd);
                }
                if (actions.keyToRemove) {
                  merkle.remove(actions.keyToRemove);
                }
                amNext.membersRoot = merkle.root();
                amNext.membersCount = merkle.leaves().length;
                merkle.save(function (err) {
                  next(err);
                });
              },
              function(next){
                // Update changes
                if (actions.keyToRemove) {
                  amNext.membersChanges.push('-' + actions.keyToRemove);
                }
                if (actions.keyToUnleave) {
                  var index = amNext.membersChanges.indexOf('-' + actions.keyToUnleave);
                  if (~index) {
                    amNext.membersChanges.splice(index, 1);
                  }
                }
                if (actions.keyToAdd) {
                  amNext.membersChanges.push('+' + actions.keyToAdd);
                }
                if (actions.keyToUnadd) {
                  var index = amNext.membersChanges.indexOf('+' + actions.keyToUnadd);
                  if (~index) {
                    amNext.membersChanges.splice(index, 1);
                  }
                }
                next();
              },
              function (next){
                amNext.membersRoot = amNext.membersRoot || "";
                amNext.votersRoot = amNext.votersRoot || "";
                amNext.hash = amNext.getRaw().hash();
                amNext.save(function (err) {
                  next(err);
                });
              },
              function (next) {
                // Impacts on reason
                // Impacts on tree
                if (nowIsIgnored) {
                  async.waterfall([
                    function (next){
                      Merkle.votersWrittenForProposedAmendment(amNext.number, next);
                    },
                    function (merkleOfNextVoters, next){
                      cancelVoter(entry.issuer, amNext, merkleOfNextVoters, null, null, next);
                    },
                  ], function (err) {
                    next(err || 'Cancelled: a previous membership was found, thus none of your memberships will be taken for next amendment');
                    return;
                  });
                }
                else next(null, entry);
              },
            ], next);
          },
        ], callback);
      }
    ], done);
  };

  this.submitVoting = function (signedEntry, done) {
    
    async.waterfall([

      function (callback) {
        if(signedEntry.indexOf('-----BEGIN') == -1){
          callback('Signature not found in given Voting');
          return;
        }
        callback();
      },

      // Check signature's key ID
      function(callback){
        var sig = signedEntry.substring(signedEntry.indexOf('-----BEGIN'));
        var keyID = jpgp().signature(sig).issuer();
        if(!(keyID && keyID.length == 16)){
          callback('Cannot identify signature issuer`s keyID');
          return;
        }
        callback(null, keyID);
      },

      // Looking for corresponding public key
      function(keyID, callback){
        PublicKey.getTheOne(keyID, function (err, pubkey) {
          callback(err, pubkey);
        });
      },

      // Verify signature
      function(pubkey, callback){
        var entry = new Voting();
        var current = null;
        var previous = null;
        var nowIsIgnored = false;
        async.waterfall([
          function (next){
            entry.parse(signedEntry, next);
          },
          function (entry, next){
            entry.verify(currency, next);
          },
          function (valid, next){
            entry.verifySignature(pubkey.raw, next);
          },
          function (verified, next){
            if(!verified){
              next('Bad signature');
              return;
            }
            if(pubkey.fingerprint != entry.issuer){
              next('Fingerprint in Voting (' + entry.issuer + ') does not match signatory (' + pubkey.fingerprint + ')');
              return;
            }
            next();
          },
          function (next){
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
            // var timestampInSeconds = parseInt(entry.sigDate.getTime()/1000, 10);
            // Amendment.findPromotedPreceding(timestampInSeconds, next);
            Amendment.current(function (err, am) {
              next(null, am);
            });
          },
          function (am, next){
            if (am) {
              var entryTimestamp = parseInt(entry.sigDate.getTime()/1000, 10);
              if (am.generated > entryTimestamp) {
                next('Too late for this voting. Retry.');
                return;
              }
              entry.amNumber = am.number;
            } else {
              entry.amNumber = -1;
            }
            Voting.getCurrent(entry.issuer, next);
          },
          function (currentlyRecorded, next){
            current = currentlyRecorded;
            async.waterfall([
              function (next){
                Merkle.membersWrittenForProposedAmendment(entry.amNumber + 1, next);
              },
              function (merkle, next){
                if (merkle.leaves().indexOf(entry.issuer) == -1) {
                  next('Only members may be voters');
                  return;
                }
                next();
              },
            ], next);
          },
          function (next){
            // Get already existing Voting for same amendment
            Voting.getForAmendmentAndIssuer(entry.amNumber, entry.issuer, next);
          },
          function (entries, next){
            if (entries.length > 1) {
              next('Refused: already received more than one voting for next amendment.');
              return;
            } else if(entries.length > 0){
              // Already existing voting for this AM : this voting and the previous for this AM
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
            Amendment.getTheOneToBeVoted(entry.amNumber + 1, next);
          },
          function (amNext, next){
            var merkleOfNextVoters;
            async.waterfall([
              function (next){
                Merkle.votersWrittenForProposedAmendment(amNext.number, next);
              },
              function (votersMerkle, next){
                merkleOfNextVoters = votersMerkle;
                if (!nowIsIgnored) {
                  var index = merkleOfNextVoters.leaves().indexOf(entry.votingKey);
                  // Case 1) key is arleady used, by the same issuer --> error
                  if (~index && current && current.votingKey == entry.votingKey) {
                    next('Already used as voting key');
                    return;
                  }
                  // Case 2) key is arleady used, by another issuer --> error
                  if (~index) {
                    next('Already used by someone else as voting key');
                    return;
                  }
                  // Case 3) key is not already used, because it is currently leaving
                  if (~amNext.votersChanges.indexOf('-' + entry.votingKey)) {
                    next('Key is currently leaving. You can use it only after voting next amendment.');
                    return;
                  }
                  // Case 4) key is not already used, but issuer has previous other key --> cancel OLD key + add new
                  if (current) {
                    updateNextVoters(amNext, merkleOfNextVoters, {
                      "keyToRemove": current.votingKey,
                      "keyToAdd": entry.votingKey
                    }, next);
                    return;
                  }
                  // Case 5) key is not arleady used, without having any previous --> add new
                  updateNextVoters(amNext, merkleOfNextVoters, {
                    "keyToAdd": entry.votingKey
                  }, next);
                }
                else {
                  // Cancelling previous
                  cancelVoter(entry.issuer, amNext, merkleOfNextVoters, current, previous, next);
                }
              },
              function (next) {
                if (nowIsIgnored) {
                  next('Cancelled: a previous voting was found, thus none of your voting requests will be taken for next amendment');
                  return;
                }
                else next(null, entry);
              },
            ], next);
          },
        ], callback);
      }
    ], done);
  };

  this.getVote = function (amNumber, done) {
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
            if (now.timestamp() >= amNext.generated) {

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
    ], done);
  };

  function getExclusionDate (amNext) {
    var nextTimestamp = amNext.generated;
    var exclusionDate = new Date();
    exclusionDate.setTime(nextTimestamp*1000 - conf.sync.ActualizeFrequence*1000);
    return exclusionDate;
  }

  function updateNextVoters(amNext, merkle, actions, done){
    async.waterfall([
      function (next){
        // Update keys according to what is to be added/removed
        if (actions.keyToRemove) {
          merkle.remove(actions.keyToRemove);
        }
        if (actions.keyToUnadd) {
          merkle.remove(actions.keyToUnadd);
        }
        if (actions.keyToUnleave) {
          merkle.push(actions.keyToUnleave);
        }
        if (actions.keyToAdd) {
          merkle.push(actions.keyToAdd);
        }
        // Update resulting root + count
        amNext.votersRoot = merkle.root();
        amNext.votersCount = merkle.leaves().length;
        merkle.save(function (err) {
          next(err);
        });
      },
      function (next){
        // Update changes
        if (actions.keyToRemove) {
          amNext.votersChanges.push('-' + actions.keyToRemove);
        }
        if (actions.keyToUnleave) {
          var index = amNext.votersChanges.indexOf('-' + actions.keyToUnleave);
          if (~index) {
            amNext.votersChanges.splice(index, 1);
          }
        }
        if (actions.keyToAdd) {
          amNext.votersChanges.push('+' + actions.keyToAdd);
        }
        if (actions.keyToUnadd) {
          var index = amNext.votersChanges.indexOf('+' + actions.keyToUnadd);
          if (~index) {
            amNext.votersChanges.splice(index, 1);
          }
        }
        next();
      },
      function (next){
        amNext.membersRoot = amNext.membersRoot || "";
        amNext.votersRoot = amNext.votersRoot || "";
        amNext.nextVotes = Math.ceil((amNext.votersCount || 0) * conf.sync.VotesPercent);
        amNext.hash = amNext.getRaw().hash();
        amNext.save(function (err) {
          next(err);
        });
      },
    ], done);
  }

  function cancelVoter (issuer, amNext, merkleOfNextVoters, currentVoting, previousVoting, done) {
    var current;
    var previous;
    async.parallel({
      current: function(callback){
        if (currentVoting) {
          callback(null, currentVoting);
          return;
        }
        // Find current
        Voting.getCurrent(issuer, callback);
      },
      previous: function(callback){
        if (previousVoting) {
          callback(null, previousVoting);
          return;
        }
        // Find previous
        Voting.getForAmendmentAndIssuer(amNext.number - 1, issuer, function (err, entries) {
          callback(err, (entries && entries[0]) || null);
        });
      },
    }, function(err, res) {
      current = res.current;
      previous = res.previous;

      // Case 1) Voting was just new voter ==> Un-add new voting key
      if (!current) {
        updateNextVoters(amNext, merkleOfNextVoters, {
          "keyToUnadd": previous.votingKey
        }, done);
        return;
      }
      // Case 2) Voting was changing key ==> Un-add new voting key, unleave current
      updateNextVoters(amNext, merkleOfNextVoters, {
        "keyToUnleave": current.votingKey,
        "keyToAdd": previous.votingKey
      }, done);
    });
  }

  return this;
}
