var jpgp      = require('../lib/jpgp');
var async     = require('async');
var _         = require('underscore');
var openpgp   = require('openpgp');
var merkle    = require('merkle');
var base64    = require('../lib/base64');
var unix2dos  = require('../lib/unix2dos');
var dos2unix  = require('../lib/dos2unix');
var parsers   = require('../lib/streams/parsers/doc');
var keyhelper = require('../lib/keyhelper');
var logger    = require('../lib/logger')('membership');
var moment    = require('moment');
var inquirer  = require('inquirer');

module.exports.get = function (conn, conf, PublicKeyService) {
  return new KeyService(conn, conf, PublicKeyService);
};

function KeyService (conn, conf, PublicKeyService) {

  var KeychainService = this;

  var Membership = conn.model('Membership');
  var KeyBlock   = conn.model('KeyBlock');
  var PublicKey  = conn.model('PublicKey');
  var TrustedKey = conn.model('TrustedKey');
  var Link       = conn.model('Link');
  var Key        = conn.model('Key');

  var MINIMUM_ZERO_START = 0;
  var LINK_QUANTITY_MIN = 1;
  var MAX_STEPS = 1;
  var MAX_LINK_VALIDITY = 3600*24*30; // 30 days

  this.load = function (done) {
    done();
  };

  this.submitMembership = function (ms, done) {
    var entry = new Membership(ms);
    async.waterfall([
      function (next){
        logger.debug('⬇ %s %s', entry.issuer, entry.membership);
        // Get already existing Membership with same parameters
        Membership.getForHashAndIssuer(entry.hash, entry.issuer, next);
      },
      function (entries, next){
        if (entries.length > 0 && entries[0].date > entry.date) {
          next('Already received membership');
        }
        else Key.isMember(entry.issuer, next);
      },
      function (isMember, next){
        var isJoin = entry.membership == 'IN';
        if (!isMember && isJoin) {
          hasEligiblePubkey(entry.issuer, next);
        }
        else if (isMember && !isJoin) {
          next(null, true);
        } else {
          if (isJoin)
            next('A member cannot join in.');
          else 
            next('A non-member cannot leave.');
        }
      },
      function (isClean, next){
        if (!isClean) {
          next('Needs an eligible public key (with udid2)');
          return;
        }
        Membership.removeEligible(entry.issuer, next);
      },
      function (nbDeleted, next) {
        // Saves entry
        entry.save(function (err) {
          next(err);
        });
      },
      function (next){
        logger.debug('✔ %s %s', entry.issuer, entry.membership);
        next(null, entry);
      }
    ], done);
  };

  function hasEligiblePubkey (fpr, done) {
    async.waterfall([
      function (next){
        PublicKey.getTheOne(fpr, next);
      },
      function (pubkey, next){
        if (pubkey.keychain)
          next(null, true); // Key is already in the chain
        else {
          // Key is not in the keychain: valid if it has a valid udid2 (implying pubkey + self certificatio)
          var wrappedKey = keyhelper.fromArmored(pubkey.raw);
          next(null, wrappedKey.hasValidUdid2());
        }
      },
    ], done);
  }

  this.submitKeyBlock = function (kb, done) {
    var block = new KeyBlock(kb);
    block.issuer = kb.pubkey.fingerprint;
    var currentBlock = null;
    async.waterfall([
      function (next){
        KeyBlock.current(function (err, kb) {
          next(null, kb || null);
        })
      },
      function (current, next){
        // Testing chaining
        if (!current && block.number > 0) {
          next('Requires root block first');
          return;
        }
        if (current && block.number <= current.number) {
          next('Too late for this block');
          return;
        }
        if (current && block.number > current.number + 1) {
          next('Too early for this block');
          return;
        }
        if (current && block.number == current.number + 1 && block.previousHash != current.hash) {
          next('PreviousHash does not target current block');
          return;
        }
        if (current && block.number == current.number + 1 && block.previousIssuer != current.issuer) {
          next('PreviousIssuer does not target current block');
          return;
        }
        // Check the challenge depending on issuer
        checkProofOfWork(block, next);
      },
      function (next) {
        // Check document's coherence
        checkCoherence(block, next);
      },
      function (newLinks, next) {
        // Save block data + compute links obsolescence
        saveBlockData(block, newLinks, next);
      }
    ], function (err) {
      done(err, block);
    });
  };

  function checkCoherence (block, done) {
    var newLinks = {};
    async.waterfall([
      function (next){
        // Check key changes
        checkKeychanges(block, next);
      },
      function (theNewLinks, next) {
        newLinks = theNewLinks;
        _(newLinks).keys().forEach(function(target){
          newLinks[target].forEach(function(source){
            logger.debug('Sig %s --> %s', source, target);
          });
        });
        // Check that new links won't kick other members (existing or incoming)
        checkWoTStability(block, newLinks, next);
      },
      function (next) {
        // Check that to be kicked members are kicked
        checkKicked(block, newLinks, next);
      },
      function (next){
        // Check members' changes (+ and -), root & count
        checkCommunityChanges(block, next);
      },
    ], function (err) {
      done(err, newLinks);
    });
  }

  function checkKeychanges(block, done) {
    var newLinks = {};
    var newKeys = {};
    async.waterfall([
      function (next){
        // Memorize newKeys
        async.forEach(block.keysChanges, function(kc, callback){
          if (kc.type == 'N') {
            var key = keyhelper.fromEncodedPackets(kc.keypackets);
            newKeys[kc.fingerprint] = key;
          }
          callback();
        }, next);
      },
      function (next){
        async.forEachSeries(['N', 'U'], function(currentType, packetTypeDone) {
          async.forEachSeries(block.keysChanges, function(kc, callback){
            if (kc.type != 'U' && kc.type != 'N') {
              callback('Only NEWCOMER & UPDATE blocks are managed for now');
              return;
            }
            // Doing only one type at a time
            if (kc.type != currentType) {
              callback();
              return;
            }
            async.waterfall([
              function (next){
                // Check keychange (certifications verification notably)
                checkKeychange(block, kc, newKeys, next);
              },
              function (next){
                // Memorize new links from signatures
                newLinks[kc.fingerprint] = kc.certifiers;
                next();
              },
            ], callback);
          }, function (err) {
            packetTypeDone(err);
          });
        }, function (err) {
          next(err, newLinks);
        });
      },
    ], function (err, newLinks) {
      done(err, newLinks);
    });
  }

  function checkKeychange (block, kc, newKeys, done) {
    try {
      if (kc.type == 'N') {
        // Check NEWCOMER keychange type
        var key = keyhelper.fromEncodedPackets(kc.keypackets);
        var ms = Membership.fromInline(kc.membership.membership, kc.membership.signature);
        if (!kc.certpackets) {
          done('Certification packets are required for NEWCOMER type');
          return;
        }
        if (!kc.membership) {
          done('Membership is required for NEWCOMER type');
          return;
        }
        if (ms.membership != 'IN') {
          done('Membership must be IN for NEWCOMER type');
          return;
        }
        if (!key.hasValidUdid2()) {
          done('Key must have valid udid2 for NEWCOMER type');
          return;
        }
        if (ms.userid != key.getUserID()) {
          done('Membership must match same UserID as key');
          return;
        }
        var packets = key.getNewcomerPackets();
        var cleanOrigin = unix2dos(kc.keypackets.replace(/\n$/, ''));
        var cleanComputed = unix2dos(base64.encode(packets.write()).replace(/\n$/, ''));
        if (cleanComputed != cleanOrigin) {
          done('Only 1 pubkey, 1 udid2 userid, certifications, subkeys & subkey bindings are allowed for NEWCOMER type');
          return;
        }

        // TODO: check subkeys?

        async.parallel({
          certifications: function(callback){
            // Check certifications
            async.forEach(keyhelper.toPacketlist(kc.certpackets), function(certif, callback2){
              kc.certifiers = [];
              async.waterfall([
                function (next){
                  checkCertificationOfKey(certif, kc.fingerprint, newKeys, next);
                },
                function (certifier, next){
                  // Add certifier FPR in memory
                  kc.certifiers.push(certifier);
                  next();
                },
              ], callback2);
            }, callback);
          },
          membership: function(callback){
            // Check against signature
            var entity = new Membership(ms);
            var armoredPubkey = key.getArmored();
            async.waterfall([
              function (next){
                entity.currency = conf.currency;
                entity.userid = key.getUserID();
                jpgp()
                  .publicKey(armoredPubkey)
                  .data(entity.getRaw())
                  .signature(ms.signature)
                  .verify(next);
              },
              function (verified, next) {
                if(!verified){
                  next('Bad signature for membership of ' + entity.userid);
                  return;
                }
                next();
              },
            ], callback);
          },
        }, function(err) {
          done(err);
        });

      } else if (kc.type == 'U') {
        // Check UPDATE keychange type
        if (kc.membership) {
          done('Membership must NOT be provided for UPDATE type');
          return;
        }
        if (!kc.keypackets && !kc.certpackets) {
          done('Both KeyPackets and CertificationPakcets CANNOT be empty for UPDATE type');
          return;
        }
        if (kc.keypackets && !keyhelper.hasOnlySubkeyMaterial(kc.keypackets)) {
          done('KeyPackets MUST contain only subkeys & subkey bindings if not empty for UPDATE type');
          return;
        }
        if (kc.certpackets && !keyhelper.hasOnlyCertificationMaterial(kc.certpackets)) {
          done('CertificationPackets MUST contain only certifications if not empty for UPDATE type');
          return;
        }

        // TODO: check subkeys?

        // Check certifications
        async.forEach(keyhelper.toPacketlist(kc.certpackets), function(certif, callback){
          kc.certifiers = [];
          async.waterfall([
            function (next){
              checkCertificationOfKey(certif, kc.fingerprint, newKeys, next);
            },
            function (certifier, next){
              // Add certifier FPR in memory
              kc.certifiers.push(certifier);
              next();
            },
          ], callback);
        }, done);

      } else if (kc.type == 'L') {
        // Check LEAVER keychange type
        done('LEAVER keychange type not managed yet');

      } else if (kc.type == 'B') {
        // Check BACK keychange type
        done('BACK keychange type not managed yet');

      } else {
        done('Unknown keychange type \'' + kc.type + '\'');
      } 
    } catch (ex) {
      done(new Error(ex));
      return;
    }
  }

  function checkWoTStability (block, newLinks, done) {
    if (block.number >= 0) {
      // other blocks may introduce unstability with new members
      async.waterfall([
        function (next) {
          Key.getMembers(next);
        },
        function (members, next) {
          var newcomers = [];
          block.membersChanges.forEach(function (change) {
            if (change.match(/^\+/)) {
              var fpr = change.substring(1);
              newcomers.push(fpr);
              members.push({ fingerprint: fpr });
            }
          });
          async.forEachSeries(newcomers, function (newcomer, newcomerTested) {
            async.waterfall([
              function (next) {
                // Check the newcomer IS RECOGNIZED BY the WoT + other newcomers
                // (check we have a path WoT => newcomer)
                Link.isOver3StepsOfAMember(newcomer, members, next);
              },
              function (firstCheck, next) {
                if (firstCheck.length > 0) {
                  // This means either:
                  //   1. WoT does not recognize the newcomer
                  //   2. Other newcomers do not recognize the newcomer since we haven't taken them into account
                  // So, we have to test with newcomers' links too
                  async.waterfall([
                    function (next) {
                      Link.isStillOver3Steps(newcomer, firstCheck, newLinks, next);
                    },
                    function (secondCheck) {
                      if (secondCheck.length > 0)
                        next('Newcomer ' + newcomer + ' is not recognized by the WoT for this block');
                      else
                        next();
                    }
                  ], next);
                } else next();
              },
              function (next) {
                // Also check that the newcomer RECOGNIZES the WoT + other newcomers
                // (check we have a path newcomer => WoT)
                async.forEachSeries(members, function (member, memberRecognized) {
                  async.waterfall([
                    function (next) {
                      Link.isStillOver3Steps(member.fingerprint, [newcomer], newLinks, next);
                    },
                    function (distances, next) {
                      if (distances.length > 0)
                        next('Newcomer ' + newcomer + ' cannot recognize member ' + member.fingerprint + ': no path found or too much distance');
                      else
                        next();
                    }
                  ], memberRecognized);
                }, next);
              }
            ], newcomerTested);
          }, next);
        }
      ], done);
    }
  }

  function checkProofOfWork (block, done) {
    var powRegexp = new RegExp('^0{' + MINIMUM_ZERO_START + '}');
    if (!block.hash.match(powRegexp))
      done('Not a proof-of-work');
    else
      done();
  }

  function checkKicked (block, newLinks, done) {
    var membersChanges = block.membersChanges;
    async.waterfall([
      function (next){
        Key.getToBeKicked(next);
      },
      function (keys, next){
        async.forEach(keys, function(key, callback){
          async.waterfall([
            function (next){
              var remainingKeys = [];
              key.distanced.forEach(function(m){
                remainingKeys.push(m);
              });
              Link.isStillOver3Steps(key.fingerprint, remainingKeys, newLinks, next);
            },
            function (outdistanced, next) {
              var isStill = outdistanced.length > 0;
              if (isStill && membersChanges.indexOf('-' + key.fingerprint) == -1) {
                next('Member ' + key.fingerprint + ' has to lose his member status. Wrong block.');
                return;
              }
              if (!isStill && ~membersChanges.indexOf('-' + key.fingerprint)) {
                next('Member ' + key.fingerprint + ' is no more outdistanced and should not be kicked. Wrong block.');
                return;
              }
              // Fine
              next();
            }
          ], callback);
        }, next);
      },
    ], done);
  }

  function checkCommunityChanges (block, done) {
    var mss = block.getMemberships().mss;
    async.waterfall([
      function (next){
        var error = null;
        _(mss).values().forEach(function(ms){
          var change = ms.membership == 'IN' ? '+' : '-';
          var fingerprint = ms.fingerprint;
          // Checking received memberships all matches a correct membersChanges entry
          if (block.membersChanges.indexOf(change + fingerprint) == -1) {
            error = 'Wrong members changes';
            return;
          }
        });
        next(error);
      },
    ], done);
  }

  function updateMembers (block, done) {
    async.forEach(block.membersChanges, function(mc, callback){
      var isPlus = mc[0] == '+';
      var fpr = mc.substring(1);
      async.waterfall([
        function (next){
          (isPlus ? Key.addMember : Key.removeMember).call(Key, fpr, next);
        },
        function (next) {
          Key.unsetKicked(fpr, next);
        }
      ], callback);
    }, done);
  }

  function saveBlockData (block, newLinks, done) {
    logger.info('Block #' + block.number + ' added to the keychain');
    async.waterfall([
      function (next) {
        // Saves the block
        block.save(function (err) {
          next(err);
        });
      },
      function (next) {
        // Update members
        updateMembers(block, next);
      },
      function (next){
        // Save new pubkeys (from NEWCOMERS)
        var pubkeys = block.getNewPubkeys();
        async.forEach(pubkeys, function(encodedPackets, callback){
          var key = keyhelper.fromEncodedPackets(encodedPackets);
          var fpr = key.getFingerprint();
          var uid = key.getUserID();
          var kid = fpr.substring(24);
          var trusted = new TrustedKey({
            fingerprint: fpr,
            keyID: kid,
            uid: uid,
            packets: encodedPackets
          });
          async.parallel({
            trusted: function(callback){
              trusted.save(function (err){
                callback(err);
              });
            },
            pubkey: function(callback){
              async.waterfall([
                function (next){
                  parsers.parsePubkey(next).asyncWrite(unix2dos(key.getArmored()), next);
                },
                function (obj, next){
                  PublicKeyService.submitPubkey(obj, next);
                },
              ], callback);
            },
          }, function(err) {
            callback(err);
          });
        }, next);
      },
      function (next){
        // Save key updates (from UPDATE & BACK)
        var updates = block.getKeyUpdates();
        async.forEach(_(updates).keys(), function(fpr, callback){
          async.waterfall([
            function (next){
              TrustedKey.getTheOne(fpr, next);
            },
            function (trusted, next){
              var oldList = keyhelper.toPacketlist(trusted.packets);
              var newList = new openpgp.packet.List();
              if (updates[fpr].certifs) {
                // Concat signature packets behind userid + self-signature
                for (var i = 0; i < 3; i++)
                  newList.push(oldList[i]);
                newList.concat(keyhelper.toPacketlist(updates[fpr].certifs));
                // Concat remaining packets
                for (var i = 3; i < oldList.length; i++)
                  newList.push(oldList[i]);
              } else {
                // Write the whole existing key
                newList.concat(oldList);
              }
              if (updates[fpr].subkeys)
                newList.concat(keyhelper.toPacketlist(updates[fpr].subkeys));
              var key = keyhelper.fromPackets(newList);
              trusted.packets = key.getEncodedPacketList();
              trusted.save(function (err) {
                next(err);
              });
            },
          ], callback);
        }, next);
      },
      function (next){
        // Save links
        async.forEach(_(newLinks).keys(), function(target, callback){
          async.forEach(newLinks[target], function(source, callback2){
            var lnk = new Link({
              source: source,
              target: target,
              timestamp: block.timestamp
            });
            lnk.save(function (err) {
              callback2(err);
            });
          }, callback);
        }, next);
      },
      function (next){
        // Save memberships
        var mss = block.getMemberships().mss;
        async.forEach(_(mss).values(), function(ms, callback){
          Membership.removeFor(ms.fingerprint, callback);
        }, next);
      },
      function (next){
        // Compute obsolete links
        computeObsoleteLinks(block, next);
      },
      function (next){
        // Update available key material for members with keychanges in this block
        updateAvailableKeyMaterial(block, next);
      },
    ], function (err) {
      done(err, block);
    });
  }

  function computeObsoleteLinks (block, done) {
    async.waterfall([
      function (next){
        Link.obsoletes(block.timestamp - MAX_LINK_VALIDITY, next);
      },
      function (next){
        Key.getMembers(next);
      },
      function (members, next){
        // If a member is over 3 steps from the whole WoT, has to be kicked
        async.forEachSeries(members, function(key, callback){
          var fpr = key.fingerprint;
          async.waterfall([
            function (next){
              Link.isOver3StepsOfAMember(key, members, next);
            },
            function (distancedKeys, next){
              Key.setKicked(fpr, distancedKeys, next);
            },
          ], callback);
        }, next);
      },
    ], done);
  }

  function updateAvailableKeyMaterial (block, done) {
    async.forEach(block.keysChanges, function(kc, callback){
      if (kc.type != 'L') {
        PublicKeyService.updateAvailableKeyMaterial(kc.fingerprint, callback);
      }
      else callback();
    }, done);
  }

  this.updateCertifications = function (done) {
    async.waterfall([
      function (next){
        Key.getMembers(next);
      },
      function (members, next){
        async.forEachSeries(members, function(member, callback){
          PublicKeyService.updateAvailableKeyMaterial(member.fingerprint, callback);
        }, next);
      },
    ], done);
  }

  this.current = function (done) {
    KeyBlock.current(function (err, kb) {
      done(err, kb || null);
    })
  };

  this.generateEmptyNext = function (done) {
    var staying = [];
    var kicked = [];
    var current;
    async.waterfall([
      function (next) {
        KeyBlock.current(function (err, currentBlock) {
          current = currentBlock;
          next(err && 'No root block: cannot generate an empty block');
        });
      },
      function (next){
        Key.getMembers(next);
      },
      function (memberKeys, next){
        memberKeys.forEach(function(mKey){
          if (!mKey.kick) {
          // Member that stays
            staying.push(mKey.fingerprint);
          } else {
          // Member that leaves (kicked)
            kicked.push(mKey.fingerprint);
          }
        });
        createNextEmptyBlock(current, staying, kicked, next);
      },
    ], done);
  };

  function createNextEmptyBlock (current, members, leaving, done) {
    var block = new KeyBlock();
    block.version = 1;
    block.currency = current.currency;
    block.number = current.number + 1;
    block.previousHash = current.hash;
    block.previousIssuer = current.issuer;
    // Members merkle
    var stayers = members.slice(); // copy
    var leavers = leaving.slice(); // copy
    stayers.sort();
    leavers.sort();
    var tree = merkle(stayers, 'sha1').process();
    block.membersCount = stayers.length;
    block.membersRoot = tree.root();
    block.membersChanges = [];
    leavers.forEach(function(fpr){
      block.membersChanges.push('-' + fpr);
    });
    block.keysChanges = [];
    done(null, block);
  }

  /**
  this.generateNewcomers = function (done) {
  * Generate a "newcomers" keyblock
  */
  this.generateNewcomers = function (done) {
    var filteringFunc = function (preJoinData, next) {
      var joinData = {};
      var newcomers = _(preJoinData).keys();
      var uids = [];
      newcomers.forEach(function(newcomer){
        uids.push(preJoinData[newcomer].ms.userid);
      });
      if (newcomers.length > 0) {
        inquirer.prompt([{
          type: "checkbox",
          name: "uids",
          message: "Newcomers to add",
          choices: uids,
          default: uids[0]
        }], function (answers) {
          newcomers.forEach(function(newcomer){
            if (~answers.uids.indexOf(preJoinData[newcomer].ms.userid))
              joinData[newcomer] = preJoinData[newcomer];
          });
          if (answers.uids.length == 0)
            next('No newcomer selected');
          else
            next(null, joinData);
        });
      } else {
        next('No newcomer found');
      }
    };
    var checkingWoTFunc = function (newcomers, checkWoTForNewcomers, done) {
      checkWoTForNewcomers(newcomers, function (err) {
        // If success, simply add all newcomers. Otherwise, stop everything.
        done(err, newcomers);
      });
    };
    KeychainService.generateNewcomersBlock(filteringFunc, checkingWoTFunc, done);
  }

  /**
  this.generateNewcomers = function (done) {
  * Generate a "newcomers" keyblock
  */
  this.generateNewcomersAuto = function (done) {
    var filtering = function (preJoinData, next) {
      // No manual filtering, takes all
      next(null, preJoinData);
    };
    var checking = function (newcomers, checkWoTForNewcomers, done) {
      var passingNewcomers = [];
      async.forEachSeries(newcomers, function(newcomer, callback){
        checkWoTForNewcomers(passingNewcomers.concat(newcomer), function (err) {
          // If success, add this newcomer to the valid newcomers. Otherwise, reject him.
          if (!err)
            passingNewcomers.push(newcomer);
          callback();
        });
      }, function(){
        console.log(passingNewcomers);
        done(null, passingNewcomers);
      });
    }
    KeychainService.generateNewcomersBlock(filtering, checking, done);
  }

  /**
  * Generate a "newcomers" keyblock
  */
  this.generateNewcomersBlock = function (filteringFunc, checkingWoTFunc, done) {
    // 1. See available keychanges
    var wotMembers = [];
    var preJoinData = {};
    var joinData = {};
    var updates = {};
    var current;
    async.waterfall([
      function (next) {
        KeyBlock.current(function (err, currentBlock) {
          current = currentBlock;
            next();
        });
      },
      function (next){
        Membership.find({ eligible: true }, next);
      },
      function (mss, next){
        async.forEach(mss, function(ms, callback){
          var join = { pubkey: null, ms: ms, key: null };
          async.waterfall([
            function (next){
              async.parallel({
                pubkey: function(callback){
                  PublicKey.getTheOne(join.ms.issuer, callback);
                },
                key: function(callback){
                  Key.getTheOne(join.ms.issuer, callback);
                },
              }, next);
            },
            function (res, next){
              var pubk = res.pubkey;
              join.pubkey = pubk;
              if (!res.key.eligible) {
                next('PublicKey of ' + uid + ' is not eligible');
                return;
              }
              var key = keyhelper.fromArmored(pubk.raw);
              join.key = key;
              // Just require a good udid2
              if (!key.hasValidUdid2()) {
                next('User ' + uid + ' does not have a valid udid2 userId');
                return;
              }
              preJoinData[join.pubkey.fingerprint] = join;
              next();
            },
          ], callback);
        }, next);
      },
      function (next){
        filteringFunc(preJoinData, next);
      },
      function (filteredJoinData, next) {
        joinData = filteredJoinData;
        // Cache the members
        Key.getMembers(next);
      },
      function (membersKeys, next) {
        membersKeys.forEach(function (mKey) {
          wotMembers.push(mKey.fingerprint);
        });
        // Look for signatures from newcomers to the WoT
        async.forEach(_(joinData).keys(), function(newcomer, searchedSignaturesOfTheWoT){
          findSignaturesFromNewcomerToWoT(newcomer, function (err, signatures) {
            _(signatures).keys().forEach(function(signedMember){
              updates[signedMember] = (updates[signedMember] || new openpgp.packet.List());
              updates[signedMember].concat(signatures[signedMember]);
            });
            searchedSignaturesOfTheWoT(err);
          });
        }, next);
      },
      function (next) {
        // Checking step
        var newcomers = _(joinData).keys();
        // Checking algo is defined by 'checkingWoTFunc'
        checkingWoTFunc(newcomers, function (theNewcomers, onceChecked) {
          // Concats the joining members
          var members = wotMembers.concat(theNewcomers);
          // Check WoT stability
          var membersChanges = [];
          var newLinks = computeNewLinks(theNewcomers, joinData, updates, members);
          theNewcomers.forEach(function (newcomer) {
            membersChanges.push('+' + newcomer);
          });
          checkWoTStability({ number: current ? current.number + 1 : 0, membersChanges: membersChanges }, newLinks, onceChecked);
        }, function (err, realNewcomers) {
          var newWoT = wotMembers.concat(realNewcomers);
          var newLinks = computeNewLinks(realNewcomers, joinData, updates, newWoT);
          next(err, realNewcomers, newLinks, newWoT);
        });
      },
      function (realNewcomers, newLinks, newWoT, next) {
        var finalJoinData = {};
        var initialNewcomers = _(joinData).keys();
        var nonKept = _(initialNewcomers).difference(realNewcomers);
        realNewcomers.forEach(function(newcomer){
          var data = joinData[newcomer];
          // Only keep newcomer signatures from members
          var keptCertifs = new openpgp.packet.List();
          data.key.getOtherCertifications().forEach(function(certif){
            var issuerKeyId = certif.issuerKeyId.toHex().toUpperCase();
            var fingerprint = matchFingerprint(issuerKeyId, newWoT);
            if (fingerprint && ~newLinks[data.key.getFingerprint()].indexOf(fingerprint)) {
              keptCertifs.push(certif);
            }
          });
          data.key.setOtherCertifications(keptCertifs);
          // Only keep membership of selected newcomers
          finalJoinData[newcomer] = data;
        });
        // Only keep update signatures from members
        _(updates).keys().forEach(function(signedFPR){
          var keptCertifs = new openpgp.packet.List();
          (updates[signedFPR] || new openpgp.packet.List()).forEach(function(certif){
            var issuerKeyId = certif.issuerKeyId.toHex().toUpperCase();
            var fingerprint = matchFingerprint(issuerKeyId, initialNewcomers);
            if (fingerprint && ~newWoT.indexOf(fingerprint) && ~newLinks[signedFPR].indexOf(fingerprint)) {
              keptCertifs.push(certif);
            }
          });
          updates[signedFPR] = keptCertifs;
        });
        // Create the block
        createNewcomerBlock(current, wotMembers.concat(realNewcomers), finalJoinData, updates, next);
      },
    ], done);
  };

  function computeNewLinks (theNewcomers, joinData, updates, members) {
    var newLinks = {};
    // Cache new links from WoT => newcomer
    theNewcomers.forEach(function (newcomer) {
      newLinks[newcomer] = [];
      var certifs = joinData[newcomer].key.getOtherCertifications();
      certifs.forEach(function (certif) {
        var issuer = certif.issuerKeyId.toHex().toUpperCase();
        var matched = matchFingerprint(issuer, members);
        if (matched)
          newLinks[newcomer].push(matched);
      });
      // Cache new links from newcomer => WoT
      var newcomerKeyID = newcomer.substring(24);
      _(updates).keys().forEach(function(signedFPR){
        updates[signedFPR].forEach(function(certif){
          if (certif.issuerKeyId.toHex().toUpperCase() == newcomerKeyID) {
            newLinks[signedFPR] = (newLinks[signedFPR] || []);
            newLinks[signedFPR].push(newcomer);
          }
        });
      });
    });
    return newLinks;
  }

  function findSignaturesFromNewcomerToWoT (newcomer, done) {
    var updates = {};
    async.waterfall([
      function (next){
        Key.findMembersWhereSignatory(newcomer, next);
      },
      function (keys, next){
        async.forEach(keys, function(signedKey, extractedSignatures){
          async.waterfall([
            function (next){
              PublicKey.getTheOne(signedKey.fingerprint, next);
            },
            function (signedPubkey, next){
              var key = keyhelper.fromArmored(signedPubkey.raw);
              var certifs = key.getCertificationsFromSignatory(newcomer);
              if (certifs.length > 0) {
                updates[signedPubkey.fingerprint] = certifs;
                certifs.forEach(function(){
                  logger.debug('Found WoT certif %s --> %s', newcomer, signedPubkey.fingerprint);
                });
              }
              next();
            },
          ], function () {
            extractedSignatures();
          });
        }, function (err) {
          next(err, updates);
        });
      },
    ], done);
  }

  function matchFingerprint (keyID, fingerprints) {
    var matched = "";
    var i = 0;
    while (!matched && i < fingerprints.length) {
      if (fingerprints[i].match(new RegExp(keyID + '$')))
        matched = fingerprints[i];
      i++;
    }
    return matched;
  }

  function createNewcomerBlock (current, members, joinData, updates, done) {
    var block = new KeyBlock();
    block.version = 1;
    block.currency = current ? current.currency : conf.currency;
    block.number = current ? current.number + 1 : 0;
    block.previousHash = current ? current.hash : "";
    block.previousIssuer = current ? current.issuer : "";
    // Members merkle
    members.sort();
    var tree = merkle(members, 'sha1').process();
    block.membersCount = members.length;
    block.membersRoot = tree.root();
    block.membersChanges = [];
    _(joinData).keys().forEach(function(fpr){
      block.membersChanges.push('+' + fpr);
    });
    // Keychanges - newcomers
    block.keysChanges = [];
    _(joinData).values().forEach(function(join){
      var key = join.key;
      block.keysChanges.push({
        type: 'N',
        fingerprint: join.pubkey.fingerprint,
        keypackets: keyhelper.toEncoded(key.getFounderPackets()),
        certpackets: keyhelper.toEncoded(key.getOtherCertifications()),
        membership: {
          membership: join.ms.inlineValue(),
          signature: join.ms.inlineSignature()
        }
      });
    });
    // Keychanges - updates: signatures from newcomers
    _(updates).keys().forEach(function(fpr){
      if (updates[fpr].length > 0) {
        block.keysChanges.push({
          type: 'U',
          fingerprint: fpr,
          keypackets: '',
          certpackets: base64.encode(updates[fpr].write()),
          membership: {}
        });
      }
    });
    done(null, block);
  }

  function checkCertificationOfKey (certif, certifiedFPR, newKeys, done) {
    var found = null;
    async.waterfall([
      function (next){
        var keyID = certif.issuerKeyId.toHex().toUpperCase();
        // Check in local newKeys for trusted key (if found, trusted is newcomer here)
        _(newKeys).keys().forEach(function(fpr){
          if (fpr.match(new RegExp(keyID + '$')))
            found = fpr;
        });
        async.parallel({
          pubkeyCertified: function(callback){
            if (newKeys[certifiedFPR]) {
              // The certified is a newcomer
              var key = newKeys[certifiedFPR];
              async.waterfall([
                function (next){
                  parsers.parsePubkey(next).asyncWrite(unix2dos(key.getArmored()), next);
                },
                function (obj, next) {
                  next(null, new PublicKey(obj));
                }
              ], callback);
            }
            // The certified is a WoT member
            else PublicKey.getTheOne(certifiedFPR, callback);
          },
          trusted: function(callback){
            if (found)
              callback(null, { fingerprint: found });
            else
              TrustedKey.getTheOne(keyID, callback);
          }
        }, next);
      },
      function (res, next){
        // Known certifier KeyID, get his public key + check if member
        var certifierFPR = res.trusted.fingerprint;
        async.parallel({
          pubkeyCertifier: function(callback){
            PublicKey.getTheOne(certifierFPR, callback);
          },
          isMember: function(callback){
            if (found) {
              // Is considered a member since valide newcomer
              callback(null, res);
              return;
            }
            Key.isMember(certifierFPR, function (err, isMember) {
              callback(err || (!isMember && 'Signature from non-member ' + res.trusted.fingerprint), res);
            });
          }
        }, function (err, res2) {
          res2.pubkeyCertified = res.pubkeyCertified;
          next(err, res2);
        });
      },
      function (res, next){
        var other = { pubkey: res.pubkeyCertifier };
        var uid = res.pubkeyCertified.getUserID();
        var selfKey = res.pubkeyCertified.getKey();
        var otherKey = other.pubkey.getKey();
        var userId = new openpgp.packet.Userid();
        logger.info('Signature for '+ uid);
        userId.read(uid);
        var success = certif.verify(otherKey.getPrimaryKey(), {userid: userId, key: selfKey.getPrimaryKey()});
        next(success ? null : 'Wrong signature', success && other.pubkey.fingerprint);
      },
    ], done);
  }

  this.computeDistances = function (done) {
    var current;
    async.waterfall([
      function (next) {
        KeyBlock.current(next);
      },
      function (currentBlock, next) {
        current = currentBlock;
        Link.unobsoletesAllLinks(next);
      },
      function (next) {
        Key.undistanceEveryKey(next);
      },
      function (next) {
        computeObsoleteLinks(current, next);
      }
    ], done);
  }

  this.prove = function (block, sigFunc, nbZeros, done) {
    var powRegexp = new RegExp('^0{' + nbZeros + '}');
    var pow = "", sig = "", raw = "";
    var start = new Date().timestamp();
    var testsCount = 0;
    logger.debug('Generating proof-of-work...');
    async.whilst(
      function(){ return !pow.match(powRegexp); },
      function (next) {
        var newTS = new Date().timestamp();
        if (newTS == block.timestamp) {
          block.nonce++;
        } else {
          block.nonce = 0;
          block.timestamp = newTS;
        }
        raw = block.getRaw();
        sigFunc(raw, function (err, sigResult) {
          sig = unix2dos(sigResult);
          var full = raw + sig;
          pow = full.hash();
          testsCount++;
          if (testsCount % 100 == 0) process.stdout.write('.');
          next();
        });
      }, function (err) {
        block.signature = sig;
        var end = new Date().timestamp();
        var duration = moment.duration((end - start)) + 's';
        var testsPerSecond = (testsCount / (end - start)).toFixed(2);
        logger.debug('Done: ' + pow + ' in ' + duration + ' (~' + testsPerSecond + ' tests/s)');
        done(err, block);
      });
  };
}
