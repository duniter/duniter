var async           = require('async');
var _               = require('underscore');
var merkle          = require('merkle');
var sha1            = require('sha1');
var moment          = require('moment');
var inquirer        = require('inquirer');
var rawer           = require('../lib/rawer');
var crypto          = require('../lib/crypto');
var base64          = require('../lib/base64');
var dos2unix        = require('../lib/dos2unix');
var parsers         = require('../lib/streams/parsers/doc');
var logger          = require('../lib/logger')('blockchain');
var signature       = require('../lib/signature');
var constants       = require('../lib/constants');
var localValidator  = require('../lib/localValidator');
var globalValidator = require('../lib/globalValidator');
var blockchainDao   = require('../lib/blockchainDao');

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
  var Source        = conn.model('Source');
  var Transaction   = conn.model('Transaction');
  var Configuration = conn.model('Configuration');

  // Flag to say wether timestamp of received keyblocks should be tested
  // Useful for synchronisation of old blocks
  this.checkWithLocalTimestamp = true;

  this.load = function (done) {
    done();
  };

  this.submitMembership = function (ms, done) {
    var entry = new Membership(ms);
    var globalValidation = globalValidator(conf, blockchainDao(conn, null));
    async.waterfall([
      function (next){
        logger.debug('⬇ %s %s', entry.issuer, entry.membership);
        // Get already existing Membership with same parameters
        Membership.getForHashAndIssuer(entry.hash, entry.issuer, next);
      },
      function (entries, next){
        if (entries.length > 0) {
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
      function (next) {
        BlockchainService.current(next);
      },
      function (current, next) {
        globalValidation.checkMembershipBlock(entry, current, next);
      },
      function (next){
        // Saves entry
        entry.save(function (err) {
          if (computeNextCallback) {
            // A new block may be written
            computeNextCallback();
          }
          next(err);
        });
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
      var localValidation = localValidator(conf);
      var globalValidation = globalValidator(conf, blockchainDao(conn, block));
      async.waterfall([
        function (next) {
          BlockchainService.current(next);
        },
        function (current, next){
          currentBlock = current;
          localValidation.validate(block, next);
        },
        function (next){
          globalValidation.validate(block, next);
        },
        function (next) {
          // Check document's coherence
          checkIssuer(block, next);
        },
        function (next) {
          BlockchainService.stopPoWThenProcessAndRestartPoW(async.apply(saveBlockData, currentBlock, block), next);
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

  function checkWoTConstraints (block, newLinks, done) {
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
                // Check the newcomer IS RECOGNIZED BY the WoT
                // (check we have a path for each WoT member => newcomer)
                if (block.number > 0)
                  globalValidator(conf, blockchainDao(conn, block)).isOver3Hops(newcomer, ofMembers, newLinks, next);
                else
                  next(null, []);
              },
              function (outdistanced, next) {
                if (outdistanced.length > 0) {
                  // logger.debug('------ Newcomers ------');
                  // logger.debug(newcomers);
                  // logger.debug('------ Members ------');
                  // logger.debug(ofMembers);
                  // logger.debug('------ newLinks ------');
                  // logger.debug(newLinks);
                  // logger.debug('------ outdistanced ------');
                  // logger.debug(outdistanced);
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
        next(count < conf.sigQty && 'Key ' + target + ' does not have enough links (' + count + '/' + conf.sigQty + ')');
      },
    ], done);
  }

  function updateBlocksComputedVars (current, block, done) {
    // New date confirmation
    if (!current || current.date != block.date) {
      block.newDateNth = 1;
    } else {
      block.newDateNth = current.newDateNth + 1;
    }
    if (current && block.confirmedDate != current.confirmedDate) {
      block.confirmedDateChanged = true;
    }
    // Monetary Mass update
    if (current) {
      block.monetaryMass = (current.monetaryMass || 0) + block.dividend*block.membersCount;
    }
    done();
  }

  function updateMembers (block, done) {
    async.waterfall([
      function (next) {
        // Newcomers
        async.forEachSeries(block.identities, function(identity, callback){
          var idty = Identity.fromInline(identity);
          async.waterfall([
            function (next){
              // Computes the hash if not done yet
              if (!idty.hash)
                idty.hash = sha1(rawer.getIdentity(idty)).toUpperCase();
              Identity.getTheOne(idty.pubkey, idty.getTargetHash(), next);
            },
            function (existing, next){
              if (existing) {
                idty = existing;
              }
              idty.currentMSN = block.number;
              idty.member = true;
              idty.kick = false;
              idty.save(function (err) {
                next(err);
              });
            }
          ], callback);
        }, next);
      },
      function (next) {
        // Joiners (come back)
        async.forEachSeries(block.joiners, function(inlineMS, callback){
          var ms = Identity.fromInline(inlineMS);
          async.waterfall([
            function (next){
              // Necessarily exists, since we've just created them in the worst case
              Identity.getMember(ms.pubkey, next);
            },
            function (idty, next){
              idty.currentMSN = block.number;
              idty.member = true;
              idty.kick = false;
              idty.save(function (err) {
                next(err);
              });
            }
          ], callback);
        }, next);
      },
      function (next) {
        // Actives
        async.forEachSeries(block.actives, function(inlineMS, callback){
          var ms = Identity.fromInline(inlineMS);
          async.waterfall([
            function (next){
              Identity.getMember(ms.pubkey, next);
            },
            function (idty, next){
              idty.currentMSN = block.number;
              idty.member = true;
              idty.kick = false;
              idty.save(function (err) {
                next(err);
              });
            }
          ], callback);
        }, next);
      },
      function (next) {
        // Leavers
        async.forEachSeries(block.leavers, function(inlineMS, callback){
          var ms = Identity.fromInline(inlineMS);
          async.waterfall([
            function (next){
              Identity.getMember(ms.pubkey, next);
            },
            function (idty, next){
              idty.currentMSN = block.number;
              idty.member = false;
              idty.kick = false;
              idty.save(function (err) {
                next(err);
              });
            }
          ], callback);
        }, next);
      },
      function (next) {
        // Excluded
        async.forEach(block.excluded, function (pubkey, callback) {
          async.waterfall([
            function (next) {
              Identity.getMember(pubkey, next);
            },
            function (idty, next) {
              idty.member = false;
              idty.kick = false;
              idty.save(function (err) {
                next(err);
              });
            }
          ], callback);
        }, next);
      }
    ], done);
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
        timestamp: block.confirmedDate
      })
      .save(function (err) {
        callback(err);
      });
    }, done);
  }

  function saveBlockData (current, block, done) {
    logger.info('Block #' + block.number + ' added to the keychain');
    async.waterfall([
      function (next) {
        updateBlocksComputedVars(current, block, next);
      },
      function (next) {
        // Saves the block
        block.save(function (err) {
          next(err);
        });
      },
      function (next) {
        saveParametersForRootBlock(block, next);
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
      function (next){
        // Compute obsolete memberships (active, joiner)
        computeObsoleteMemberships(block, next);
      },
      function (next){
        // Update consumed sources & create new ones
        updateTransactionSources(block, next);
      },
      function (next){
        // Delete eventually present transactions
        deleteTransactions(block, next);
      },
    ], function (err) {
      done(err, block);
    });
  }

  function saveParametersForRootBlock (block, done) {
    if (block.parameters) {
      var sp = block.parameters.split(':');
      conf.c           = parseFloat(sp[0]);
      conf.dt          = parseInt(sp[1]);
      conf.ud0         = parseInt(sp[2]);
      conf.sigDelay    = parseInt(sp[3]);
      conf.sigValidity = parseInt(sp[4]);
      conf.sigQty      = parseInt(sp[5]);
      conf.sigWoT      = parseInt(sp[6]);
      conf.msValidity  = parseInt(sp[7]);
      conf.stepMax     = parseInt(sp[8]);
      conf.powZeroMin  = parseInt(sp[9]);
      conf.dtDateMin   = parseInt(sp[10]);
      conf.incDateMin  = parseInt(sp[11]);
      conf.save(function (err) {
        done(err);
      });
    }
    else done();
  }

  function computeObsoleteLinks (block, done) {
    async.waterfall([
      function (next){
        Link.obsoletes(block.confirmedDate - conf.sigValidity, next);
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

  function computeObsoleteMemberships (block, done) {
    async.waterfall([
      function (next){
        Block.getFirstFrom(block.confirmedDate - conf.msValidity, next);
      },
      function (first, next){
        if (first)
          Identity.kickWithOutdatedMemberships(first.number, next);
        else
          next();
      },
    ], done);
  }

  function updateTransactionSources (block, done) {
    async.parallel({
      newDividend: function (next) {
        if (block.dividend) {
          async.waterfall([
            function (next) {
              Identity.getMembers(next);
            },
            function (idties, next) {
              async.forEachSeries(idties, function (idty, callback) {
                new Source({
                  'pubkey': idty.pubkey,
                  'type': 'D',
                  'number': block.number,
                  'fingerprint': block.hash,
                  'amount': block.dividend
                }).save(function (err) {
                  callback(err);
                });
              }, next);
            }
          ], next);
        }
        else next();
      },
      transactions: function (next) {
        async.forEachSeries(block.transactions, function (json, callback) {
          var obj = json;
          obj.version = 1;
          obj.currency = block.currency;
          obj.issuers = json.signatories;
          var tx = new Transaction(obj);
          var txObj = tx.getTransaction();
          var txHash = tx.getHash();
          async.parallel({
            consume: function (next) {
              async.forEachSeries(txObj.inputs, function (input, callback) {
                Source.setConsumed(input.type, input.pubkey, input.number, input.fingerprint, input.amount, callback);
              }, next);
            },
            create: function (next) {
              async.forEachSeries(txObj.outputs, function (output, callback) {
                new Source({
                  'pubkey': output.pubkey,
                  'type': 'T',
                  'number': block.number,
                  'fingerprint': txHash,
                  'amount': output.amount
                }).save(function (err) {
                  callback(err);
                });
              }, next);
            }
          }, callback);
        }, next);
      }
    }, function (err) {
      done(err);
    });
  }

  function deleteTransactions (block, done) {
    async.forEachSeries(block.transactions, function (json, callback) {
      var obj = json;
      obj.version = 1;
      obj.currency = block.currency;
      obj.issuers = json.signatories;
      var tx = new Transaction(obj);
      var txHash = tx.getHash();
      Transaction.removeByHash(txHash, callback);
    }, done);
  }

  this.current = function (done) {
    Block.current(function (err, kb) {
      done(null, kb || null);
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
    var exclusions = [];
    async.waterfall([
      function (next) {
        // First, check for members' exclusions
        Identity.getToBeKicked(next);
      },
      function (toBeKicked, next) {
        toBeKicked.forEach(function (idty) {
          exclusions.push(idty.pubkey);
        });
        // Second, check for members' key updates
        findUpdates(next);
      },
      function (updates, next){
        Block.current(function (err, current) {
          next(null, current || null, updates);
        });
      },
      function (current, updates, next){
        createNewcomerBlock(current, {}, updates, exclusions, null, [], next);
      },
    ], done);
  }

  function findUpdates (done) {
    var updates = {};
    var updatesToFrom = {};
    var current;
    async.waterfall([
      function (next) {
        BlockchainService.current(next);
      },
      function (theCurrent, next){
        current = theCurrent;
        Certification.findNew(next);
      },
      function (certs, next){
        async.forEachSeries(certs, function(cert, callback){
          async.waterfall([
            function (next) {
              if (current) {
                // Already exists a link not replayable yet?
                Link.existsLinkFromOrAfterDate(cert.pubkey, cert.to, current.confirmedDate - conf.sigDelay, next);
              }
              else next(null, false);
            },
            function (exists, next) {
              if (exists)
                next('It already exists a similar certification written, which is not replayable yet');
              else {
                // Signatory must be a member
                Identity.isMemberOrError(cert.from, next);
              }
            },
            function (next){
              // Certified must be a member
              Identity.isMemberOrError(cert.to, next);
            },
            function (next){
              updatesToFrom[cert.to] = updatesToFrom[cert.to] || [];
              updates[cert.to] = updates[cert.to] || [];
              if (updatesToFrom[cert.to].indexOf(cert.pubkey) == -1) {
                updates[cert.to].push(cert);
                updatesToFrom[cert.to].push(cert.pubkey);
              }
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
    var exclusions = [];
    var current = null;
    var lastUDBlock = null;
    var transactions = [];
    async.waterfall([
      function (next){
        Block.current(function (err, currentBlock) {
          current = currentBlock;
            next();
        });
      },
      function (next){
        Block.lastUDBlock(next);
      },
      function (theLastUDBlock, next) {
        lastUDBlock = theLastUDBlock;
        // First, check for members' exclusions
        Identity.getToBeKicked(next);
      },
      function (toBeKicked, next) {
        toBeKicked.forEach(function (idty) {
          exclusions.push(idty.pubkey);
        });
        // Second, check for WoT inner certifications
        findUpdateFunc(next);
      },
      function (theUpdates, next) {
        updates = theUpdates;
        // Third, check for newcomers
        findNewcomers(current, filteringFunc, checkingWoTFunc, next);
      },
      function (current, newWoT, theJoinData, otherUpdates, next){
        joinData = theJoinData;
        // Merges updates
        _(otherUpdates).keys().forEach(function(fpr){
          if (!updates[fpr])
            updates[fpr] = otherUpdates[fpr];
          else
            updates[fpr] = updates[fpr].concat(otherUpdates[fpr]);
        });
        // Finally look for transactions
        Transaction.find({}, next);
      },
      function (txs, next) {
        var passingTxs = [];
        var localValidation = localValidator(conf);
        var globalValidation = globalValidator(conf, blockchainDao(conn, null));
        async.forEachSeries(txs, function (tx, callback) {
          var extractedTX = tx.getTransaction();
          async.waterfall([
            function (next) {
              localValidation.checkBunchOfTransactions(passingTxs.concat(extractedTX), next);
            },
            function (next) {
              globalValidation.checkSingleTransaction(extractedTX, next);
            },
            function (next) {
              transactions.push(tx);
              passingTxs.push(extractedTX);
              next();
            }
          ], function (err) {
            callback();
          });
        }, next);
      },
      function (next) {
        // Create the block
        createNewcomerBlock(current, joinData, updates, exclusions, lastUDBlock, transactions, next);
      },
    ], done);
  };

  function findNewcomers (current, filteringFunc, checkingWoTFunc, done) {
    var wotMembers = [];
    var preJoinData = {};
    var joinData = {};
    var updates = {};
    async.waterfall([
      function (next){
        Membership.find({ membership: 'IN', certts: { $gt: 0 }, userid: { $exists: true } }, next);
      },
      function (mss, next){
        var joiners = [];
        mss.forEach(function (ms) {
          joiners.push(ms.issuer);
        });
        async.forEach(mss, function(ms, callback){
          var join = { identity: null, ms: ms, key: null, idHash: '' };
          join.idHash = sha1(ms.userid + ms.certts.timestamp() + ms.issuer).toUpperCase();
          async.waterfall([
            function (next){
              async.parallel({
                block: function (callback) {
                  if (current) {
                    Block.findByNumberAndHash(ms.number, ms.fpr, function (err, basedBlock) {
                      callback(null, err ? null : basedBlock);
                    });
                  } else {
                    callback(null, {});
                  }
                },
                identity: function(callback){
                  Identity.getByHash(join.idHash, callback);
                },
                certs: function(callback){
                  if (!current) {
                    // Look for certifications from initial joiners
                    async.waterfall([
                      function (next) {
                        Certification.to(ms.issuer, next);
                      },
                      function (certs, next) {
                        var finalCerts = [];
                        certs.forEach(function (cert) {
                          if (~joiners.indexOf(cert.pubkey))
                            finalCerts.push(cert);
                        });
                        next(null, finalCerts);
                      }
                    ], callback);
                  } else {
                    // Look for certifications from WoT members
                    async.waterfall([
                      function (next) {
                        Certification.toTarget(join.idHash, next);
                      },
                      function (certs, next) {
                        var finalCerts = [];
                        var certifiers = [];
                        async.forEachSeries(certs, function (cert, callback) {
                          async.waterfall([
                            function (next) {
                              if (current) {
                                // Already exists a link not replayable yet?
                                Link.existsLinkFromOrAfterDate(cert.pubkey, cert.to, current.confirmedDate - conf.sigDelay, next);
                              }
                              else next(null, false);
                            },
                            function (exists, next) {
                              if (exists)
                                next('It already exists a similar certification written, which is not replayable yet');
                              else
                                Identity.isMember(cert.pubkey, next);
                            },
                            function (isMember, next) {
                              var doubleSignature = ~certifiers.indexOf(cert.pubkey) ? true : false;
                              if (isMember && !doubleSignature) {
                                certifiers.push(cert.pubkey);
                                finalCerts.push(cert);
                              }
                              next();
                            }
                          ], function (err) {
                            callback();
                          });
                        }, function () {
                          next(null, finalCerts);
                        });
                      }
                    ], callback);
                  }
                },
              }, next);
            },
            function (res, next){
              if (res.identity && res.block) {
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
        next();
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
              checkWoTConstraints({ number: current ? current.number + 1 : 0, joiners: theNewcomers }, newLinks, next);
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
        // console.log(finalJoinData);
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

  function createNewcomerBlock (current, joinData, updates, exclusions, lastUDBlock, transactions, done) {
    // Prevent writing joins/updates for excluded members
    exclusions.forEach(function (excluded) {
      delete updates[excluded];
      delete joinData[excluded];
    });
    var block = new Block();
    block.version = 1;
    block.currency = current ? current.currency : conf.currency;
    block.number = current ? current.number + 1 : 0;
    block.parameters = block.number > 0 ? '' : [
      conf.c, conf.dt, conf.ud0,
      conf.sigDelay, conf.sigValidity,
      conf.sigQty, conf.sigWoT, conf.msValidity,
      conf.stepMax, conf.powZeroMin, conf.dtDateMin, conf.incDateMin
    ].join(':');
    var now = moment.utc().startOf('minute').unix();
    if (current) {
      var nextDate = current.confirmedDate + conf.dtDateMin;
      now = (nextDate <= now) ? nextDate : current.confirmedDate;
    }
    block.date = now;
    block.confirmedDate = current ? current.confirmedDate : now;
    var lastDate = current ? current.date : null;
    if (lastDate && current.newDateNth == conf.incDateMin - 1 && block.date == current.date) {
      // Must change confirmedDate to the new date
      block.confirmedDate = block.date;
    }
    block.previousHash = current ? current.hash : "";
    block.previousIssuer = current ? current.issuer : "";
    if (PeeringService)
      block.issuer = PeeringService.pubkey;
    // Members merkle
    var joiners = _(joinData).keys();
    var previousCount = current ? current.membersCount : 0;
    if (joiners.length == 0 && !current) {
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
    block.excluded = exclusions;
    // Final number of members
    block.membersCount = previousCount + block.joiners.length - block.leavers.length - block.excluded.length;
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
    // Transactions
    block.transactions = [];
    transactions.forEach(function (tx) {
      block.transactions.push({ raw: tx.compact() });
    });
    // Universal Dividend
    async.waterfall([
      function (next) {
        if (lastUDBlock)
          next(null, lastUDBlock.confirmedDate);
        else
          Block.getRoot(function (err, root) {
            if (root)
              next(null, root.confirmedDate);
            else
              next(null, null);
          });
      },
      function (lastUDTime, next) {
        if (lastUDTime != null) {
          if (current && current.confirmedDateChanged && lastUDTime + conf.dt <= current.confirmedDate) {
            var M = current.monetaryMass || 0;
            var c = conf.c;
            var N = block.membersCount;
            var previousUD = lastUDBlock ? lastUDBlock.dividend : conf.ud0;
            var UD = Math.ceil(Math.max(previousUD, c * M / N));
            block.dividend = UD;
          } 
        }
        next(null, block);
      }
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
        Identity.undistanceEveryKey(next);
      },
      function (next) {
        computeObsoleteLinks(current, next);
      }
    ], done);
  }

  this.prove = function (block, sigFunc, nbZeros, done) {
    var powRegexp = new RegExp('^0{' + nbZeros + '}[^0]');
    var pow = "", sig = "", raw = "";
    var start = new Date().timestamp();
    var testsCount = 0;
    logger.debug('Generating proof-of-work with %s leading zeros...', nbZeros);
    async.whilst(
      function(){ return !pow.match(powRegexp); },
      function (next) {
        block.nonce++;
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
    var sigFunc, block, difficulty, current;
    async.waterfall([
      function (next) {
        Block.current(function (err, current) {
          if (err)
            next('Skipping', null, 'Waiting for a root block before computing new blocks');
          else
            next(null, current);
        });
      },
      function (theCurrent, next) {
        current = theCurrent;
        var lastIssuedByUs = current.issuer == PeeringService.pubkey;
        if (lastIssuedByUs && conf.powDelay && !computationTimeoutDone) {
          computationTimeoutDone = true;
          computationTimeout = setTimeout(function () {
            if (computeNextCallback)
              computeNextCallback();
          }, conf.powDelay*1000);
          next('Skipping', null, 'Waiting ' + conf.powDelay + 's before starting computing next block...');
          return;
        }
        else next();
      },
      function (next){
        if (!current) {
          next(null, null);
          return;
        } else {
          async.parallel({
            // data: function(callback){
            //   findNewData(callback);
            // },
            block: function(callback){
              BlockchainService.generateNext(callback);
            },
            signature: function(callback){
              signature(conf.salt, conf.passwd, callback);
            },
            trial: function (callback) {
              globalValidator(conf, blockchainDao(conn, block)).getTrialLevel(PeeringService.pubkey, callback);
            }
          }, next);
        }
      },
      function (res, next){
        if (!res) {
          next(null, null, 'Waiting for a root block before computing new blocks');
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
    var joinData = {};
    var exclusions = [];
    var current = null;
    async.waterfall([
      function (next){
        // Second, check for newcomers
        Block.current(function (err, currentBlock) {
          current = currentBlock;
            next();
        });
      },
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
        findNewcomers(current, withEnoughCerts, checkingWoTFunc, next);
      },
      function (current, newWoT, theJoinData, otherUpdates, next){
        // Merges updates
        _(otherUpdates).keys().forEach(function(fpr){
          if (!updates[fpr])
            updates[fpr] = otherUpdates[fpr];
          else
            updates[fpr] = updates[fpr].concat(otherUpdates[fpr]);
        });
        joinData = theJoinData;
        next();
      },
      function (next) {
        // First, check for members' exclusions
        Identity.getToBeKicked(next);
      },
      function (toBeKicked, next) {
        toBeKicked.forEach(function (idty) {
          exclusions.push(idty.pubkey);
        });
        next(null, { "joinData": joinData, "updates": updates, "exclusions": exclusions });
      }
    ], done);
  }

  function withEnoughCerts (preJoinData, done) {
    var joinData = {};
    var newcomers = _(preJoinData).keys();
    var uids = [];
    async.forEachSeries(newcomers, function (newcomer, callback) {
      async.waterfall([
        function (next){
          var newLinks = {};
          newLinks[newcomer] = [];
          preJoinData[newcomer].certs.forEach(function (cert) {
            newLinks[newcomer].push(cert.pubkey);
          });
          checkHaveEnoughLinks(newcomer, newLinks, next);
        },
        function (next){
          joinData[newcomer] = preJoinData[newcomer];
          next();
        },
      ], function (err) {
        callback(null);
      });
    }, function (err) {
      done(null, joinData);
    });
  }
}
