var async           = require('async');
var _               = require('underscore');
var merkle          = require('merkle');
var sha1            = require('sha1');
var moment          = require('moment');
var inquirer        = require('inquirer');
var crypto          = require('../lib/crypto');
var base64          = require('../lib/base64');
var dos2unix        = require('../lib/dos2unix');
var parsers         = require('../lib/streams/parsers/doc');
var logger          = require('../lib/logger')('blockchain');
var signature       = require('../lib/signature');
var constants       = require('../lib/constants');
var localValidator  = require('../lib/localValidator');
var globalValidator = require('../lib/globalValidator');

module.exports.get = function (conn, conf, IdentityService, PeeringService) {
  return new BlockchainService(conn, conf, IdentityService, PeeringService);
};

var blockFifo = async.queue(function (task, callback) {
  task(callback);
}, 1);

var powFifo = async.queue(function (task, callback) {
  task(callback);
}, 1);

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

  var BlockchainService = this;

  var Identity      = conn.model('Identity');
  var Certification = conn.model('Certification');
  var Membership    = conn.model('Membership');
  var Block         = conn.model('Block');
  var Link          = conn.model('Link');

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
        BlockchainService.stopPoWThenProcessAndRestartPoW(function (saved) {
          // Saves entry
          entry.save(function (err) {
            saved(err);
          });
        }, next);
      },
      function (next){
        logger.debug('✔ %s %s', entry.issuer, entry.membership);
        next(null, entry);
      }
    ], done);
  };

  this.submitBlock = function (obj, done) {
    blockFifo.push(function (sent) {
      var now = new Date();
      var block = new Block(obj);
      var currentBlock = null;
      var newLinks;
      async.waterfall([
        function (next){
          localValidator().validate(block, next);
        },
        function (validated, next){
          localValidator().checkSignatures(block, next);
        },
        function (validated, next){
          globalValidator(conf, new BlockCheckerDao(block)).validate(block, next);
        },
        function (next){
          globalValidator(conf, new BlockCheckerDao(block)).checkSignatures(block, next);
        },
        function (next){
          Block.current(function (err, obj) {
            next(null, obj || null);
          })
        },
        function (current, next){
          // Check the challenge depending on issuer
          checkProofOfWork(current, block, next);
        },
        function (next) {
          // Check document's coherence
          checkIssuer(block, next);
        },
        function (next) {
          BlockchainService.stopPoWThenProcessAndRestartPoW(async.apply(saveBlockData, block), next);
        },
      ], function (err) {
        sent(err, !err && block);
      });
    }, done);
  };

  this.stopPoWThenProcessAndRestartPoW = function (task, done) {
    powFifo.push(function (taskDone) {
      async.waterfall([
        function (next) {
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
          // Do the task, without passing parameters
          task(function (err) {
            next(err);
          });
        },
        function (next) {
          // If PoW computation process is waiting, trigger it
          if (computeNextCallback)
            computeNextCallback();
          computeNextCallback = null;
          next();
        }
      ], taskDone);
    }, done);
  }

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

  function checkWoTStability (block, newLinks, done) {
    if (block.number >= 0) {
      // other blocks may introduce unstability with new members
      async.waterfall([
        function (next) {
          Identity.getMembers(next);
        },
        function (members, next) {
          var newcomers = [];
          var ofMembers = [];
          block.joiners.forEach(function (inlineMS) {
            var fpr = inlineMS.split(':')[0];
            newcomers.push(fpr);
            ofMembers.push(fpr);
          });
          members.forEach(function (member) {
            ofMembers.push(member.pubkey);
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
                globalValidator(conf, new BlockCheckerDao(block)).isOver3Hops(newcomer, ofMembers, newLinks, next);
              },
              function (outdistanced, next) {
                if (outdistanced.length > 0) {
                  logger.debug('------ Newcomers ------');
                  logger.debug(newcomers);
                  logger.debug('------ Members ------');
                  logger.debug(ofMembers);
                  logger.debug('------ newLinks ------');
                  logger.debug(newLinks);
                  logger.debug('------ outdistanced ------');
                  logger.debug(outdistanced);
                  next('Newcomer ' + newcomer + ' is not recognized by the WoT for this block');
                }
                else next();
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
          BlockchainService.getTrialLevel(block.issuer, block.number, current ? current.membersCount : 0, next);
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
          cert.existing(next);
        },
        function (existing, next) {
          if (existing) {
            cert = existing;
          }
          cert.linked = true;
          cert.save(function (err) {
            next(err);
          });
        }
      ], callback);
    }, done);
  }

  function updateMemberships (block, done) {
    async.forEach(block.joiners, function(inlineJoin, callback){
      var ms = Membership.fromInline(inlineJoin, 'IN');
      async.waterfall([
        function (next){
          Identity.getMember(ms.issuer, next);
        },
        function (idty, next){
          if (!idty) {
            var err = 'Could not find identity for membership of issuer ' + ms.issuer;
            logger.error(err);
            next(err);
            return;
          }
          ms.userid = idty.uid;
          ms.certts = idty.time;
          ms.deleteIfExists(function (err) {
            next(err);
          });
        },
      ], callback);
    }, done);
  }

  function updateLinks (block, done) {
    async.forEach(block.certifications, function(inlineCert, callback){
      var cert = Certification.fromInline(inlineCert);
      new Link({
        source: cert.from,
        target: cert.to,
        timestamp: block.timestamp
      })
      .save(function (err) {
        callback(err);
      });
    }, done);
  }

  function saveBlockData (block, done) {
    logger.info('Block #' + block.number + ' added to the keychain');
    async.waterfall([
      function (next) {
        // Saves the block
        block.save(function (err) {
          next(err);
        });
      },
      function (next) {
        // Create/Update members (create new identities if do not exist)
        updateMembers(block, next);
      },
      function (next) {
        // Create/Update certifications
        updateCertifications(block, next);
      },
      function (next) {
        // Create/Update certifications
        updateMemberships(block, next);
      },
      function (next){
        // Save links
        updateLinks(block, next);
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
        Identity.getMembers(next);
      },
      function (members, next){
        // If a member no more have enough signatures, he has to be kicked
        async.forEachSeries(members, function(idty, callback){
          var pubkey = idty.pubkey;
          async.waterfall([
            function (next){
              async.parallel({
                enoughLinks: function(callback){
                  checkHaveEnoughLinks(pubkey, {}, function (err) {
                    callback(null, err);
                  });
                },
              }, next);
            },
            function (res, next){
              var notEnoughLinks = res.enoughLinks;
              Identity.setKicked(pubkey, idty.getTargetHash(), notEnoughLinks ? true : false, next);
            },
          ], callback);
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
        Identity.getMembers(next);
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
      function (updates, next){
        Block.current(function (err, current) {
          next(null, current || null, updates);
        });
      },
      function (current, updates, next){
        createNewcomerBlock(current, {}, updates, next);
      },
    ], done);
  }

  function findUpdates (done) {
    var updates = {};
    async.waterfall([
      function (next){
        Certification.findNew(next);
      },
      function (certs, next){
        async.forEachSeries(certs, function(cert, callback){
          async.waterfall([
            function (next){
              // Signatory must be a member
              Identity.isMemberOrError(cert.from, next);
            },
            function (next){
              // Certified must be a member
              Identity.isMemberOrError(cert.to, next);
            },
            function (next){
              updates[cert.to] = updates[cert.to] || [];
              updates[cert.to].push(cert);
              next();
            },
          ], function (err) {
            callback();
          });
        }, next);
      },
    ], function (err) {
      done(err, updates);
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
    BlockchainService.generateNewcomersBlock(filteringFunc, checkingWoTFunc, done);
  }

  /**
  this.generateNewcomers = function (done) {
  * Generate a "newcomers" keyblock
  */
  this.generateNewcomersAuto = function (done) {
    BlockchainService.generateNewcomersBlock(noFiltering, iteratedChecking, done);
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
    BlockchainService.generateNextBlock(findUpdates, noFiltering, iteratedChecking, done);
  };

  /**
  * Generate a "newcomers" keyblock
  */
  this.generateNewcomersBlock = function (filteringFunc, checkingWoTFunc, done) {
    var withoutUpdates = function(updatesDone) {
      updatesDone(null, {});
    };
    BlockchainService.generateNextBlock(withoutUpdates, filteringFunc, checkingWoTFunc, done);
  };

  /**
  * Generate next keyblock, gathering both updates & newcomers
  */
  this.generateNextBlock = function (findUpdateFunc, filteringFunc, checkingWoTFunc, done) {
    var updates = {};
    async.waterfall([
      function (next) {
        // First, check for members' key updates
        findUpdateFunc(next);
      },
      function (theUpdates, next) {
        updates = theUpdates;
        findNewcomers(filteringFunc, checkingWoTFunc, next);
      },
      function (current, newWoT, joinData, otherUpdates, next){
        // Merges updates
        _(otherUpdates).keys().forEach(function(fpr){
          if (!updates[fpr])
            updates[fpr] = otherUpdates[fpr];
          else
            updates[fpr] = updates[fpr].concat(otherUpdates[fpr]);
        });
        // Create the block
        createNewcomerBlock(current, joinData, updates, next);
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
                // wotCerts: function(callback){
                //   Certification.from(ms.issuer, callback);
                // },
              }, next);
            },
            function (res, next){
              if (res.identity) {
                // MS + matching cert are found
                join.identity = res.identity;
                join.certs = res.certs;
                // join.wotCerts = res.wotCerts;
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
          // Only keep certifications from final members
          var keptCerts = [];
          joinData[newcomer].certs.forEach(function(cert){
            var issuer = cert.pubkey;
            if (~newWoT.indexOf(issuer) && ~newLinks[cert.to].indexOf(issuer)) {
              keptCerts.push(cert);
            }
          });
          joinData[newcomer].certs = keptCerts;
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
                logger.debug('Found WoT certif %s --> %s', newcomer.substring(0, 8), idty.pubkey.substring(0, 8));
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

  function createNewcomerBlock (current, joinData, updates, done) {
    var block = new Block();
    block.version = 1;
    block.currency = current ? current.currency : conf.currency;
    block.number = current ? current.number + 1 : 0;
    block.confirmedDate = current ? current.confirmedDate : moment.utc().startOf('day').unix();
    block.previousHash = current ? current.hash : "";
    block.previousIssuer = current ? current.issuer : "";
    if (PeeringService)
      block.issuer = PeeringService.pubkey;
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
    // Certifications from the WoT, to newcomers
    block.certifications = [];
    joiners.forEach(function(joiner){
      var data = joinData[joiner];
      data.certs.forEach(function(cert){
        block.certifications.push(cert.inline());
      });
    });
    // Certifications from the WoT, to the WoT
    _(updates).keys().forEach(function(certifiedMember){
      var certs = updates[certifiedMember];
      certs.forEach(function(cert){
        block.certifications.push(cert.inline());
      });
    });
    block.transactions = [];
    done(null, block);
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
        Identity.undistanceEveryKey(next);
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
        var newTS = moment.utc().startOf('day').unix();
        if (newTS == block.date) {
          block.nonce++;
        } else {
          block.nonce = 0;
          block.date = newTS;
        }
        raw = block.getRaw();
        async.waterfall([
          function (next){
            sigFunc(raw, next);
          },
          function (sigResult, next){
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
          },
        ], next);
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
            data: function(callback){
              findNewData(callback);
            },
            block: function(callback){
              BlockchainService.generateNext(callback);
            },
            signature: function(callback){
              signature(conf.salt, conf.passwd, callback);
            },
            trial: function (callback) {
              BlockchainService.getTrialLevel(PeeringService.pubkey, current ? current.number + 1 : 0, current ? current.membersCount : 0, callback);
            }
          }, next);
        }
      },
      function (res, next){
        if (!res) {
          next(null, null, 'Waiting for a root block before computing new blocks');
        } else if (_(res.data.joinData).keys().length == 0 && _(res.data.updates).keys().length == 0) {
          next(null, null, 'Waiting for new data to be written');
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
          BlockchainService.prove(res.block, res.signature, res.trial, function (err, proofBlock) {
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

  function findNewData (done) {
    var updates = {};
    async.waterfall([
      function (next) {
        // First, check for members' key updates
        findUpdates(next);
      },
      function (theUpdates, next) {
        updates = theUpdates;
        var checkingWoTFunc = function (newcomers, checkWoTForNewcomers, done) {
          checkWoTForNewcomers(newcomers, function (err) {
            // If success, simply add all newcomers. Otherwise, stop everything.
            done(err, newcomers);
          });
        };
        findNewcomers(noFiltering, checkingWoTFunc, next);
      },
      function (current, newWoT, joinData, otherUpdates, next){
        // Merges updates
        _(otherUpdates).keys().forEach(function(fpr){
          if (!updates[fpr])
            updates[fpr] = otherUpdates[fpr];
          else
            updates[fpr] = updates[fpr].concat(otherUpdates[fpr]);
        });
        next(null, { "joinData": joinData, "updates": updates });
      },
    ], done);
  }

  function BlockCheckerDao (block) {
    
    this.existsUserID = function (uid, done) {
      async.waterfall([
        function (next){
          Identity.getMemberByUserID(uid, next);
        },
        function (idty, next){
          next(null, idty != null);
        },
      ], done);
    }
    
    this.existsPubkey = function (pubkey, done) {
      async.waterfall([
        function (next){
          Identity.getMember(pubkey, next);
        },
        function (idty, next){
          next(null, idty != null);
        },
      ], done);
    }
    
    this.getIdentityByPubkey = function (pubkey, done) {
      Identity.getMember(pubkey, done);
    }
    
    this.isMember = function (pubkey, done) {
      Identity.isMember(pubkey, done);
    }

    this.getPreviousLinkFor = function (from, to, done) {
      async.waterfall([
        function (next){
          Link.getObsoletesFromTo(from, to, next);
        },
        function (links, next){
          next(null, links.length > 0 ? links[0] : null);
        },
      ], done);
    }

    this.getValidLinksTo = function (to, done) {
      Link.getValidLinksTo(to, done);
    }

    this.getMembers = function (done) {
      Identity.getMembers(done);
    }

    this.getPreviousLinkFromTo = function (from, to, done) {
      Link.getValidFromTo(from, to, done);
    }

    this.getValidLinksFrom = function (member, done) {
      Link.getValidLinksFrom(member, done);
    }

    this.getCurrent = function (done) {
      Block.current(function (err, current) {
        done(null, (err || !current) ? null : current);
      });
    }
  }
}
