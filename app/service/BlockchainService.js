var async           = require('async');
var _               = require('underscore');
var Q               = require('q');
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

var cancels = [];

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
  var logger = require('../lib/logger')(dal.profile);

  var lastGeneratedWasWrong = false;
  this.pair = null;

  var Identity      = require('../lib/entity/identity');
  var Certification = require('../lib/entity/certification');
  var Membership    = require('../lib/entity/membership');
  var Block         = require('../lib/entity/block');
  var Link          = require('../lib/entity/link');
  var Source        = require('../lib/entity/source');
  var Transaction   = require('../lib/entity/transaction');

  PeeringService.setBlockchainService(this);

  this.load = function (done) {
    done();
  };

  this.current = function (done) {
    dal.getCurrentBlockOrNull(done);
  };

  this.promoted = function (number, done) {
    dal.getPromoted(number, done);
  };

  this.setKeyPair = function(keypair) {
    this.pair = keypair;
  };

  this.submitMembership = function (ms, done) {
    var entry = new Membership(ms);
    var globalValidation = globalValidator(conf, blockchainDao(conn, null, dal));
    async.waterfall([
      function (next){
        logger.info('⬇ %s %s', entry.issuer, entry.membership);
        // Get already existing Membership with same parameters
        dal.getMembershipsForHashAndIssuer(entry.hash, entry.issuer, next);
      },
      function (entries, next){
        if (entries.length > 0) {
          next('Already received membership');
        }
        else dal.isMember(entry.issuer, next);
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
        dal.saveMembership(entry, function (err) {
          next(err);
        });
      },
      function (next){
        logger.info('✔ %s %s', entry.issuer, entry.membership);
        next(null, entry);
      }
    ], done);
  };

  this.submitBlock = function (obj, doCheck, done) {
    blockFifo.push(function (sent) {
      var start = new Date();
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
          if (doCheck) {
            async.waterfall([
              function (next){
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
                BlockchainService.stopPoWThenProcessAndRestartPoW(next);
              },
              function (next) {
                saveBlockData(currentBlock, block, next);
              }
            ], next);
          } else {
            saveBlockData(currentBlock, block, next);
          }
        }
      ], function (err) {
        !err && logger.info('Block #' + block.number + ' added to the blockchain in %s ms', (new Date() - start));
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

  this.stopPoWThenProcessAndRestartPoW = function (done) {
    // If PoW computation process is waiting, trigger it
    if (computeNextCallback)
      computeNextCallback();
    if (conf.participate && !cancels.length) {
      powFifo.push(function (taskDone) {
        cancels.push(taskDone);
      });
    }
    done();
  };

  function checkIssuer (block, done) {
    async.waterfall([
      function (next){
        dal.isMember(block.issuer, next);
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

  function checkWoTConstraints (sentries, block, newLinks, done) {
    if (block.number >= 0) {
      var newcomers = [];
      var ofMembers = [].concat(sentries);
      // other blocks may introduce unstability with new members
      async.waterfall([
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
    else done('Cannot compute WoT constraint for negative block number');
  }

  function getSentryMembers(members, done) {
    var sentries = [];
    async.forEachSeries(members, function (m, callback) {
      async.waterfall([
        function (next) {
          dal.getValidLinksFrom(m.pubkey, next);
        },
        function (links, next) {
          // Only test agains members who make enough signatures
          if (links.length >= conf.sigWoT) {
            sentries.push(m.pubkey);
          }
          next();
        }
      ], callback);
    }, function(err) {
      done(err, sentries);
    });
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
          block.UDTime = conf.dt + (last ? last['UDTime'] : root['medianTime']);
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
          var idty = Identity.statics.fromInline(identity);
          var indexNb = block.identities.indexOf(identity);
          async.waterfall([
            function (next){
              // Computes the hash if not done yet
              if (!idty.hash)
                idty.hash = (sha1(rawer.getIdentity(idty)) + "").toUpperCase();
              dal.getIdentityByPubkeyAndHashOrNull(idty.pubkey, idty.getTargetHash(), next);
            },
            function (existing, next){
              if (existing) {
                idty = existing;
              }
              idty.currentMSN = block.number;
              idty.member = true;
              idty.wasMember = true;
              idty.kick = false;
              idty.indexNb = indexNb;
              dal.saveIdentity(new Identity(idty), function (err) {
                next(err);
              });
            }
          ], callback);
        }, next);
      },
      function (next) {
        // Joiners (come back)
        async.forEachSeries(block.joiners, function(inlineMS, callback){
          var ms = Identity.statics.fromInline(inlineMS);
          async.waterfall([
            function (next){
              // Necessarily exists, since we've just created them in the worst case
              dal.getWritten(ms.pubkey, next);
            },
            function (idty, next){
              idty.currentMSN = block.number;
              idty.member = true;
              idty.kick = false;
              dal.saveIdentity(new Identity(idty), function (err) {
                next(err);
              });
            }
          ], callback);
        }, next);
      },
      function (next) {
        // Actives
        async.forEachSeries(block.actives, function(inlineMS, callback){
          var ms = Identity.statics.fromInline(inlineMS);
          async.waterfall([
            function (next){
              dal.getWritten(ms.pubkey, next);
            },
            function (idty, next){
              idty.currentMSN = block.number;
              idty.member = true;
              idty.kick = false;
              dal.saveIdentity(new Identity(idty), function (err) {
                next(err);
              });
            }
          ], callback);
        }, next);
      },
      function (next) {
        // Leavers
        async.forEachSeries(block.leavers, function(inlineMS, callback){
          var ms = Identity.statics.fromInline(inlineMS);
          async.waterfall([
            function (next){
              dal.getWritten(ms.pubkey, next);
            },
            function (idty, next){
              idty.currentMSN = block.number;
              idty.member = true;
              idty.leaving = true;
              idty.kick = false;
              dal.saveIdentity(new Identity(idty), function (err) {
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
              dal.getWritten(pubkey, next);
            },
            function (idty, next) {
              idty.member = false;
              idty.kick = false;
              dal.saveIdentity(new Identity(idty), function (err) {
                next(err);
              });
            }
          ], callback);
        }, next);
      }
    ], done);
  }

  function updateCertifications (block, done) {
    async.forEachSeries(block.certifications, function(inlineCert, callback){
      var cert = Certification.statics.fromInline(inlineCert);
      var indexNb = block.certifications.indexOf(inlineCert);
      async.waterfall([
        function (next) {
          dal.getWritten(cert.to, next);
        },
        function (idty, next){
          cert.target = new Identity(idty).getTargetHash();
          dal.existsCert(cert, next);
        },
        function (existing, next) {
          if (existing) {
            cert = existing;
          }
          cert.linked = true;
          cert.block = block.number;
          cert.indexNb = indexNb;
          dal.saveCertification(new Certification(cert), function (err) {
            next(err);
          });
        }
      ], callback);
    }, done);
  }

  function updateMemberships (block, done) {
    async.forEachSeries(['joiners', 'actives', 'leavers'], function (prop, callback1) {
      async.forEach(block[prop], function(inlineJoin, callback){
        var ms = Membership.statics.fromInline(inlineJoin, prop == 'leavers' ? 'OUT' : 'IN');
        async.waterfall([
          function (next){
            dal.getWritten(ms.issuer, next);
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
            dal.deleteIfExists(ms, function (err) {
              next(err);
            });
          }
        ], callback);
      }, callback1);
    }, done);
  }

  function updateLinks (block, done) {
    async.forEach(block.certifications, function(inlineCert, callback){
      var cert = Certification.statics.fromInline(inlineCert);
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
    async.waterfall([
      function (next) {
        updateBlocksComputedVars(current, block, next);
      },
      function (next) {
        // Saves the block (DAL)
        dal.saveBlock(block, next);
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
      dal.saveConf(conf, function (err) {
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
        dal.getMembers(next);
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
              dal.setKicked(pubkey, new Identity(idty).getTargetHash(), notEnoughLinks ? true : false, next);
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
          dal.kickWithOutdatedMemberships(last.number, next);
        else
          next();
      }
    ], done);
  }

  function updateTransactionSources (block, done) {
    async.parallel([
      function (next) {
        if (block.dividend) {
          async.waterfall([
            function (next) {
              dal.getMembers(next);
            },
            function (idties, next) {
              async.forEachSeries(idties, function (idty, callback) {
                dal.saveSource(new Source({
                  'pubkey': idty.pubkey,
                  'type': 'D',
                  'number': block.number,
                  'time': block.medianTime,
                  'fingerprint': block.hash,
                  'amount': block.dividend,
                  'consumed': 0
                }), function (err) {
                  callback(err);
                });
              }, next);
            }
          ], next);
        }
        else next();
      },
      function (next) {
        async.forEachSeries(block.transactions, function (json, callback) {
          var obj = json;
          obj.version = 1;
          obj.currency = block.currency;
          obj.issuers = json.signatories;
          var tx = new Transaction(obj);
          var txObj = tx.getTransaction();
          var txHash = tx.getHash(true);
          async.parallel([
            function (next) {
              async.forEachSeries(txObj.inputs, function (input, callback) {
                dal.setConsumedSource(input.type, input.pubkey, input.number, input.fingerprint, input.amount, callback);
              }, next);
            },
            function (next) {
              async.forEachSeries(txObj.outputs, function (output, callback) {
                dal.saveSource(new Source({
                  'pubkey': output.pubkey,
                  'type': 'T',
                  'number': block.number,
                  'fingerprint': txHash,
                  'amount': output.amount,
                  'consumed': 0
                }), function (err) {
                  callback(err);
                });
              }, next);
            }
          ], callback);
        }, next);
      }
    ], function (err) {
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
      dal.removeTxByHash(txHash, callback);
    }, done);
  }

  /**
   * Generates root block with manual selection of root members.
   * @param done
   */
  this.generateManualRoot = function (done) {
    async.waterfall([
      function (next) {
        BlockchainService.current(next);
      },
      function (block, next) {
        if (!block)
        BlockchainService.generateNextBlock(new ManualRootGenerator(), next);
        else
          next('Cannot generate root block: it already exists.');
      }
    ], done);
  };

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

  /**
   * Generates next block, finding newcomers, renewers, leavers, certs, transactions, etc.
   * @param done Callback.
   */
  this.generateNext = function (done) {
    BlockchainService.generateNextBlock(new NextBlockGenerator(conf, dal), done);
  };

  /**
  * Generate next block, gathering both updates & newcomers
  */
  this.generateNextBlock = function (generator, done) {
    return prepareNextBlock()
      .spread(function(current, lastUDBlock, exclusions){
        return Q.all([
          generator.findNewCertsFromWoT(current),
          findNewcomersAndLeavers(current, generator.filterJoiners),
          findTransactions()
        ])
          .spread(function(newCertsFromWoT, newcomersLeavers, transactions) {
             var joinData = newcomersLeavers[2];
             var leaveData = newcomersLeavers[3];
             var newCertsFromNewcomers = newcomersLeavers[4];
             // Merges updates
             _(newCertsFromNewcomers).keys().forEach(function(newcomer){
               // TODO: Bizarre ..
               if (!newCertsFromWoT[newcomer]){
                 newCertsFromWoT[newcomer] = newCertsFromNewcomers[newcomer];
               }
               else {
                 newCertsFromWoT[newcomer] = newCertsFromWoT[newcomer].concat(newCertsFromNewcomers[newcomer]);
               }
             });
            // Create the block
            return Q.Promise(function(resolve, reject){
              createBlock(current, joinData, leaveData, newCertsFromWoT, exclusions, lastUDBlock, transactions, function(err, block) {
                err ? reject(err) : resolve(block);
              });
            });
          });
      })
      .then(function(block) {
        done(null, block);
      })
      .fail(done);
  };

  /**
  * Generate next block, gathering both updates & newcomers
  */
  this.generateEmptyNextBlock = function (done) {
    return prepareNextBlock()
      .spread(function(current, lastUDBlock, exclusions){
        createBlock(current, {}, {}, {}, exclusions, lastUDBlock, [], next);
      })
      .fail(done);
  };

  function prepareNextBlock() {
    return Q.all([
      dal.getCurrentBlockOrNull(),
      dal.lastUDBlock(),
      dal.getToBeKicked()
    ])
      .spread(function(current, lastUDBlock, exclusions) {
        return Q.all([
          current,
          lastUDBlock,
          _.pluck(exclusions, 'pubkey')
        ]);
      });
  }

  function findTransactions() {
    return dal.findAllWaitingTransactions()
      .then(function (txs) {
        var transactions = [];
        var passingTxs = [];
        var localValidation = localValidator(conf);
        var globalValidation = globalValidator(conf, blockchainDao(conn, null, dal));
        return Q.Promise(function(resolve, reject){

          async.forEachSeries(txs, function (rawtx, callback) {
            var tx = new Transaction(rawtx, conf.currency);
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
              if (err) {
                logger.error(err);
                dal.removeTxByHash(extractedTX.hash, callback);
              }
              else {
                logger.info('Transaction added to block');
                callback();
              }
            });
          }, function(err) {
            err ? reject(err) : resolve(transactions);
          });
        });
      });
  }

  function findNewcomersAndLeavers (current, filteringFunc) {
    return Q.Promise(function(resolve, reject){
      async.parallel({
        newcomers: function(callback){
          findNewcomers(current, filteringFunc, callback);
        },
        leavers: function(callback){
          findLeavers(current, callback);
        }
      }, function(err, res) {
        var current = res.newcomers[0];
        var newWoTMembers = res.newcomers[1];
        var finalJoinData = res.newcomers[2];
        var updates = res.newcomers[3];
        err ? reject(err) : resolve([current, newWoTMembers, finalJoinData, res.leavers, updates]);
      });
    });
  }

  function findLeavers (current, done) {
    var leaveData = {};
    async.waterfall([
      function (next){
        dal.findLeavers(next);
      },
      function (mss, next){
        var leavers = [];
        mss.forEach(function (ms) {
          leavers.push(ms.issuer);
        });
        async.forEach(mss, function(ms, callback){
          var leave = { identity: null, ms: ms, key: null, idHash: '' };
          leave.idHash = (sha1(ms.userid + moment(ms.certts).unix() + ms.issuer) + "").toUpperCase();
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
                  dal.getIdentityByHashOrNull(leave.idHash, callback);
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

  function findNewcomers (current, filteringFunc, done) {
    var wotMembers = [];
    var joinData = {};
    var updates = {};
    async.waterfall([
      function (next) {
        getPreJoinData(current, next);
      },
      function (preJoinData, next){
        filteringFunc(preJoinData, next);
      },
      function (filteredJoinData, next) {
        joinData = filteredJoinData;
        // Cache the members
        dal.getMembers(next);
      },
      function (members, next) {
        getSentryMembers(members, function(err, sentries) {
          next(err, members, sentries);
        });
      },
      function (members, sentries, next) {
        wotMembers = _.pluck(members, 'pubkey');
        // Checking step
        var newcomers = _(joinData).keys();
        // Checking algo is defined by 'checkingWoTFunc'
        iteratedChecking(newcomers, function (someNewcomers, onceChecked) {
          var nextBlock = {
            number: current ? current.number + 1 : 0,
            joiners: someNewcomers
          };
          // Check WoT stability
          async.waterfall([
            function (next){
              computeNewLinks(someNewcomers, joinData, updates, next);
            },
            function (newLinks, next){
              checkWoTConstraints(sentries, nextBlock, newLinks, next);
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
            var issuer = cert.from;
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

  function getPreJoinData(current, done) {
    var preJoinData = {};
    async.waterfall([
      function (next){
        dal.findNewcomers(next);
      },
      function (mss, next){
        var joiners = [];
        mss.forEach(function (ms) {
          joiners.push(ms.issuer);
        });
        async.forEach(mss, function(ms, callback){
          var join = { identity: null, ms: ms, key: null, idHash: '' };
          join.idHash = (sha1(ms.userid + moment(ms.certts).unix() + ms.issuer) + "").toUpperCase();
          async.waterfall([
            function (next){
              async.parallel({
                block: function (callback) {
                  if (current) {
                    dal.getBlockOrNull(ms.number, callback);
                  } else {
                    callback(null, {});
                  }
                },
                identity: function(callback){
                  dal.getIdentityByHashOrNull(join.idHash, callback);
                },
                certs: function(callback){
                  if (!current) {
                    // Look for certifications from initial joiners
                    dal.certsTo(ms.issuer)
                      .then(function(certs){
                        callback(null, _.filter(certs, function(cert){
                          return ~joiners.indexOf(cert.from);
                        }));
                      })
                      .fail(callback);
                  } else {
                    // Look for certifications from WoT members
                    dal.certsNotLinkedToTarget(join.idHash)
                      .then(function(certs){
                        var finalCerts = [];
                        var certifiers = [];
                        async.forEachSeries(certs, function (cert, callback) {
                          async.waterfall([
                            function (next) {
                              if (current) {
                                // Already exists a link not replayable yet?
                                dal.existsLinkFromOrAfterDate(cert.from, cert.to, current.medianTime - conf.sigDelay)
                                  .then(function(exists) {
                                    if (exists)
                                      next('It already exists a similar certification written, which is not replayable yet');
                                    else
                                      dal.isMember(cert.from, next);
                                  })
                                  .fail(next);
                              }
                              else next(null, false);
                            },
                            function (isMember, next) {
                              var doubleSignature = ~certifiers.indexOf(cert.from) ? true : false;
                              if (isMember && !doubleSignature) {
                                certifiers.push(cert.from);
                                finalCerts.push(cert);
                              }
                              next();
                            }
                          ], function () {
                            callback();
                          });
                        }, function () {
                          callback(null, finalCerts);
                        });
                      })
                      .fail(callback);
                  }
                }
              }, next);
            },
            function (res, next){
              if (res.identity && res.block && res.identity.currentMSN < parseInt(join.ms.number)) {
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
      }
    ], function(err) {
      done(err, preJoinData);
    });
  }

  function computeNewLinks (theNewcomers, joinData, updates, done) {
    var newLinks = {};
    var certsByKey = _.mapObject(joinData, function(val){ return val.certs; });
    async.waterfall([
      function (next){
        async.forEach(theNewcomers, function(newcomer, callback){
          // New array of certifiers
          newLinks[newcomer] = newLinks[newcomer] || [];
          // Check wether each certification of the block is from valid newcomer/member
          async.forEach(certsByKey[newcomer], function(cert, callback){
            if (~theNewcomers.indexOf(cert.from)) {
              // Newcomer to newcomer => valid link
              newLinks[newcomer].push(cert.from);
              callback();
            } else {
              async.waterfall([
                function (next){
                  dal.isMember(cert.from, next);
                },
                function (isMember, next){
                  // Member to newcomer => valid link
                  if (isMember)
                    newLinks[newcomer].push(cert.from);
                  next();
                }
              ], callback);
            }
          }, callback);
        }, next);
      },
      function (next){
        _.mapObject(updates, function(certs, pubkey) {
          newLinks[pubkey] = (newLinks[pubkey] || []).concat(_.pluck(certs, 'pubkey'))
        });
        next();
      }
    ], function (err) {
      done(err, newLinks);
    });
  }

  function createBlock (current, joinData, leaveData, updates, exclusions, lastUDBlock, transactions, done) {
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
        block.identities.push(new Identity(data.identity).inline());
      }
      // Join only for non-members
      if (!data.identity.member) {
        block.joiners.push(new Membership(data.ms).inline());
      }
    });
    // Renewed
    block.actives = [];
    joiners.forEach(function(joiner){
      var data = joinData[joiner];
      // Join only for non-members
      if (data.identity.member) {
        block.actives.push(new Membership(data.ms).inline());
      }
    });
    // Leavers
    block.leavers = [];
    var leavers = _(leaveData).keys();
    leavers.forEach(function(leaver){
      var data = leaveData[leaver];
      // Join only for non-members
      if (data.identity.member) {
        block.leavers.push(new Membership(data.ms).inline());
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
        doubleCerts = doubleCerts || (~certifiers.indexOf(cert.from) ? true : false);
      });
      if (!doubleCerts || block.number == 0) {
        data.certs.forEach(function(cert){
          block.certifications.push(new Certification(cert).inline());
          certifiers.push(cert.from);
        });
      }
    });
    // Certifications from the WoT, to the WoT
    _(updates).keys().forEach(function(certifiedMember){
      var certs = updates[certifiedMember];
      certs.forEach(function(cert){
        if (certifiers.indexOf(cert.from) == -1) {
          block.certifications.push(new Certification(cert).inline());
          certifiers.push(cert.from);
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
      done(null, (block && new Block(block)) || null);
    });
    block.nonce = 0;
    powWorker.powProcess.send({ conf: conf, block: block, zeros: nbZeros, pair: BlockchainService.pair });
    logger.info('Generating proof-of-work of block #%s with %s leading zeros... (CPU usage set to %s%)', block.number, nbZeros, (conf.cpu*100).toFixed(0));
  };

  function Worker() {

    var stopped = true;
    var that = this;
    var onPoWFound = function() { throw 'Proof-of-work found, but no listener is attached.' };
    that.powProcess = childProcess.fork(__dirname + '/../lib/proof');
    var start = null;
    var speedMesured = false;

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
        speedMesured = true;
      } else if (!stopped && msg.nonce > block.nonce + constants.PROOF_OF_WORK.RELEASE_MEMORY) {
        // Reset fork process (release memory)...
        //logger.debug('Release mem... lastCount = %s, nonce = %s', block.nonce);
        block.nonce = msg.nonce;
        speedMesured = false;
        that.powProcess.kill();
        powWorker = new Worker();
        that.powProcess.send({ conf: conf, block: block, zeros: msg.nbZeros, pair: BlockchainService.pair });
      } else if (!stopped) {
        // Continue...
        //console.log('Already made: %s tests...', msg.nonce);
        // Look for incoming block
        if (speedMesured && cancels.length) {
          speedMesured = false;
          stopped = true;
          that.powProcess.kill();
          that.powProcess = null;
          powWorker = null;
          onPoWFound();
          logger.debug('Proof-of-work computation canceled.');
          start = null;
          var cancelConfirm = cancels.shift();
          cancelConfirm();
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
        dal.isMember(PeeringService.pubkey, function (err, isMember) {
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
          computationTimeout = function() {
            computationTimeout = setTimeout(function () {
              if (computeNextCallback)
                computeNextCallback();
            }, conf.powDelay*1000);
          };
          next('Skipping', null, 'Waiting ' + conf.powDelay + 's before starting computing next block...');
        }
        else next();
      },
      function (next){
        if (!current) {
          next(null, null);
        } else {
          async.parallel({
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
      }
    ], function (err, proofBlock, powCanceled) {
      if (powCanceled) {
        logger.warn(powCanceled);
        computeNextCallback = function () {
          computeNextCallback = null;
          done(null, null);
        };
        computationActivated = false
        if (computationTimeout && typeof computationTimeout == 'function') {
          computationTimeout();
        }
      } else {
        // Proof-of-work found
        computationActivated = false
        done(err || askedStop, proofBlock);
      }
    });
  };

  function withEnoughCerts (preJoinData, done) {
    var joinData = {};
    var newcomers = _(preJoinData).keys();
    async.forEachSeries(newcomers, function (newcomer, callback) {
      async.waterfall([
        function (next){
          var newLinks = {};
          newLinks[newcomer] = [];
          preJoinData[newcomer].certs.forEach(function (cert) {
            newLinks[newcomer].push(cert.from);
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
      'tx': 'transactions',
      'tx_history': saveHistory
    };
    statQueue.push(function (sent) {
      //logger.debug('Computing stats...');
      async.forEachSeries(['newcomers', 'certs', 'joiners', 'actives', 'leavers', 'excluded', 'ud', 'tx', 'tx_history'], function (statName, callback) {
        async.waterfall([
          function (next) {
            async.parallel({
              stat: function (next) {
                dal.getStat(statName, next);
              },
              current: function (next) {
                BlockchainService.current(next);
              }
            }, next);
          },
          function (res, next) {
            var stat = res.stat;
            var current = res.current;
            // Compute new stat
            async.forEachSeries(_.range(stat.lastParsedBlock + 1, (current ? current.number : -1) + 1), function (blockNumber, callback) {
              // console.log('Stat', statName, ': tested block#' + blockNumber);
              async.waterfall([
                function (next) {
                  dal.getBlockOrNull(blockNumber, next);
                },
                function (block, next) {
                  var testProperty = tests[statName];
                  if (typeof testProperty === 'function') {
                    saveHistory(block)
                      .then(function(){
                        stat.lastParsedBlock = blockNumber;
                        next();
                      })
                      .fail(function(err){
                        next(err);
                      });
                  } else {
                    var value = block[testProperty];
                    var isPositiveValue = value && typeof value != 'object';
                    var isNonEmptyArray = value && typeof value == 'object' && value.length > 0;
                    if (isPositiveValue || isNonEmptyArray) {
                      stat.blocks.push(blockNumber);
                    }
                    stat.lastParsedBlock = blockNumber;
                    next();
                  }
                }
              ], callback);
            }, function (err) {
              next(err, stat);
            });
          },
          function (stat, next) {
            dal.saveStat(stat, statName, function (err) {
              next(err);
            });
          }
        ], callback);
      }, function () {
        //logger.debug('Computing stats: done!');
        sent();
      });
    });
  };

  function saveHistory(block) {
    return block.transactions.reduce(function(promise, tx) {
      return promise
        .then(function(){
          var issuers = [], recipients = [];
          tx.signatories.forEach(function(issuer){
            issuers.push(issuer);
          });
          tx.outputs.forEach(function(out){
            var recip = out.split(':')[0];
            if (issuers.indexOf(recip) === -1) {
              recipients.push(recip);
            }
          });
          return Q.all(issuers.map(function(issuer) {
            return dal.saveTxInHistory('sent', issuer, tx);
          }))
            .then(function(){
            return Q.all(recipients.map(function(receipient) {
              return dal.saveTxInHistory('received', receipient, tx);
            }));
          })
        });
    }, Q());
  }
}

/**
 * Class to implement strategy of automatic selection of incoming data for next block.
 * @constructor
 */
function NextBlockGenerator(conf, dal) {

  this.findNewCertsFromWoT = function(current) {
    return Q.Promise(function(resolve, reject){
      var updates = {};
      var updatesToFrom = {};
      async.waterfall([
        function (next) {
          dal.certsFindNew(next);
        },
        function (certs, next){
          async.forEachSeries(certs, function(cert, callback){
            async.waterfall([
              function (next) {
                if (current) {
                  // Already exists a link not replayable yet?
                  dal.existsLinkFromOrAfterDate(cert.from, cert.to, current.medianTime - conf.sigDelay)
                    .then(function(exists) {
                      next(null, exists);
                    })
                    .fail(next);
                }
                else next(null, false);
              },
              function (exists, next) {
                if (exists)
                  next('It already exists a similar certification written, which is not replayable yet');
                else {
                  // Signatory must be a member
                  dal.isMemberOrError(cert.from, next);
                }
              },
              function (next){
                // Certified must be a member and non-leaver
                dal.isMembeAndNonLeaverOrError(cert.to, next);
              },
              function (next){
                updatesToFrom[cert.to] = updatesToFrom[cert.to] || [];
                updates[cert.to] = updates[cert.to] || [];
                if (updatesToFrom[cert.to].indexOf(cert.from) == -1) {
                  updates[cert.to].push(cert);
                  updatesToFrom[cert.to].push(cert.from);
                }
                next();
              }
            ], function () {
              callback();
            });
          }, next);
        }
      ], function (err) {
        err ? reject(err) : resolve(updates);
      });
    });
  };

  this.filterJoiners = function takeAllJoiners(preJoinData, next) {
    // No manual filtering, takes all
    next(null, preJoinData);
  };
}

/**
 * Class to implement strategy of manual selection of root members for root block.
 * @constructor
 */
function ManualRootGenerator() {

  this.findNewCertsFromWoT = function() {
    return Q({});
  };

  this.filterJoiners = function(preJoinData, next) {
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
}