var jpgp      = require('../lib/jpgp');
var async     = require('async');
var _         = require('underscore');
var openpgp   = require('openpgp');
var merkle    = require('merkle');
var sha1      = require('sha1');
var base64    = require('../lib/base64');
var dos2unix  = require('../lib/dos2unix');
var parsers   = require('../lib/streams/parsers/doc');
var keyhelper = require('../lib/keyhelper');
var logger    = require('../lib/logger')('keychain');
var signature = require('../lib/signature');
var constants = require('../lib/constants');
var moment    = require('moment');
var inquirer  = require('inquirer');

module.exports.get = function (conn, conf, IdentityService, PeeringService) {
  return new BlockchainService(conn, conf, IdentityService, PeeringService);
};

// Callback used as a semaphore to sync keyblock reception & PoW computation
var newKeyblockCallback = null;

// Callback used to start again computation of next PoW
var computeNextCallback = null;

// Flag telling if computation has started
var computationActivated = false;

// Timeout var for delaying computation of next block
var computationTimeout = null;

// Flag for saying if timeout was already waited
var computationTimeoutDone = false;

function BlockchainService (conn, conf, IdentityService, PeeringService) {

  var KeychainService = this;

  var Identity      = conn.model('Identity');
  var Certification = conn.model('Certification');
  var Membership    = conn.model('Membership');
  var Block         = conn.model('Block');
  var PublicKey     = conn.model('PublicKey');
  var TrustedKey    = conn.model('TrustedKey');
  var Link          = conn.model('Link');
  var Key           = conn.model('Key');

  // Flag to say wether timestamp of received keyblocks should be tested
  // Useful for synchronisation of old blocks
  this.checkWithLocalTimestamp = true;

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
        else Identity.isMember(entry.issuer, next);
      },
      function (isMember, next){
        var isJoin = entry.membership == 'IN';
        if (!isMember && isJoin) {
          next();
        }
        else if (isMember && !isJoin) {
          next();
        } else {
          if (isJoin)
            next('A member cannot join in.');
          else 
            next('A non-member cannot leave.');
        }
      },
      function (next){
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

  this.submitBlock = function (obj, done) {
    var now = new Date();
    var block = new Block(obj);
    var currentBlock = null;
    var newLinks;
    async.waterfall([
      function (next){
        Block.current(function (err, obj) {
          next(null, obj || null);
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
        // Test timestamp
        if (KeychainService.checkWithLocalTimestamp && Math.abs(block.timestamp - now.utcZero().timestamp()) > conf.tsInterval) {
          next('Timestamp does not match this node\'s time');
          return;
        }
        // Check the challenge depending on issuer
        checkProofOfWork(current, block, next);
      },
      function (next) {
        // Check document's coherence
        checkIssuer(block, next);
      },
      function (next) {
        // Check document's coherence
        checkCoherence(block, next);
      },
      function (theNewLinks, next) {
        newLinks = theNewLinks;
        // If computation is started, stop it and wait for stop event
        var isComputeProcessWaiting = computeNextCallback ? true : false;
        if (computationActivated && !isComputeProcessWaiting) {
          // Next will be triggered by computation of the PoW process
          newKeyblockCallback = next;
        } else {
          next();
        }
      },
      function (next) {
        newKeyblockCallback = null;
        // Save block data + compute links obsolescence
        saveBlockData(block, newLinks, next);
      },
      function (block, next) {
        // If PoW computation process is waiting, trigger it
        if (computeNextCallback)
          computeNextCallback();
        computeNextCallback = null;
        next();
      }
    ], function (err) {
      done(err, !err && block);
    });
  };

  function checkIssuer (block, done) {
    async.waterfall([
      function (next){
        Identity.isMember(block.issuer, next);
      },
      function (isMember, next){
        if (isMember)
          next();
        else {
          if (block.number == 0) {
            if (matchesList(new RegExp('^' + block.issuer + ':'), block.joiners)) {
              next();
            } else {
              next('Block not signed by the root members');
            }
          } else {
            next('Block must be signed by an existing member');
          }
        }
      },
    ], done);
  }

  function matchesList (regexp, list) {
    var i = 0;
    var found = "";
    while (!found && i < list.length) {
      found = list[i].match(regexp) ? list[i] : "";
      i++;
    }
    return found;
  }

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
        async.forEach(block.identities, function(inlineIdty, callback){
          var idty = Identity.fromInline(inlineIdty);
          newKeys[idty.pubkey] = idty;
          callback();
        }, next);
      },
      function (next){
        async.forEachSeries(block.certifications, function(inlineCert, callback) {
          // Build cert
          var cert = Certification.fromInline(inlineCert);
          async.waterfall([
            function (next){
              // Check validty (signature, and that certified & certifier are members (old or newcomers))
              checkCertificationOfKey(cert.from, cert.time.timestamp(), cert.sig, cert.to, newKeys, next);
            },
            function (next){
              // Memorize new links from signatures
              newLinks[cert.to] = newLinks[cert.to] || [];
              newLinks[cert.to].push(cert.from);
              next();
            },
          ], callback);
        }, function (err) {
          next(err, newLinks);
        });
      },
    ], function (err, newLinks) {
      done(err, newLinks);
    });
  }

  function checkWoTStability (block, newLinks, done) {
    if (block.number >= 0) {
      // other blocks may introduce unstability with new members
      async.waterfall([
        function (next) {
          Identity.getMembers(next);
        },
        function (members, next) {
          var newcomers = [];
          block.joiners.forEach(function (inlineMS) {
            var fpr = inlineMS.split(':')[0];
            newcomers.push(fpr);
            members.push({ fingerprint: fpr });
          });
          async.forEachSeries(newcomers, function (newcomer, newcomerTested) {
            async.waterfall([
              function (next) {
                if (block.number > 0)
                  checkHaveEnoughLinks(newcomer, newLinks, next);
                else
                  next();
              },
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

  function checkHaveEnoughLinks(target, newLinks, done) {
    async.waterfall([
      function (next){
        Link.currentValidLinks(target, next);
      },
      function (links, next){
        var count = links.length;
        if (newLinks[target] && newLinks[target].length)
          count += newLinks[target].length;
        next(count < conf.sigQty && 'Key ' + target.substring(24) + ' does not have enough links (' + count + '/' + conf.sigQty + ')');
      },
    ], done);
  }

  function checkProofOfWork (current, block, done) {
    var powRegexp = new RegExp('^0{' + conf.powZeroMin + '}');
    if (!block.hash.match(powRegexp))
      done('Not a proof-of-work');
    else {
      // Compute exactly how much zeros are required for this block's issuer
      var lastBlockPenality = 0;
      var nbWaitedPeriods = 0;
      async.waterfall([
        function (next){
          KeychainService.getTrialLevel(block.issuer, block.number, current ? current.membersCount : 0, next);
        },
        function (nbZeros, next){
          var powRegexp = new RegExp('^0{' + nbZeros + ',}');
          if (!block.hash.match(powRegexp))
            next('Wrong proof-of-work level: given ' + block.hash.match(/^0+/)[0].length + ' zeros, required was ' + nbZeros + ' zeros');
          else {
            next();
          }
        },
      ], done);
    }
  }

  this.getTrialLevel = function (issuer, nextBlockNumber, currentWoTsize, done) {
    // Compute exactly how much zeros are required for this block's issuer
    var lastBlockPenality = 0;
    var nbWaitedPeriods = 0;
    async.waterfall([
      function (next){
        Block.lastOfIssuer(issuer, next);
      },
      function (last, next){
        if (last) {
          var leadingZeros = last.hash.match(/^0+/)[0];
          lastBlockPenality = leadingZeros.length - conf.powZeroMin;
          var powPeriodIsPercentage = conf.powPeriod < 1;
          var nbPeriodsToWait = powPeriodIsPercentage ? Math.floor(conf.powPeriod*currentWoTsize) : conf.powPeriod;
          if (nbPeriodsToWait == 0)
            nbWaitedPeriods = 1; // Minorate by 1 if does not have to wait
          else
            nbWaitedPeriods = Math.floor((nextBlockNumber - 1 - last.number) / nbPeriodsToWait); // -1 to say "excluded"
        }
        var nbZeros = Math.max(conf.powZeroMin, conf.powZeroMin + lastBlockPenality - nbWaitedPeriods);
        next(null, nbZeros);
      },
    ], done);
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
              async.parallel({
                outdistanced: function(callback){
                  Link.isStillOver3Steps(key.fingerprint, remainingKeys, newLinks, next);
                },
                enoughLinks: function(callback){
                  checkHaveEnoughLinks(key.fingerprint, newLinks, function (err) {
                    callback(null, err);
                  });
                },
              }, next);
            },
            function (res, next) {
              var outdistanced = res.outdistanced;
              var enoughLinksErr = res.enoughLinks;
              var isStill = outdistanced.length > 0;
              var isBeingKicked = membersChanges.indexOf('-' + key.fingerprint);
              if (isStill && isBeingKicked == -1) {
                next('Member ' + key.fingerprint + ' has to lose his member status. Wrong block.');
                return;
              }
              if (!isStill && ~isBeingKicked) {
                next('Member ' + key.fingerprint + ' is no more outdistanced and should not be kicked. Wrong block.');
                return;
              }
              if (enoughLinksErr && isBeingKicked == -1) {
                next(enoughLinksErr);
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
    var mss = [];
    block.joiners.forEach(function(join){
      var ms = Membership.fromInline(join, 'IN');
      var identity = matchesList(new RegExp('^' + ms.issuer + ':'), block.identities);
      if (identity)
        ms.userid = Identity.fromInline(identity).uid;
      mss.push(ms);
    });
    async.waterfall([
      function (next){
        var newcomersCount = 0; // First time comers
        _(mss).values().forEach(function(ms){
          if (ms.userid) newcomersCount++;
        });
        if (block.identities.length != newcomersCount) {
          next('Some newcomers havn\'t sent required membership');
          return;
        }
        next();
      },
      function (next){
        async.forEach(mss, function(ms, callback){
          if (ms.userid) {
            callback();
          } else {
            async.waterfall([
              function (next){
                Identity.isMember(ms.pubkey, next);
              },
            ], function (err, isMember) {
              callback(err || (!isMember && ms.pubkey + ' is not a member and must have give an identity with its membership'));
            });
          }
        }, next);
      },
    ], done);
  }

  function updateMembers (block, done) {
    async.forEach(block.identities, function(identity, callback){
      var idty = Identity.fromInline(identity);
      async.waterfall([
        function (next){
          Identity.getTheOne(idty.pubkey, idty.getTargetHash(), next);
        },
        function (existing, next){
          if (existing) {
            idty = existing;
          }
          idty.member = true;
          idty.kicked = false;
          idty.save(function (err) {
            next(err);
          });
        }
      ], callback);
    }, done);
  }

  function updateCertifications (block, done) {
    async.forEach(block.certifications, function(inlineCert, callback){
      var cert = Certification.fromInline(inlineCert);
      async.waterfall([
        function (next) {
          Identity.getMember(cert.to, next);
        },
        function (idty, next){
          cert.target = idty.getTargetHash();
          cert.save(function (err) {
            next(err);
          });
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
        // Update members (create new identities if do not exist)
        updateMembers(block, next);
      },
      function (next) {
        // Update certifications
        updateCertifications(block, next);
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
        // Compute obsolete links
        computeObsoleteLinks(block, next);
      },
    ], function (err) {
      done(err, block);
    });
  }

  function computeObsoleteLinks (block, done) {
    async.waterfall([
      function (next){
        Link.obsoletes(block.timestamp - conf.sigValidity, next);
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
              async.parallel({
                outdistanced: function(callback){
                  Link.isOver3StepsOfAMember(key, members, callback);
                },
                enoughLinks: function(callback){
                  checkHaveEnoughLinks(key.fingerprint, {}, function (err) {
                    callback(null, err);
                  });
                },
              }, next);
            },
            function (res, next){
              var distancedKeys = res.outdistanced;
              var notEnoughLinks = res.enoughLinks;
              Key.setKicked(fpr, distancedKeys, notEnoughLinks ? true : false, next);
            },
          ], callback);
        }, next);
      },
    ], done);
  }

  function updateAvailableKeyMaterial (block, done) {
    async.forEach(block.keysChanges, function(kc, callback){
      if (kc.type != 'L') {
        PublicBlockchainService.updateAvailableKeyMaterial(kc.fingerprint, callback);
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
          PublicBlockchainService.updateAvailableKeyMaterial(member.fingerprint, callback);
        }, next);
      },
    ], done);
  }

  this.current = function (done) {
    Block.current(function (err, kb) {
      done(err, kb || null);
    })
  };

  this.promoted = function (number, done) {
    Block.findByNumber(number, function (err, kb) {
      done(err, kb || null);
    })
  };

  this.generateEmptyNext = function (done) {
    var staying = [];
    var kicked = [];
    var current;
    async.waterfall([
      function (next) {
        Block.current(function (err, currentBlock) {
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
    var block = new Block();
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
  * Generate a "newcomers" keyblock
  */
  this.generateUpdates = function (done) {
    async.waterfall([
      function (next){
        findUpdates(next);
      },
      function (updates, subupdates, next){
        Block.current(function (err, current) {
          next(null, current || null, updates, subupdates);
        });
      },
      function (current, updates, subupdates, next){
        createNewcomerBlock(current, null, {}, updates, subupdates, next);
      },
    ], done);
  }

  function findUpdates (done) {
    var updates = {};
    var subupdates = {};
    async.waterfall([
      function (next){
        Key.findMembersWithUpdates(next);
      },
      function (members, next){
        async.forEachSeries(members, function(member, callback){
          var fpr = member.fingerprint;
          async.waterfall([
            function (next){
              PublicKey.getTheOne(fpr, next);
            },
            function (pubkey, next){
              var key = pubkey.getKey();
              var finalPackets = new openpgp.packet.List();
              var certifs = pubkey.getCertificationsFromMD5List(member.certifs);
              var subkeys = pubkey.getSubkeysFromMD5List(member.subkeys);
              if (subkeys.length > 0) {
                subupdates[fpr] = subkeys;
              }
              async.forEachSeries(certifs, function(certif, callback){
                var issuerKeyId = certif.issuerKeyId.toHex().toUpperCase();
                async.waterfall([
                  function (next){
                    TrustedKey.getTheOne(issuerKeyId, next);
                  },
                  function (trusted, next){
                    // Issuer is a member
                    finalPackets.push(certif);
                    next();
                  },
                ], function (err) {
                  // Issuer is not a member
                  callback();
                });
              }, function(err){
                if (finalPackets.length > 0) {
                  updates[fpr] = finalPackets;
                }
                next();
              });
            },
          ], callback);
        }, next);
      },
    ], function (err) {
      done(err, updates, subupdates);
    });
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
    KeychainService.generateNewcomersBlock(noFiltering, iteratedChecking, done);
  }


  function noFiltering(preJoinData, next) {
    // No manual filtering, takes all
    next(null, preJoinData);
  }

  function iteratedChecking(newcomers, checkWoTForNewcomers, done) {
    var passingNewcomers = [];
    async.forEachSeries(newcomers, function(newcomer, callback){
      checkWoTForNewcomers(passingNewcomers.concat(newcomer), function (err) {
        // If success, add this newcomer to the valid newcomers. Otherwise, reject him.
        if (!err)
          passingNewcomers.push(newcomer);
        callback();
      });
    }, function(){
      done(null, passingNewcomers);
    });
  }

  this.generateNext = function (done) {
    KeychainService.generateNextBlock(findUpdates, noFiltering, iteratedChecking, done);
  };

  /**
  * Generate a "newcomers" keyblock
  */
  this.generateNewcomersBlock = function (filteringFunc, checkingWoTFunc, done) {
    var withoutUpdates = function(updates) { updates(null, {}, {}); };
    KeychainService.generateNextBlock(withoutUpdates, filteringFunc, checkingWoTFunc, done);
  };

  /**
  * Generate next keyblock, gathering both updates & newcomers
  */
  this.generateNextBlock = function (findUpdateFunc, filteringFunc, checkingWoTFunc, done) {
    var updates = {};
    var subupdates = {};
    async.waterfall([
      function (next) {
        // First, check for members' key updates
        findUpdateFunc(next);
      },
      function (theUpdates, theSubupdates, next) {
        updates = theUpdates;
        subupdates = theSubupdates;
        findNewcomers(filteringFunc, checkingWoTFunc, next);
      },
      function (current, newWoT, joinData, otherUpdates, next){
        // Merges updates
        _(otherUpdates).keys().forEach(function(fpr){
          if (!updates[fpr])
            updates[fpr] = otherUpdates[fpr];
          else
            updates[fpr].concat(otherUpdates[fpr]);
        });
        // Create the block
        createNewcomerBlock(current, joinData, updates, subupdates, next);
      },
    ], done);
  };

  function findNewcomers (filteringFunc, checkingWoTFunc, done) {
    var wotMembers = [];
    var preJoinData = {};
    var joinData = {};
    var updates = {};
    var current;
    async.waterfall([
      function (next){
        // Second, check for newcomers
        Block.current(function (err, currentBlock) {
          current = currentBlock;
            next();
        });
      },
      function (next){
        Membership.find({ membership: 'IN', certts: { $gt: 0 }, userid: { $exists: true } }, next);
      },
      function (mss, next){
        async.forEach(mss, function(ms, callback){
          var join = { identity: null, ms: ms, key: null, idHash: '' };
          join.idHash = sha1(ms.userid + ms.certts.timestamp() + ms.issuer).toUpperCase();
          async.waterfall([
            function (next){
              async.parallel({
                identity: function(callback){
                  Identity.getByHash(join.idHash, callback);
                },
                certs: function(callback){
                  Certification.toTarget(join.idHash, callback);
                },
              }, next);
            },
            function (res, next){
              if (res.identity) {
                // MS + matching cert are found
                join.identity = res.identity;
                join.certs = res.certs;
                preJoinData[res.identity.pubkey] = join;
              }
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
        Identity.getMembers(next);
      },
      function (membersKeys, next) {
        membersKeys.forEach(function (mKey) {
          wotMembers.push(mKey.pubkey);
        });
        // Look for signatures from newcomers to the WoT
        async.forEach(_(joinData).keys(), function(newcomer, searchedSignaturesOfTheWoT){
          findSignaturesFromNewcomerToWoT(newcomer, function (err, signatures) {
            _(signatures).keys().forEach(function(signedMember){
              updates[signedMember] = updates[signedMember] || [];
              updates[signedMember] = updates[signedMember].concat(signatures[signedMember]);
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
          async.waterfall([
            function (next){
              computeNewLinks(theNewcomers, joinData, updates, next);
            },
            function (newLinks, next){
              checkWoTStability({ number: current ? current.number + 1 : 0, joiners: theNewcomers }, newLinks, next);
            },
          ], onceChecked);
        }, function (err, realNewcomers) {
          async.waterfall([
            function (next){
              computeNewLinks(realNewcomers, joinData, updates, next);
            },
            function (newLinks, next){
              var newWoT = wotMembers.concat(realNewcomers);
              next(err, realNewcomers, newLinks, newWoT);
            },
          ], next);
        });
      },
      function (realNewcomers, newLinks, newWoT, next) {
        var finalJoinData = {};
        var initialNewcomers = _(joinData).keys();
        var nonKept = _(initialNewcomers).difference(realNewcomers);
        realNewcomers.forEach(function(newcomer){
          // Only keep membership of selected newcomers
          finalJoinData[newcomer] = joinData[newcomer];
        });
        // Only keep update signatures from final members
        _(updates).keys().forEach(function(signedFPR){
          var keptCertifs = [];
          (updates[signedFPR] || []).forEach(function(certif){
            var issuer = certif.pubkey;
            if (~newWoT.indexOf(issuer) && ~newLinks[signedFPR].indexOf(issuer)) {
              keptCertifs.push(certif);
            }
          });
          updates[signedFPR] = keptCertifs;
        });
        // Send back the new WoT, the joining data and key updates for newcomers' signature of WoT
        next(null, current, wotMembers.concat(realNewcomers), finalJoinData, updates);
      }
    ], done);
  }

  function computeNewLinks (theNewcomers, joinData, updates, done) {
    var newLinks = {};
    async.waterfall([
      function (next){
        async.forEach(theNewcomers, function(newcomer, callback){
          // New array of certifiers
          newLinks[newcomer] = newLinks[newcomer] || [];
          // Check wether each certification of the block is from valid newcomer/member
          async.forEach(joinData[newcomer].certs, function(cert, callback){
            if (~theNewcomers.indexOf(cert.pubkey)) {
              // Newcomer to newcomer => valid link
              newLinks[newcomer].push(cert.pubkey);
              callback();
            } else {
              async.waterfall([
                function (next){
                  Identity.isMember(cert.pubkey, next);
                },
                function (isMember, next){
                  // Member to newcomer => valid link
                  if (isMember)
                    newLinks[newcomer].push(cert.pubkey);
                  next();
                },
              ], callback);
            }
          }, callback);
        }, next);
      },
      function (next){
        _(updates).keys().forEach(function(signedFPR){
          updates[signedFPR].forEach(function(certif){
            newLinks[signedFPR] = newLinks[signedFPR] || [];
            newLinks[signedFPR].push(certif.pubkey);
          });
        });
        next();
      },
    ], function (err) {
      done(err, newLinks);
    });
  }

  function findSignaturesFromNewcomerToWoT (newcomer, done) {

    var updates = {};
    async.waterfall([
      function (next){
        Certification.from(newcomer, next);
      },
      function (certs, next){
        async.forEachSeries(certs, function(cert, callback){
          async.waterfall([
            function (next){
              Identity.getByHash(cert.target, next);
            },
            function (idty, next){
              if (idty.member) {
                logger.debug('Found WoT certif %s --> %s', newcomer, idty.pubkey);
                updates[idty.pubkey] = updates[idty.pubkey] || [];
                updates[idty.pubkey].push(cert);
              }
              next();
            },
          ], callback);
        }, next);
      },
    ], function (err) {
      done(err, updates);
    });
  }

  function isContainedIn (keyID, fingerprints) {
    var matched = "";
    var i = 0;
    while (!matched && i < fingerprints.length) {
      if (fingerprints[i].match(new RegExp(keyID + '$')))
        matched = fingerprints[i];
      i++;
    }
    return matched;
  }

  function createNewcomerBlock (current, joinData, updates, subupdates, done) {
    var block = new Block();
    block.version = 1;
    block.currency = current ? current.currency : conf.currency;
    block.number = current ? current.number + 1 : 0;
    block.previousHash = current ? current.hash : "";
    block.previousIssuer = current ? current.issuer : "";
    // Members merkle
    var joiners = _(joinData).keys();
    var previousCount = current ? current.membersCount : 0;
    if (joiners.length > 0) {
      // Joiners
      block.membersCount = previousCount + joiners.length;
      block.joiners = joiners.slice();
    } else if (joiners.length == 0 && current) {
      // No joiners but B#1+
      block.membersCount = previousCount;
    } else {
      // No joiners on B#0
      done('Wrong new block: cannot make a root block without members');
      return;
    }
    // Newcomers
    block.identities = [];
    // Newcomers + back people
    block.joiners = [];
    joiners.forEach(function(joiner){
      var data = joinData[joiner];
      block.identities.push(data.identity.inline());
      block.joiners.push(data.ms.inline());
    });
    // Leavers
    block.leavers = [];
    // Kicked people
    block.excluded = [];
    // Certifications for the WoT
    block.certifications = [];
    joiners.forEach(function(joiner){
      var data = joinData[joiner];
      data.certs.forEach(function(cert){
        block.certifications.push(cert.inline());
      });
    });
    block.transactions = [];
    done(null, block);
  }

  /**
  * Checks wether a certification is valid or not, and from a legit member.
  */
  function checkCertificationOfKey (certifier, when, sig, certified, newKeys, done) {
    async.waterfall([
      function (next){
        // Compute membership over newcomers
        var newPubkeys = _(newKeys).keys();
        var isTargetANewcomer = ~newPubkeys.indexOf(certified);
        var isIssuerANewcomer = ~newPubkeys.indexOf(certifier);
        async.parallel({
          issuer: function(callback){
            if (!isIssuerANewcomer)
              Identity.getMember(certifier, callback);
            else
              // Member is a newcomer
              callback(null, newKeys[certifier]);
          },
          target: function(callback){
            if (!isTargetANewcomer)
              Identity.getMember(certified, callback);
            else
              // Member is a newcomer
              callback(null, newKeys[certified]);
          }
        }, next);
      },
      function (res, next){
        if (!res.issuer)
          next('Ceritifier ' + certifier + ' is not a member nor a newcomer');
        else if (!res.target)
          next('Ceritified ' + certified + ' is not a member nor a newcomer');
        else {
          next(null, res.target);
        }
      },
      function (idty, next){
        logger.info('Signature for '+ certified);
        var selfCert = idty.selfCert();
        IdentityService.isValidCertification(selfCert, idty.sig, certifier, sig, when, next);
      },
    ], done);
  }

  this.computeDistances = function (done) {
    var current;
    async.waterfall([
      function (next) {
        Block.current(next);
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
    logger.debug('Generating proof-of-work with %s leading zeros...', nbZeros);
    async.whilst(
      function(){ return !pow.match(powRegexp); },
      function (next) {
        var newTS = new Date().utcZero().timestamp();
        if (newTS == block.timestamp) {
          block.nonce++;
        } else {
          block.nonce = 0;
          block.timestamp = newTS;
        }
        raw = block.getRaw();
        sigFunc(raw, function (err, sigResult) {
          sig = dos2unix(sigResult);
          var full = raw + sig + '\n';
          pow = full.hash();
          testsCount++;
          if (testsCount % 100 == 0) {
            process.stdout.write('.');
          } else if (testsCount % 50 == 0) {
            if (newKeyblockCallback) {
              computationActivated = false
              next('New block received');
            }
          }
          next();
        });
      }, function (err) {
        if (err) {
          logger.debug('Proof-of-work computation canceled: valid block received');
          done(err);
          newKeyblockCallback();
          return;
        }
        block.signature = sig;
        var end = new Date().timestamp();
        var duration = moment.duration((end - start)) + 's';
        var testsPerSecond = (testsCount / (end - start)).toFixed(2);
        logger.debug('Done: ' + pow + ' in ' + duration + ' (~' + testsPerSecond + ' tests/s)');
        done(err, block);
      });
  };

  this.showKeychain = function (done) {
    async.waterfall([
      function (next){
        Block
          .find({})
          .sort({ number: 1 })
          .exec(next);
      },
      function (blocks, next){
        async.forEachSeries(blocks, function(block, callback){
          block.display(callback);
        }, next);
      },
    ], done);
  };

  this.startGeneration = function (done) {
    if (!conf.participate) return;
    if (!PeeringService) {
      done('Needed peering service activated.');
      return;
    }
    computationActivated = true;
    if (computationTimeout) {
      clearTimeout(computationTimeout);
      computationTimeout = null;
    }
    var sigFunc, block, difficulty;
    async.waterfall([
      function (next) {
        Block.current(function (err, current) {
          next(null, current);
        });
      },
      function (current, next){
        if (!current) {
          next(null, null);
          return;
        } else {
          async.parallel({
            block: function(callback){
              KeychainService.generateNext(callback);
            },
            signature: function(callback){
              signature(conf.pgpkey, conf.pgppasswd, conf.openpgpjs, callback);
            },
            trial: function (callback) {
              KeychainService.getTrialLevel(PeeringService.cert.fingerprint, current ? current.number + 1 : 0, current ? current.membersCount : 0, callback);
            }
          }, next);
        }
      },
      function (res, next){
        if (!res) {
          next(null, null, 'Waiting for a root block before computing new blocks');
        } else if (conf.powDelay && !computationTimeoutDone) {
          computationTimeoutDone = true;
          computationTimeout = setTimeout(function () {
            if (computeNextCallback)
              computeNextCallback();
          }, conf.powDelay*1000);
          next(null, null, 'Waiting ' + conf.powDelay + 's before starting computing next block...');
          return;
        } else {
          computationTimeoutDone = false;
          KeychainService.prove(res.block, res.signature, res.trial, function (err, proofBlock) {
            next(null, proofBlock, err);
          });
        }
      },
    ], function (err, proofBlock, powCanceled) {
      if (powCanceled) {
        logger.warn(powCanceled);
        computeNextCallback = function () {
          computeNextCallback = null;
          done(null, null);
        };
        computationActivated = false
      } else {
        // Proof-of-work found
        computationActivated = false
        done(err, proofBlock);
      }
    });
  };
}
