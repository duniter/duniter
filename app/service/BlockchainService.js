var async           = require('async');
var _               = require('underscore');
var merkle          = require('merkle');
var sha1            = require('sha1');
var moment          = require('moment');
var inquirer        = require('inquirer');
var childProcess    = require('child_process');
var usage           = require('usage');
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

module.exports.get = function (conn, conf, dal, PeeringService) {
  return new BlockchainService(conn, conf, dal, PeeringService);
};

var blockFifo = async.queue(function (task, callback) {
  task(callback);
}, 1);

var powFifo = async.queue(function (task, callback) {
  task(callback);
}, 1);

var statQueue = async.queue(function (task, callback) {
  task(callback);
}, 1);

// Callback used as a semaphore to sync block reception & PoW computation
var newKeyblockCallback = null;

// Callback used to start again computation of next PoW
var computeNextCallback = null;

// Flag telling if computation has started
var computationActivated = false;

// Timeout var for delaying computation of next block
var computationTimeout = null;

// Flag for saying if timeout was already waited
var computationTimeoutDone = false;

function BlockchainService (conn, conf, dal, PeeringService) {

  var BlockchainService = this;

  var lastGeneratedWasWrong = false;
  this.pair = null;

  var Identity      = conn.model('Identity');
  var Certification = conn.model('Certification');
  var Membership    = conn.model('Membership');
  var Block         = require('../lib/entity/block');
  var Link          = require('../lib/entity/link');
  var Source        = conn.model('Source');
  var Transaction   = conn.model('Transaction');
  var Configuration = conn.model('Configuration');
  var BlockStat     = conn.model('BlockStat');

  this.load = function (done) {
    done();
  };

  this.current = function (done) {
    dal.getCurrentBlockOrNull(done);
  };

  this.promoted = function (number, done) {
    dal.getPromotedOrNull(number, done);
  };

  this.setKeyPair = function(keypair) {
    this.pair = keypair;
  };

  this.submitMembership = function (ms, done) {
    var entry = new Membership(ms);
    var globalValidation = globalValidator(conf, blockchainDao(conn, null, dal));
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
          // JOIN
          next();
        }
        else if (isMember && !isJoin) {
          // LEAVE
          next();
        } else {
          if (isJoin)
            // RENEW
            next();
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
      var block = new Block(obj);
      var currentBlock = null;
      var localValidation = localValidator(conf);
      var globalValidation = globalValidator(conf, blockchainDao(conn, block, dal));
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
        }
      ], function (err) {
        var eligibleSelfBlock = currentBlock && currentBlock.number == block.number - 1 && block.issuer == PeeringService.pubkey;
        if (err && eligibleSelfBlock) {
          lastGeneratedWasWrong = true;
        } else if (eligibleSelfBlock) {
          lastGeneratedWasWrong = false;
        }
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
      }
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
      var newcomers = [];
      var ofMembers = [];
      // other blocks may introduce unstability with new members
      async.waterfall([
        function (next) {
          Identity.getMembers(next);
        },
        function (members, next) {
          async.forEachSeries(members, function (m, callback) {
            async.waterfall([
              function (next) {
                dal.getValidLinksFrom(m.pubkey, next);
              },
              function (links, next) {
                // Only test agains members who make enough signatures
                if (links.length >= conf.sigWoT) {
                  ofMembers.push(m.pubkey);
                }
                next();
              }
            ], callback);
          }, next);
        },
        function (next) {
          block.joiners.forEach(function (inlineMS) {
            var fpr = inlineMS.split(':')[0];
            newcomers.push(fpr);
            ofMembers.push(fpr);
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
                  globalValidator(conf, blockchainDao(conn, block, dal)).isOver3Hops(newcomer, ofMembers, newLinks, next);
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
        dal.currentValidLinks(target, next);
      },
      function (links, next){
        var count = links.length;
        if (newLinks[target] && newLinks[target].length)
          count += newLinks[target].length;
        next(count < conf.sigQty && 'Key ' + target + ' does not have enough links (' + count + '/' + conf.sigQty + ')');
      }
    ], done);
  }

  function updateBlocksComputedVars (current, block, done) {
    // Monetary Mass update
    if (current) {
      block.monetaryMass = (current.monetaryMass || 0) + block.dividend*block.membersCount;
    }
    // UD Time update
    if (block.number == 0) {
      block.UDTime = block.medianTime; // Root = first UD time
      done();
    }
    else if (block.dividend) {
      async.waterfall([
        function (next) {
          async.parallel({
            last: function (next) {
              blockchainDao(conn, block, dal).getLastUDBlock(next);
            },
            root: function (next) {
              blockchainDao(conn, block, dal).getBlock(0, next);
            }
          }, next);
        },
        function (res, next) {
          var last = res.last;
          var root = res.root;
          block.UDTime = conf.dt + (last ? last['UDTime'] : root['UDTime']);
          next();
        }
      ], done);
    }
    else done();
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
                idty.hash = (sha1(rawer.getIdentity(idty)) + "").toUpperCase();
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
              Identity.getWritten(ms.pubkey, next);
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
              Identity.getWritten(ms.pubkey, next);
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
              Identity.getWritten(ms.pubkey, next);
            },
            function (idty, next){
              idty.currentMSN = block.number;
              idty.member = true;
              idty.leaving = true;
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
              Identity.getWritten(pubkey, next);
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
          Identity.getWritten(cert.to, next);
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
    async.forEachSeries(['joiners', 'actives', 'leavers'], function (prop, callback1) {
      async.forEach(block[prop], function(inlineJoin, callback){
        var ms = Membership.fromInline(inlineJoin, prop == 'leavers' ? 'OUT' : 'IN');
        async.waterfall([
          function (next){
            Identity.getWritten(ms.issuer, next);
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
          }
        ], callback);
      }, callback1);
    }, done);
  }

  function updateLinks (block, done) {
    async.forEach(block.certifications, function(inlineCert, callback){
      var cert = Certification.fromInline(inlineCert);
      dal.saveLink(
        new Link({
          source: cert.from,
          target: cert.to,
          timestamp: block.medianTime,
          obsolete: false
        }), function (err) {
        callback(err);
      });
    }, done);
  }

  function saveBlockData (current, block, done) {
    logger.info('Block #' + block.number + ' added to the blockchain');
    async.waterfall([
      function (next) {
        updateBlocksComputedVars(current, block, next);
      },
      function (next) {
        // Saves the block (DAL)
        dal.saveBlock(block, next);
      },
      function (next) {
        var b = new (conn.model('Block'))(block);
        b.save(function(err) {
          next(err);
        })
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
      }
    ], function (err) {
      done(err, block);
    });
  }

  function saveParametersForRootBlock (block, done) {
    if (block.parameters) {
      var sp = block.parameters.split(':');

      conf.c                = parseFloat(sp[0]);
      conf.dt               = parseInt(sp[1]);
      conf.ud0              = parseInt(sp[2]);
      conf.sigDelay         = parseInt(sp[3]);
      conf.sigValidity      = parseInt(sp[4]);
      conf.sigQty           = parseInt(sp[5]);
      conf.sigWoT           = parseInt(sp[6]);
      conf.msValidity       = parseInt(sp[7]);
      conf.stepMax          = parseInt(sp[8]);
      conf.medianTimeBlocks = parseInt(sp[9]);
      conf.avgGenTime       = parseInt(sp[10]);
      conf.dtDiffEval       = parseInt(sp[11]);
      conf.blocksRot        = parseInt(sp[12]);
      conf.percentRot       = parseFloat(sp[13]);
      conf.currency         = block.currency;
      conf.save(function (err) {
        done(err);
      });
    }
    else done();
  }

  function computeObsoleteLinks (block, done) {
    async.waterfall([
      function (next){
        dal.obsoletesLinks(block.medianTime - conf.sigValidity, next);
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
                }
              }, next);
            },
            function (res, next){
              var notEnoughLinks = res.enoughLinks;
              Identity.setKicked(pubkey, idty.getTargetHash(), notEnoughLinks ? true : false, next);
            }
          ], callback);
        }, next);
      }
    ], done);
  }

  function computeObsoleteMemberships (block, done) {
    async.waterfall([
      function (next){
        dal.getLastBeforeOrAt(block.medianTime - conf.msValidity, next);
      },
      function (last, next){
        if (last)
          Identity.kickWithOutdatedMemberships(last.number, next);
        else
          next();
      }
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
                dal.existsLinkFromOrAfterDate(cert.pubkey, cert.to, current.medianTime - conf.sigDelay, next);
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
              // Certified must be a member and non-leaver
              Identity.isMembeAndNonLeaverOrError(cert.to, next);
            },
            function (next){
              updatesToFrom[cert.to] = updatesToFrom[cert.to] || [];
              updates[cert.to] = updates[cert.to] || [];
              if (updatesToFrom[cert.to].indexOf(cert.pubkey) == -1) {
                updates[cert.to].push(cert);
                updatesToFrom[cert.to].push(cert.pubkey);
              }
              next();
            }
          ], function () {
            callback();
          });
        }, next);
      }
    ], function (err) {
      done(err, updates);
    });
  }

  /**
  this.generateNewcomers = function (done) {
  * Generate a "newcomers" block
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
    async.waterfall([
      function (next) {
        BlockchainService.current(next);
      },
      function (block, next) {
        if (!block)
          BlockchainService.generateNewcomersBlock(filteringFunc, checkingWoTFunc, next);
        else
          next('Cannot generate root block: it already exists.');
      }
    ], done);
  };

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
  * Generate a "newcomers" block
  */
  this.generateNewcomersBlock = function (filteringFunc, checkingWoTFunc, done) {
    var withoutUpdates = function(updatesDone) {
      updatesDone(null, {});
    };
    BlockchainService.generateNextBlock(withoutUpdates, filteringFunc, checkingWoTFunc, done);
  };

  /**
  * Generate next block, gathering both updates & newcomers
  */
  this.generateNextBlock = function (findUpdateFunc, filteringFunc, checkingWoTFunc, done) {
    var updates = {};
    var exclusions = [];
    var current = null;
    var lastUDBlock = null;
    var transactions = [];
    var joinData, leaveData;
    async.waterfall([
      function (next){
        dal.getCurrentBlockOrNull(next);
      },
      function (currentBlock, next){
        current = currentBlock;
        dal.lastUDBlock(next);
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
        findNewcomersAndLeavers(current, filteringFunc, checkingWoTFunc, next);
      },
      function (current, newWoT, theJoinData, theLeaveData, otherUpdates, next){
        joinData = theJoinData;
        leaveData = theLeaveData;
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
        var globalValidation = globalValidator(conf, blockchainDao(conn, null, dal));
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
          ], function () {
            callback();
          });
        }, next);
      },
      function (next) {
        // Create the block
        createNewcomerBlock(current, joinData, leaveData, updates, exclusions, lastUDBlock, transactions, next);
      }
    ], done);
  };

  /**
  * Generate next block, gathering both updates & newcomers
  */
  this.generateEmptyNextBlock = function (done) {
    var updates = {};
    var exclusions = [];
    var current = null;
    var lastUDBlock = null;
    var transactions = [];
    var joinData = {}, leaveData = {};
    async.waterfall([
      function (){
        dal.getCurrentBlockOrNull(done);
      },
      function (currentBlock, next){
        current = currentBlock;
        dal.lastUDBlock(next);
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
        next();
      },
      function (next) {
        // Create the block
        createNewcomerBlock(current, joinData, leaveData, updates, exclusions, lastUDBlock, transactions, next);
      }
    ], done);
  };

  function findNewcomersAndLeavers (current, filteringFunc, checkingWoTFunc, done) {
    async.parallel({
      newcomers: function(callback){
        findNewcomers(current, filteringFunc, checkingWoTFunc, callback);
      },
      leavers: function(callback){
        findLeavers(current, callback);
      }
    }, function(err, res) {
      var current = res.newcomers[0];
      var newWoTMembers = res.newcomers[1];
      var finalJoinData = res.newcomers[2];
      var updates = res.newcomers[3];
      done(err, current, newWoTMembers, finalJoinData, res.leavers, updates);
    });
  }

  function findLeavers (current, done) {
    var leaveData = {};
    async.waterfall([
      function (next){
        Membership.find({ membership: 'OUT', certts: { $gt: 0 }, userid: { $exists: true } }, next);
      },
      function (mss, next){
        var leavers = [];
        mss.forEach(function (ms) {
          leavers.push(ms.issuer);
        });
        async.forEach(mss, function(ms, callback){
          var leave = { identity: null, ms: ms, key: null, idHash: '' };
          leave.idHash = (sha1(ms.userid + ms.certts.timestamp() + ms.issuer) + "").toUpperCase();
          async.waterfall([
            function (next){
              async.parallel({
                block: function (callback) {
                  if (current) {
                    dal.getBlockOrNull(ms.number, function (err, basedBlock) {
                      callback(null, err ? null : basedBlock);
                    });
                  } else {
                    callback(null, {});
                  }
                },
                identity: function(callback){
                  Identity.getByHash(leave.idHash, callback);
                }
              }, next);
            },
            function (res, next){
              if (res.identity && res.block && res.identity.currentMSN < leave.ms.number && res.identity.member) {
                // MS + matching cert are found
                leave.identity = res.identity;
                leaveData[res.identity.pubkey] = leave;
              }
              next();
            }
          ], callback);
        }, next);
      },
      function (next) {
        next(null, leaveData);
      }
    ], done);
  }

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
          join.idHash = (sha1(ms.userid + ms.certts.timestamp() + ms.issuer) + "").toUpperCase();
          async.waterfall([
            function (next){
              async.parallel({
                block: function (callback) {
                  if (current) {
                    dal.getBlockOrNull(ms.number, function (err, basedBlock) {
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
                        Certification.notLinkedToTarget(join.idHash, next);
                      },
                      function (certs, next) {
                        var finalCerts = [];
                        var certifiers = [];
                        async.forEachSeries(certs, function (cert, callback) {
                          async.waterfall([
                            function (next) {
                              if (current) {
                                // Already exists a link not replayable yet?
                                dal.existsLinkFromOrAfterDate(cert.pubkey, cert.to, current.medianTime - conf.sigDelay, next);
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
                          ], function () {
                            callback();
                          });
                        }, function () {
                          next(null, finalCerts);
                        });
                      }
                    ], callback);
                  }
                }
              }, next);
            },
            function (res, next){
              if (res.identity && res.block && res.identity.currentMSN < join.ms.number) {
                // MS + matching cert are found
                join.identity = res.identity;
                join.certs = res.certs;
                // join.wotCerts = res.wotCerts;
                preJoinData[res.identity.pubkey] = join;
              }
              next();
            }
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
          // Check WoT stability
          async.waterfall([
            function (next){
              computeNewLinks(theNewcomers, joinData, updates, next);
            },
            function (newLinks, next){
              checkWoTConstraints({ number: current ? current.number + 1 : 0, joiners: theNewcomers }, newLinks, next);
            }
          ], onceChecked);
        }, function (err, realNewcomers) {
          async.waterfall([
            function (next){
              computeNewLinks(realNewcomers, joinData, updates, next);
            },
            function (newLinks, next){
              var newWoT = wotMembers.concat(realNewcomers);
              next(err, realNewcomers, newLinks, newWoT);
            }
          ], next);
        });
      },
      function (realNewcomers, newLinks, newWoT, next) {
        var finalJoinData = {};
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
                }
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
      }
    ], function (err) {
      done(err, newLinks);
    });
  }

  function createNewcomerBlock (current, joinData, leaveData, updates, exclusions, lastUDBlock, transactions, done) {
    // Prevent writing joins/updates for excluded members
    exclusions.forEach(function (excluded) {
      delete updates[excluded];
      delete joinData[excluded];
      delete leaveData[excluded];
    });
    _(leaveData).keys().forEach(function (leaver) {
      delete updates[leaver];
      delete joinData[leaver];
    });
    var block = new Block();
    block.version = 1;
    block.currency = current ? current.currency : conf.currency;
    block.number = current ? current.number + 1 : 0;
    block.parameters = block.number > 0 ? '' : [
      conf.c, conf.dt, conf.ud0,
      conf.sigDelay, conf.sigValidity,
      conf.sigQty, conf.sigWoT, conf.msValidity,
      conf.stepMax, conf.medianTimeBlocks, conf.avgGenTime, conf.dtDiffEval,
      conf.blocksRot, (conf.percentRot == 1 ? "1.0" : conf.percentRot) 
    ].join(':');
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
      // Identities only for never-have-been members
      if (!data.identity.member && !data.identity.wasMember) {
        block.identities.push(data.identity.inline());
      }
      // Join only for non-members
      if (!data.identity.member) {
        block.joiners.push(data.ms.inline());
      }
    });
    // Renewed
    block.actives = [];
    joiners.forEach(function(joiner){
      var data = joinData[joiner];
      // Join only for non-members
      if (data.identity.member) {
        block.actives.push(data.ms.inline());
      }
    });
    // Leavers
    block.leavers = [];
    var leavers = _(leaveData).keys();
    leavers.forEach(function(leaver){
      var data = leaveData[leaver];
      // Join only for non-members
      if (data.identity.member) {
        block.leavers.push(data.ms.inline());
      }
    });
    // Kicked people
    block.excluded = exclusions;
    // Final number of members
    block.membersCount = previousCount + block.joiners.length - block.excluded.length;

    //----- Certifications -----
    var certifiers = []; // Since we cannot have two certifications from same issuer/block, unless block# == 0

    // Certifications from the WoT, to newcomers
    block.certifications = [];
    joiners.forEach(function(joiner){
      var data = joinData[joiner];
      var doubleCerts = false;
      data.certs.forEach(function(cert){
        doubleCerts = doubleCerts || (~certifiers.indexOf(cert.pubkey) ? true : false);
      });
      if (!doubleCerts || block.number == 0) {
        data.certs.forEach(function(cert){
          block.certifications.push(cert.inline());
          certifiers.push(cert.pubkey);
        });
      }
    });
    // Certifications from the WoT, to the WoT
    _(updates).keys().forEach(function(certifiedMember){
      var certs = updates[certifiedMember];
      certs.forEach(function(cert){
        if (certifiers.indexOf(cert.pubkey) == -1) {
          block.certifications.push(cert.inline());
          certifiers.push(cert.pubkey);
        }
      });
    });
    // Transactions
    block.transactions = [];
    transactions.forEach(function (tx) {
      block.transactions.push({ raw: tx.compact() });
    });
    async.waterfall([
      function (next) {
        // PoWMin
        if (block.number == 0)
          next(null, 0); // Root difficulty is given by manually written block
        else
          globalValidator(conf, blockchainDao(conn, block, dal)).getPoWMin(block.number, next);
      },
      function (powMin, next) {
        block.powMin = powMin;
        // MedianTime
        if (block.number == 0)
          next(null, 0);
        else
          globalValidator(conf, blockchainDao(conn, block, dal)).getMedianTime(block.number, next);
      },
      function (medianTime, next) {
        block.medianTime = current ? medianTime : moment.utc().unix() - conf.rootoffset;
        next();
      },
      function (next) {
        // Universal Dividend
        if (lastUDBlock)
          next(null, lastUDBlock.UDTime);
        else
          dal.getRootBlock(function (err, root) {
            if (root)
              next(null, root.medianTime);
            else
              next(null, null);
          });
      },
      function (lastUDTime, next) {
        if (lastUDTime != null) {
          if (current && lastUDTime + conf.dt <= block.medianTime) {
            var M = current.monetaryMass || 0;
            var c = conf.c;
            var N = block.membersCount;
            var previousUD = lastUDBlock ? lastUDBlock.dividend : conf.ud0;
            block.dividend = Math.ceil(Math.max(previousUD, c * M / N));
          } 
        }
        next(null, block);
      }
    ], done);
  }

  var debug = process.execArgv.toString().indexOf('--debug') !== -1;
  if(debug) {
    //Set an unused port number.
    process.execArgv = [];
  }
  var powWorker;

  this.getPoWProcessStats = function(done) {
    if (powWorker)
      usage.lookup(powWorker.powProcess.pid, done);
    else
      done(null, { memory: 0, cpu: 0 });
  };

  var askedStop = null;

  this.stopProof = function(done) {
    if (!newKeyblockCallback) {
      askedStop = 'Stopping node.';
      newKeyblockCallback = function() {
        newKeyblockCallback = null;
        // Definitely kill the process for this BlockchainService instance
        if (powWorker) {
          powWorker.kill();
        }
        done();
      }
    }
    else done();
  };

  this.prove = function (block, sigFunc, nbZeros, done) {

    if (!powWorker) {
      powWorker = new Worker();
    }
    if (block.number == 0) {
      // On initial block, difficulty is the one given manually
      block.powMin = nbZeros;
    }
    // Start
    powWorker.setOnPoW(function(err, block) {
      done(null, new Block(block));
    });
    block.nonce = 0;
    powWorker.powProcess.send({ conf: conf, block: block, zeros: nbZeros, pair: BlockchainService.pair });
    logger.info('Generating proof-of-work with %s leading zeros... (CPU usage set to %s%)', nbZeros, (conf.cpu*100).toFixed(0));
  };

  function Worker() {

    var stopped = true;
    var that = this;
    var onPoWFound = function() { throw 'Proof-of-work found, but no listener is attached.' };
    that.powProcess = childProcess.fork(__dirname + '/../lib/proof');
    var start = null;

    that.powProcess.on('message', function(msg) {
      var block = msg.block;
      if (stopped) {
        // Started...
        start = new Date();
        stopped = false;
      }
      if (!stopped && msg.found) {
        var end = new Date();
        var duration = (end.getTime() - start.getTime());
        var testsPerSecond = (1000/duration * msg.testsCount).toFixed(2);
        logger.debug('Done: %s in %ss (%s tests, ~%s tests/s)', msg.pow, (duration/1000).toFixed(2), msg.testsCount, testsPerSecond);
        stopped = true;
        start = null;
        onPoWFound(null, block);
      } else if (!stopped && msg.testsPerRound) {
        logger.info('Mesured max speed is ~%s tests/s. Proof will try with ~%s tests/s.', msg.testsPerSecond, msg.testsPerRound);
      } else if (!stopped && msg.nonce > block.nonce + constants.PROOF_OF_WORK.RELEASE_MEMORY) {
        // Reset fork process (release memory)...
        //logger.debug('Release mem... lastCount = %s, nonce = %s', block.nonce);
        block.nonce = msg.nonce;
        that.powProcess.kill();
        that.powProcess = childProcess.fork(__dirname + '/../lib/proof');
        that.powProcess.send({ conf: conf, block: block, zeros: msg.nbZeros, pair: BlockchainService.pair });
      } else if (!stopped) {
        // Continue...
        //console.log('Already made: %s tests...', msg.nonce);
        // Look for incoming block
        if (newKeyblockCallback) {
          stopped = true;
          that.powProcess.kill();
          that.powProcess = childProcess.fork(__dirname + '/../lib/proof');
          onPoWFound();
          logger.debug('Proof-of-work computation canceled.');
          start = null;
          newKeyblockCallback();
        }
      }
    });

    this.kill = function() {
      if (that.powProcess) {
        that.powProcess.kill();
        that.powProcess = null;
      }
    };

    this.setOnPoW = function(onPoW) {
      onPoWFound = onPoW;
    };
  }

  this.startGeneration = function (done) {
    if (!conf.participate) return;
    if (!PeeringService) {
      done('Needed peering service activated.');
      return;
    }
    askedStop = null;
    computationActivated = true;
    if (computationTimeout) {
      clearTimeout(computationTimeout);
      computationTimeout = null;
    }
    var block, difficulty, current;
    async.waterfall([
      function (next) {
        Identity.isMember(PeeringService.pubkey, function (err, isMember) {
          if (err || !isMember)
            next('Skipping', null, 'Local node is not a member. Waiting to be a member before computing a block.');
          else
            next();
        });
      },
      function (next) {
        dal.getCurrentBlockOrNull(function (err, current) {
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
        }
        else next();
      },
      function (next){
        if (!current) {
          next(null, null);
        } else {
          async.parallel({
            // data: function(callback){
            //   findNewData(callback);
            // },
            block: function(callback){
              if (lastGeneratedWasWrong) {
                BlockchainService.generateEmptyNextBlock(callback);
              } else {
                BlockchainService.generateNext(callback);
              }
            },
            signature: function(callback){
              signature.sync(BlockchainService.pair, callback);
            },
            trial: function (callback) {
              globalValidator(conf, blockchainDao(conn, block, dal)).getTrialLevel(PeeringService.pubkey, callback);
            }
          }, next);
        }
      },
      function (res, next){
        if (!res) {
          next(null, null, 'Waiting for a root block before computing new blocks');
        } else if (res.trial > (current.powMin + 1)) {
          next(null, null, 'Too high difficulty: waiting for other members to write next block');
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
        done(err || askedStop, proofBlock);
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
        dal.getCurrentBlockOrNull(function (err, currentBlock) {
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
        findNewcomersAndLeavers(current, withEnoughCerts, checkingWoTFunc, next);
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
        }
      ], function () {
        callback(null);
      });
    }, function () {
      done(null, joinData);
    });
  }

  this.addStatComputing = function () {
    var tests = {
      'newcomers': 'identities',
      'certs': 'certifications',
      'joiners': 'joiners',
      'actives': 'actives',
      'leavers': 'leavers',
      'excluded': 'excluded',
      'ud': 'dividend',
      'tx': 'transactions'
    };
    statQueue.push(function (sent) {
      //logger.debug('Computing stats...');
      async.forEachSeries(['newcomers', 'certs', 'joiners', 'actives', 'leavers', 'excluded', 'ud', 'tx'], function (statName, callback) {
        async.waterfall([
          function (next) {
            async.parallel({
              stat: function (next) {
                BlockStat.getStat(statName, next);
              },
              current: function (next) {
                BlockchainService.current(next);
              }
            }, next);
          },
          function (res, next) {
            var stat = res.stat;
            var current = res.current;
            // Create stat if it does not exist
            if (stat == null) {
              stat = new BlockStat({ statName: statName, blocks: [], lastParsedBlock: -1 });
            }
            // Compute new stat
            async.forEachSeries(_.range(stat.lastParsedBlock + 1, (current ? current.number : -1) + 1), function (blockNumber, callback) {
              // console.log('Stat', statName, ': tested block#' + blockNumber);
              async.waterfall([
                function (next) {
                  dal.getBlockOrNull(blockNumber, next);
                },
                function (block, next) {
                  var testProperty = tests[statName];
                  var value = block[testProperty];
                  var isPositiveValue = value && typeof value != 'object';
                  var isNonEmptyArray = value && typeof value == 'object' && value.length > 0;
                  if (isPositiveValue || isNonEmptyArray) {
                    stat.blocks.push(blockNumber);
                  }
                  stat.lastParsedBlock = blockNumber;
                  next();
                }
              ], callback);
            }, function (err) {
              next(err, stat);
            });
          },
          function (stat, next) {
            stat.save(function (err) {
              next(err);
            });
          }
        ], callback);
      }, function () {
        //logger.debug('Computing stats: done!');
        sent();
      });
    });
    statQueue.push(function (sent) {
      //logger.debug('Computing memberships...');
      async.forEachSeries(['memberships'], function (statName, callback) {
        async.waterfall([
          function (next) {
            async.parallel({
              stat: function (next) {
                BlockStat.getStat(statName, next);
              },
              current: function (next) {
                BlockchainService.current(next);
              }
            }, next);
          },
          function (res, next) {
            var stat = res.stat;
            var current = res.current;
            // Create stat if it does not exist
            if (stat == null) {
              stat = new BlockStat({ statName: statName, blocks: [], lastParsedBlock: -1 });
            }
            async.waterfall([
              function (next) {
                // Reset memberships if first computation
                if (stat.lastParsedBlock == -1) {
                  Identity.resetMemberships(next);
                } else {
                  next();
                }
              },
              function (next) {
                // Compute new stat
                async.forEachSeries(_.range(stat.lastParsedBlock + 1, (current ? current.number : -1) + 1), function (blockNumber, callback) {
                  // console.log('Stat', statName, ': tested block#' + blockNumber);
                  async.waterfall([
                    function (next) {
                      dal.getBlockOrNull(blockNumber, next);
                    },
                    function (block, next) {
                      async.forEachSeries(['joiners', 'actives', 'leavers'], function (category, callback) {
                        async.forEachSeries(block[category], function (inlineMS, callback2) {
                          var ms = Membership.fromInline(inlineMS, category == 'leavers' ? 'OUT' : 'IN', conf.currency);
                          async.waterfall([
                            function (next) {
                              Identity.getWritten(ms.issuer, next);
                            },
                            function (member, next) {
                              member.memberships.push({
                                "version": ms.version,
                                "membership": "IN",
                                "inBlock": block.number,
                                "blockNumber": ms.number,
                                "blockHash": ms.fpr
                              });
                              member.save(function (err) {
                                next(err);
                              });
                            }
                          ], callback2);
                        }, callback);
                      }, next);
                    },
                    function (next) {
                      stat.lastParsedBlock = blockNumber;
                      next();
                    }
                  ], callback);
                }, function (err) {
                  next(err, stat);
                });
              }
            ], next);
          },
          function (stat, next) {
            stat.save(function (err) {
              next(err);
            });
          }
        ], callback);
      }, function () {
        //logger.debug('Computing memberships: done!');
        sent();
      });
    });
  }
}
