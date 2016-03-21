"use strict";
var Q       = require('q');
var co      = require('co');
var _       = require('underscore');
var qfs     = require('q-io/fs');
var path    = require('path');
var hashf   = require('../hashf');
var wotb    = require('../wot');
var Configuration = require('../entity/configuration');
var Membership = require('../entity/membership');
var Merkle = require('../entity/merkle');
var Transaction = require('../entity/transaction');
var constants = require('../constants');
var ConfDAL = require('./fileDALs/confDAL');
var StatDAL = require('./fileDALs/statDAL');
var IndicatorsDAL = require('./fileDALs/IndicatorsDAL');
var CFSStorage = require('./fileDALs/AbstractCFS');
var sqlite3 = require("sqlite3b").verbose();
var logger = require('../../lib/logger')('database');

const UCOIN_DB_NAME = 'ucoin';
const WOTB_FILE = 'wotb.bin';

module.exports = {
  memory: function(home) {
    return getHomeFS(true, home)
      .then(function(params) {
        let sqlite = new sqlite3.Database(':memory:');
        return Q(new FileDAL(params.home, "", params.fs, 'fileDal', sqlite, wotb.memoryInstance()));
      });
  },
  file: function(home) {
    return getHomeFS(false, home)
      .then(function(params) {
        let sqlitePath = path.join(params.home, UCOIN_DB_NAME + '.db');
        let sqlite = new sqlite3.Database(sqlitePath);
        return new FileDAL(params.home, "", params.fs, 'fileDal', sqlite, wotb.fileInstance(path.join(params.home, WOTB_FILE)));
      });
  },
  FileDAL: FileDAL
};

function someDelayFix() {
  return Q.Promise(function(resolve){
    setTimeout(resolve, 100);
  });
}

function getHomeFS(isMemory, home) {
  let myfs;
  return someDelayFix()
    .then(function() {
      myfs = (isMemory ? require('q-io/fs-mock')({}) : qfs);
      return myfs.makeTree(home);
    })
    .then(function(){
      return { fs: myfs, home: home };
    });
}

function FileDAL(home, localDir, myFS, dalName, sqlite, wotbInstance) {

  var that = this;

  let localHome = path.join(home, localDir);

  this.name = dalName;
  this.profile = 'DAL';
  this.wotb = wotbInstance;
  var rootPath = home;

  // DALs
  this.confDAL = new ConfDAL(rootPath, myFS, null, that, CFSStorage);
  this.peerDAL = new (require('./sqliteDAL/PeerDAL'))(sqlite);
  this.blockDAL = new (require('./sqliteDAL/BlockDAL'))(sqlite);
  this.sourcesDAL = new (require('./sqliteDAL/SourcesDAL'))(sqlite);
  this.txsDAL = new (require('./sqliteDAL/TxsDAL'))(sqlite);
  this.indicatorsDAL = new IndicatorsDAL(rootPath, myFS, null, that, CFSStorage);
  this.statDAL = new StatDAL(rootPath, myFS, null, that, CFSStorage);
  this.linksDAL = new (require('./sqliteDAL/LinksDAL'))(sqlite, wotbInstance);
  this.idtyDAL = new (require('./sqliteDAL/IdentityDAL'))(sqlite, wotbInstance);
  this.certDAL = new (require('./sqliteDAL/CertDAL'))(sqlite);
  this.msDAL = new (require('./sqliteDAL/MembershipDAL'))(sqlite);

  this.newDals = {
    'blockDAL': that.blockDAL,
    'certDAL': that.certDAL,
    'msDAL': that.msDAL,
    'idtyDAL': that.idtyDAL,
    'sourcesDAL': that.sourcesDAL,
    'linksDAL': that.linksDAL,
    'txsDAL': that.txsDAL,
    'peerDAL': that.peerDAL,
    'indicatorsDAL': that.indicatorsDAL,
    'confDAL': that.confDAL,
    'statDAL': that.statDAL,
    'ghostDAL': {
      init: () => co(function *() {

        // Create extra views (useful for stats or debug)
        return that.blockDAL.exec('BEGIN;' +
          'CREATE VIEW IF NOT EXISTS identities_pending AS SELECT * FROM idty WHERE NOT written;' +
          'CREATE VIEW IF NOT EXISTS certifications_pending AS SELECT * FROM cert WHERE NOT written;' +
          'CREATE VIEW IF NOT EXISTS transactions_pending AS SELECT * FROM txs WHERE NOT written;' +
          'CREATE VIEW IF NOT EXISTS transactions_desc AS SELECT * FROM txs ORDER BY time DESC;' +
          'CREATE VIEW IF NOT EXISTS forks AS SELECT number, hash, issuer, monetaryMass, dividend, UDTime, membersCount, medianTime, time, * FROM block WHERE fork ORDER BY number DESC;' +
          'CREATE VIEW IF NOT EXISTS blockchain AS SELECT number, hash, issuer, monetaryMass, dividend, UDTime, membersCount, medianTime, time, * FROM block WHERE NOT fork ORDER BY number DESC;' +
          'CREATE VIEW IF NOT EXISTS network AS select i.uid, (last_try - first_down) / 1000 as down_delay_in_sec, p.* from peer p LEFT JOIN idty i on i.pubkey = p.pubkey ORDER by down_delay_in_sec;' +
          'COMMIT;');
      })
    }
  };

  var currency = '';

  this.init = () => co(function *() {
    yield _.values(that.newDals).map((dal) => dal.init());
  });

  this.getCurrency = function() {
    return currency;
  };

  this.removeHome = function() {
    return myFS.removeTree(localHome)
      .catch(function(){
      });
  };

  that.writeFileOfBlock = function(block) {
    return that.blockDAL.saveBlock(block);
  };

  this.writeSideFileOfBlock = (block) =>
    that.blockDAL.saveSideBlock(block);

  this.listAllPeers = function() {
    return that.peerDAL.listAll();
  };

  function nullIfError(promise, done) {
    return promise
      .then(function(p){
        done && done(null, p);
        return p;
      })
      .catch(function(){
        done && done(null, null);
        return null;
      });
  }

  function nullIfErrorIs(promise, expectedError, done) {
    return promise
      .then(function(p){
        done && done(null, p);
        return p;
      })
      .catch(function(err){
        if (err == expectedError) {
          done && done(null, null);
          return null;
        }
        if (done) {
          done(err);
          return null;
        }
        throw err;
      });
  }

  this.getPeer = function(pubkey) {
    return that.peerDAL.getPeer(pubkey)
      .catch(function() {
        throw Error('Unknown peer ' + pubkey);
      });
  };

  this.getBlock = function(number, done) {
    return that.blockDAL.getBlock(number)
      .catch(function(){
        throw 'Block ' + number + ' not found';
      })
      .then(function(block){
        done && done(null, block || null);
        return block;
      })
      .catch(function(err){
        done && done(err);
        throw err;
      });
  };

  this.getAbsoluteBlockByNumberAndHash = (number, hash) =>
    that.blockDAL.getAbsoluteBlock(number, hash);

  this.getBlockByNumberAndHash = function(number, hash, done) {
    return that.getBlock(number)
      .then(function(block){
        if (block.hash != hash) throw "Not found";
        else return block;
      })
      .catch(function(){
        throw 'Block ' + [number, hash].join('-') + ' not found in ' + that.name;
      })
      .then(function(block){
        done && done(null, block);
        return block;
      })
      .catch(function(err){
        done && done(err);
        throw err;
      });
  };

  this.getBlockByNumberAndHashOrNull = function(number, hash) {
    return nullIfError(that.getBlock(number)
      .then(function(block){
        if (!block || block.hash != hash) throw "Not found";
        else return block;
      }));
  };

  this.getChainabilityBlock = (currentTime, sigPeriod) => co(function *() {
    // AGE = current_time - block_time
    // CHAINABLE = AGE >= sigPeriod
    // CHAINABLE = block_time =< current_time - sigPeriod
    return that.blockDAL.getMoreRecentBlockWithTimeEqualBelow(currentTime - sigPeriod);
  });

  this.existsNonChainableLink = (from, chainabilityBlockNumber, sigStock) => co(function *() {
    // Cert period rule
    let links = yield that.linksDAL.getLinksOfIssuerAbove(from, chainabilityBlockNumber);
    if (links.length > 0) return true;
    // Max stock rule
    let activeLinks = yield that.linksDAL.getValidLinksFrom(from);
    return activeLinks.length >= sigStock;
  });


  this.getCurrentBlockOrNull = function(done) {
    return nullIfErrorIs(that.getBlockCurrent(), constants.ERROR.BLOCK.NO_CURRENT_BLOCK, done);
  };

  this.getCurrent = this.getCurrentBlockOrNull;

  this.getPromoted = function(number, done) {
    return that.getBlock(number, done);
  };

  // Block
  this.lastUDBlock = function() {
    return Q(that.blockDAL.lastBlockWithDividend());
  };

  this.getRootBlock = function(done) {
    return that.getBlock(0, done);
  };

  this.lastBlockOfIssuer = function(issuer) {
    return that.blockDAL.lastBlockOfIssuer(issuer);
  };

  this.getBlocksBetween = (start, end) => Q(this.blockDAL.getBlocks(Math.max(0, start), end));

  this.getBlockCurrent = function(done) {
    return that.blockDAL.getCurrent()
      .then(function(current) {
        if (!current) throw 'No current block';
        done && done(null, current);
        return current;
      });
  };

  this.getBlockFrom = function(number) {
    return that.getCurrent()
      .then(function(current){
        return that.getBlocksBetween(number, current.number);
      });
  };

  this.getValidLinksFrom = function(from) {
    return that.linksDAL.getValidLinksFrom(from);
  };

  this.getValidLinksTo = function(to) {
    return that.linksDAL.getValidLinksTo(to);
  };

  this.getPreviousLinks = (from, to) => co(function *() {
    let links = yield that.linksDAL.getLinksWithPath(from, to);
    links = _.sortBy(links, 'timestamp');
    return links[links.length - 1];
  });

  this.getValidFromTo = function(from, to) {
    return that.getValidLinksFrom(from)
      .then(function(links){
        return _.chain(links).
          where({ target: to }).
          value();
      });
  };

  this.getLastValidFrom = (from) => co(function *() {
    let links = yield that.linksDAL.getLinksFrom(from);
    links = _.sortBy(links, 'timestamp');
    return links[links.length - 1];
  });

  this.getAvailableSourcesByPubkey = function(pubkey) {
    return that.sourcesDAL.getAvailableForPubkey(pubkey);
  };

  this.getIdentityByHashOrNull = function(hash, done) {
    return that.idtyDAL.getByHash(hash)
      .then(function(idty) {
        done && done(null, idty);
        return idty;
      })
      .catch(function(err) {
        if (done) {
          return done(err);
        }
        throw err;
      });
  };

  this.getMembers = function(done) {
    return that.idtyDAL.getWhoIsOrWasMember()
      .then(function(idties) {
        return _.chain(idties).
          where({ member: true }).
          value();
      })
      .then(function(members) {
        done && done(null, members);
        return members;
      })
      .catch(function(err) {
        if (done) {
          return done(err);
        }
        throw err;
      });
  };

  this.getMembersP = () => co(function *() {
    let idties = yield that.idtyDAL.getWhoIsOrWasMember();
    return _.chain(idties).
      where({ member: true }).
      value();
  });

  // TODO: this should definitely be reduced by removing fillInMembershipsOfIdentity
  this.getWritten = function(pubkey, done) {
    return that.fillInMembershipsOfIdentity(
      that.idtyDAL.getFromPubkey(pubkey)
        .then(function(idty){
          return idty;
        }).catch(function() {
          return null;
        }), done);
  };

  this.getWrittenIdtyByPubkey = (pubkey) => this.idtyDAL.getFromPubkey(pubkey);
  this.getWrittenIdtyByUID = (pubkey) => this.idtyDAL.getFromUID(pubkey);

  this.fillInMembershipsOfIdentity = function(queryPromise, done) {
    return Q(queryPromise)
      .then(function(idty){
        if (idty) {
          return that.msDAL.getMembershipsOfIssuer(idty.pubkey)
            .then(function(mss){
              idty.memberships = mss;
              return idty;
            });
        }
      })
      .then(function(idty){
        done && done(null, idty);
        return idty;
      })
      .catch(function(){
        done && done(null, null);
      });
  };

  this.getMembershipsForIssuer = function(pubkey) {
    return that.msDAL.getMembershipsOfIssuer(pubkey);
  };

  this.findPeersWhoseHashIsIn = function(hashes) {
    return that.peerDAL.listAll()
      .then(function(peers){
        return _.chain(peers).
          filter(function(p){ return hashes.indexOf(p.hash) !== -1; }).
          value();
      });
  };

  this.getTxByHash = function(hash) {
    return that.txsDAL.getTX(hash);
  };

  this.removeTxByHash = function(hash) {
    return that.txsDAL.removeTX(hash);
  };

  this.getTransactionsPending = function() {
    return that.txsDAL.getAllPending();
  };

  this.getNonWritten = function(pubkey) {
    return that.idtyDAL.getPendingIdentities()
      .then(function(pending){
        return _.chain(pending).
          where({ pubkey: pubkey }).
          value();
      });
  };

  this.getToBeKicked = function(done) {
    return that.idtyDAL.getWhoIsOrWasMember()
      .then(function(membersOnce){
        return _.chain(membersOnce).
          where({ member: true, kick: true }).
          value();
      })
      .then(function(res) {
        done && done(null, res);
        return res;
      }).catch(done);
  };

  this.getRevocatingMembers = () => co(function *() {
    return that.idtyDAL.getToRevoke();
  });

  this.getToBeKickedPubkeys = function() {
    return co(function *() {
      var exclusions = yield that.getToBeKicked();
      return _.pluck(exclusions, 'pubkey');
    });
  };

  this.getWrittenByUID = function(uid) {
    return that.idtyDAL.getFromUID(uid)
      .catch(function(){
        return null;
      });
  };

  this.searchJustIdentities = (search) => this.idtyDAL.searchThoseMatching(search);

  this.certsToTarget = function(hash) {
    return that.certDAL.getToTarget(hash)
      .then(function(certs){
        var matching = _.chain(certs).
          sortBy(function(c){ return -c.block; }).
          value();
        matching.reverse();
        return matching;
      })
      .catch(function(err){
        throw err;
      });
  };

  this.certsFrom = function(pubkey) {
    return that.certDAL.getFromPubkey(pubkey)
      .then(function(certs){
        return _.chain(certs).
          where({ from: pubkey }).
          sortBy(function(c){ return c.block; }).
          value();
      });
  };

  this.certsFindNew = function() {
    return that.certDAL.getNotLinked()
      .then(function(certs){
        return _.chain(certs).
          where({ linked: false }).
          sortBy(function(c){ return -c.block; }).
          value();
      });
  };

  this.certsNotLinkedToTarget = function(hash) {
    return that.certDAL.getNotLinkedToTarget(hash)
      .then(function(certs){
        return _.chain(certs).
          sortBy(function(c){
            //console.log(hash);
            //console.log(certs);
            return -c.block; }).
          value();
      });
  };

  this.getMembershipForHashAndIssuer = function(ms) {
    return that.msDAL.getMembershipOfIssuer(ms)
      .catch(function(){
        return null;
      });
  };

  this.lastJoinOfIdentity = (target) => co(function *() {
    let pending = yield that.msDAL.getPendingINOfTarget(target);
    return _(pending).sortBy((ms) => -ms.number)[0];
  });

  this.findNewcomers = function() {
    return that.msDAL.getPendingIN()
      .then(function(mss){
        return _.chain(mss).
          sortBy(function(ms){ return -ms.sigDate; }).
          value();
      });
  };

  this.findLeavers = function() {
    return that.msDAL.getPendingOUT()
      .then(function(mss){
        return _.chain(mss).
          sortBy(function(ms){ return -ms.sigDate; }).
          value();
      });
  };

  this.existsLinkFromOrAfterDate = (from, to, minDate) => co(function *() {
    var links = yield that.linksDAL.getSimilarLinksFromDate(from, to, minDate);
    return links.length ? true : false;
  });

  this.getSource = (identifier, noffset) => that.sourcesDAL.getSource(identifier, noffset);

  this.isMember = function(pubkey, done) {
    return that.idtyDAL.getFromPubkey(pubkey)
      .then(function(idty){
        done && done(null, idty.member);
        return idty.member;
      })
      .catch(function(){
        done && done(null, false);
        return false;
      });
  };

  this.isLeaving = (pubkey) => co(function *() {
    let idty = yield that.idtyDAL.getFromPubkey(pubkey);
    return idty && idty.leaving || false;
  });

  this.isMemberAndNonLeaver = function(pubkey) {
    return that.idtyDAL.getFromPubkey(pubkey)
      .catch(() => false)
      .then((idty) => (idty && idty.member && !idty.leaving) || false);
  };

  this.existsCert = function(cert) {
    return that.certDAL.existsGivenCert(cert);
  };

  this.obsoletesLinks = function(minTimestamp) {
    return that.linksDAL.obsoletesLinks(minTimestamp);
  };

  this.undoObsoleteLinks = function(minTimestamp) {
    return that.linksDAL.unObsoletesLinks(minTimestamp);
  };

  this.setConsumedSource = (identifier, noffset) => that.sourcesDAL.consumeSource(identifier, noffset);

  this.setKicked = function(pubkey, hash, notEnoughLinks, done) {
    var kick = notEnoughLinks ? true : false;
    return that.idtyDAL.getFromPubkey(pubkey)
      .then(function(idty){
        if (idty.kick != kick) {
          idty.kick = kick;
          return that.idtyDAL.saveIdentity(idty);
        }
      })
      .then(function(){
        return that.donable(Q(), done);
      })
      .catch(done);
  };

  this.setRevocating = (hash, revocation_sig) => co(function *() {
    let idty = yield that.idtyDAL.getByHash(hash);
    idty.revocation_sig = revocation_sig;
    return that.idtyDAL.saveIdentity(idty);
  });

  this.getMembershipExcludingBlock = function(current, msValidtyTime) {
    return co(function *() {
      var currentExcluding;
      if (current.number > 0) {
        try {
          currentExcluding = yield that.indicatorsDAL.getCurrentMembershipExcludingBlock();
        } catch(e){
          currentExcluding = null;
        }
      }
      if (!currentExcluding) {
        var root = yield that.getRootBlock();
        var delaySinceStart = current.medianTime - root.medianTime;
        if (delaySinceStart > msValidtyTime) {
          return that.indicatorsDAL.writeCurrentExcluding(root).then(() => root);
        }
      } else {
        var start = currentExcluding.number;
        let newExcluding;
        let top = current.number, bottom = start;
        // Binary tree search
        do {
          let middle = top - bottom;
          if (middle % 2 != 0) {
            middle = middle + 1;
          }
          middle /= 2;
          middle += bottom;
          if (middle == top) {
            middle--;
            bottom--; // Helps not being stuck looking at 'top'
          }
          let middleBlock = yield that.getBlock(middle);
          let middleNextB = yield that.getBlock(middle + 1);
          var delaySinceMiddle = current.medianTime - middleBlock.medianTime;
          var delaySinceNextB = current.medianTime - middleNextB.medianTime;
          let isValidPeriod = delaySinceMiddle <= msValidtyTime;
          let isValidPeriodB = delaySinceNextB <= msValidtyTime;
          let isExcludin = !isValidPeriod && isValidPeriodB;
          //console.log('MS: Search between %s and %s: %s => %s,%s', bottom, top, middle, isValidPeriod ? 'DOWN' : 'UP', isValidPeriodB ? 'DOWN' : 'UP');
          if (isExcludin) {
            // Found
            yield that.indicatorsDAL.writeCurrentExcluding(middleBlock);
            newExcluding = middleBlock;
          }
          else if (isValidPeriod) {
            // Look down in the blockchain
            top = middle;
          }
          else {
            // Look up in the blockchain
            bottom = middle;
          }
        } while (!newExcluding);
        return newExcluding;
      }
    });
  };

  // TODO: this is complete duplicate of getMembershipExcludingBlock()n but with two different calls:
  // * getCurrentMembershipRevocatingBlock()
  // * writeCurrentRevocating
  this.getMembershipRevocatingBlock = function(current, msValidtyTime) {
    return co(function *() {
      var currentExcluding;
      if (current.number > 0) {
        try {
          currentExcluding = yield that.indicatorsDAL.getCurrentMembershipRevocatingBlock();
        } catch(e){
          currentExcluding = null;
        }
      }
      if (!currentExcluding) {
        var root = yield that.getRootBlock();
        var delaySinceStart = current.medianTime - root.medianTime;
        if (delaySinceStart > msValidtyTime) {
          return that.indicatorsDAL.writeCurrentRevocating(root).then(() => root);
        }
      } else {
        var start = currentExcluding.number;
        let newRevocating;
        let top = current.number, bottom = start;
        // Binary tree search
        do {
          let middle = top - bottom;
          if (middle % 2 != 0) {
            middle = middle + 1;
          }
          middle /= 2;
          middle += bottom;
          if (middle == top) {
            middle--;
            bottom--; // Helps not being stuck looking at 'top'
          }
          let middleBlock = yield that.getBlock(middle);
          let middleNextB = yield that.getBlock(middle + 1);
          var delaySinceMiddle = current.medianTime - middleBlock.medianTime;
          var delaySinceNextB = current.medianTime - middleNextB.medianTime;
          let isValidPeriod = delaySinceMiddle <= msValidtyTime;
          let isValidPeriodB = delaySinceNextB <= msValidtyTime;
          let isExcludin = !isValidPeriod && isValidPeriodB;
          //console.log('MS: Search between %s and %s: %s => %s,%s', bottom, top, middle, isValidPeriod ? 'DOWN' : 'UP', isValidPeriodB ? 'DOWN' : 'UP');
          if (isExcludin) {
            // Found
            yield that.indicatorsDAL.writeCurrentRevocating(middleBlock);
            newRevocating = middleBlock;
          }
          else if (isValidPeriod) {
            // Look down in the blockchain
            top = middle;
          }
          else {
            // Look up in the blockchain
            bottom = middle;
          }
        } while (!newRevocating);
        return newRevocating;
      }
    });
  };

  this.getCertificationExcludingBlock = function(current, certValidtyTime) {
    return co(function *() {
      var currentExcluding;
      if (current.number > 0) {
        try {
          currentExcluding = yield that.indicatorsDAL.getCurrentCertificationExcludingBlock();
        } catch(e){
          currentExcluding = null;
        }
      }
      if (!currentExcluding) {
        var root = yield that.getRootBlock();
        var delaySinceStart = current.medianTime - root.medianTime;
        if (delaySinceStart > certValidtyTime) {
          return that.indicatorsDAL.writeCurrentExcludingForCert(root).then(() => root);
        }
      } else {
        // Check current position
        let currentNextBlock = yield that.getBlock(currentExcluding.number + 1);
        if (isExcluding(current, currentExcluding, currentNextBlock, certValidtyTime)) {
          return currentExcluding;
        } else {
          // Have to look for new one
          var start = currentExcluding.number;
          let newExcluding;
          let top = current.number, bottom = start;
          // Binary tree search
          do {
            let middle = top - bottom;
            if (middle % 2 != 0) {
              middle = middle + 1;
            }
            middle /= 2;
            middle += bottom;
            if (middle == top) {
              middle--;
              bottom--; // Helps not being stuck looking at 'top'
            }
            let middleBlock = yield that.getBlock(middle);
            let middleNextB = yield that.getBlock(middle + 1);
            var delaySinceMiddle = current.medianTime - middleBlock.medianTime;
            var delaySinceNextB = current.medianTime - middleNextB.medianTime;
            let isValidPeriod = delaySinceMiddle <= certValidtyTime;
            let isValidPeriodB = delaySinceNextB <= certValidtyTime;
            let isExcludin = !isValidPeriod && isValidPeriodB;
            //console.log('CRT: Search between %s and %s: %s => %s,%s', bottom, top, middle, isValidPeriod ? 'DOWN' : 'UP', isValidPeriodB ? 'DOWN' : 'UP');
            if (isExcludin) {
              // Found
              yield that.indicatorsDAL.writeCurrentExcludingForCert(middleBlock);
              newExcluding = middleBlock;
            }
            else if (isValidPeriod) {
              // Look down in the blockchain
              top = middle;
            }
            else {
              // Look up in the blockchain
              bottom = middle;
            }
          } while (!newExcluding);
          return newExcluding;
        }
      }
    });
  };

  function isExcluding(current, excluding, nextBlock, certValidtyTime) {
    var delaySinceMiddle = current.medianTime - excluding.medianTime;
    var delaySinceNextB = current.medianTime - nextBlock.medianTime;
    let isValidPeriod = delaySinceMiddle <= certValidtyTime;
    let isValidPeriodB = delaySinceNextB <= certValidtyTime;
    return !isValidPeriod && isValidPeriodB;
  }

  this.kickWithOutdatedMemberships = (maxNumber) => this.idtyDAL.kickMembersForMembershipBelow(maxNumber);
  this.revokeWithOutdatedMemberships = (maxNumber) => this.idtyDAL.revokeMembersForMembershipBelow(maxNumber);

  this.getPeerOrNull = function(pubkey, done) {
    return nullIfError(that.getPeer(pubkey), done);
  };

  this.getBlockOrNull = function(number, done) {
    return nullIfError(that.getBlock(number), done);
  };

  this.findAllPeersNEWUPBut = function(pubkeys, done) {
    return that.listAllPeers()
      .then(function(peers){
        return peers.filter(function(peer) {
          return pubkeys.indexOf(peer.pubkey) == -1 && ['UP'].indexOf(peer.status) !== -1;
        });
      })
      .then(function(matchingPeers){
        done && done(null, matchingPeers);
        return matchingPeers;
      })
      .catch(done);
  };

  this.listAllPeersWithStatusNewUP = function() {
    return that.peerDAL.listAll()
      .then(function(peers){
        var matching = _.chain(peers).
          filter(function(p){ return ['UP'].indexOf(p.status) !== -1; }).
          value();
        return Q(matching);
      });
  };

  this.listAllPeersWithStatusNewUPWithtout = (pubkey) => co(function *() {
    let peers = yield that.peerDAL.listAll();
    let matching = _.chain(peers).
      filter((p) => p.status == 'UP').
      filter((p) => p.pubkey != pubkey).
      value();
    return Q(matching);
  });

  this.findPeers = function(pubkey) {
    return that.getPeer(pubkey)
      .catch(function(){
        return [];
      })
      .then(function(peer){
        return [peer];
      });
  };

  this.getRandomlyUPsWithout = function(pubkeys, done) {
    return that.listAllPeersWithStatusNewUP()
      .then(function(peers){
        return peers.filter(function(peer) {
          return pubkeys.indexOf(peer.pubkey) == -1;
        });
      })
      .then(function(matchingPeers){
        done && done(null, matchingPeers);
        return matchingPeers;
      })
      .catch(function(err) {
        done && done(err);
        throw err;
      });
  };

  this.setPeerUP = (pubkey) => co(function *() {
    let p = yield that.getPeer(pubkey);
    p.status = 'UP';
    p.first_down = null;
    p.last_try = null;
    return that.peerDAL.savePeer(p);
  })
    .catch(() => null);

  this.setPeerDown = (pubkey) => co(function *() {
    let p = yield that.getPeer(pubkey);
    let now = (new Date()).getTime();
    p.status = 'DOWN';
    if (!p.first_down) {
      p.first_down = now;
    }
    p.last_try = now;
    return that.peerDAL.savePeer(p);
  })
    .catch(() => null);

  this.saveBlock = function(block, done) {
    block.wrong = false;
    return Q()
      .then(function() {
        return Q.all([
          that.saveBlockInFile(block, true),
          that.saveTxsInFiles(block.transactions, { block_number: block.number, time: block.medianTime }),
          that.saveMemberships('join', block.joiners, block.number),
          that.saveMemberships('active', block.actives, block.number),
          that.saveMemberships('leave', block.leavers, block.number)
        ]);
      })
      .then(function(){
        done && done();
      })
      .catch(function(err){
        done && done(err);
        throw err;
      });
  };

  this.saveMemberships = function (type, mss, blockNumber) {
    var msType = type == 'leave' ? 'out' : 'in';
    return mss.reduce(function(p, msRaw) {
      return p.then(function(){
        var ms = Membership.statics.fromInline(msRaw, type == 'leave' ? 'OUT' : 'IN', that.getCurrency());
        ms.type = type;
        ms.hash = String(hashf(ms.getRawSigned())).toUpperCase();
        ms.idtyHash = (hashf(ms.userid + ms.certts + ms.issuer) + "").toUpperCase();
        return that.msDAL.saveOfficialMS(msType, ms, blockNumber);
      });
    }, Q());
  };

  this.savePendingMembership = function(ms) {
    return that.msDAL.savePendingMembership(ms);
  };

  that.saveBlockInFile = (block, check, done) => co(function *() {
    yield that.writeFileOfBlock(block);
    done && done();
  })
    .catch(function(err){
      done && done(err);
      throw err;
    });

  this.saveSideBlockInFile = (block) =>
    that.writeSideFileOfBlock(block);

  this.saveTxsInFiles = function (txs, extraProps) {
    return Q.all(txs.map(function(tx) {
      _.extend(tx, extraProps);
      _.extend(tx, { currency: that.getCurrency() });
      return that.txsDAL.addLinked(new Transaction(tx));
    }));
  };

  function donable(promise, done) {
    return promise
      .then(function(){
        done && done();
      })
      .catch(function(err){
        done && done(err);
        throw err;
      });
  }

  this.donable = donable;

  this.merkleForPeers = () => co(function *() {
    let peers = yield that.listAllPeersWithStatusNewUP();
    var leaves = peers.map(function(peer) { return peer.hash; });
    var merkle = new Merkle();
    merkle.initialize(leaves);
    return merkle;
  });

  this.removeLink = (link) =>
    that.linksDAL.removeLink(link);

  this.removeAllSourcesOfBlock = (number) =>
    that.sourcesDAL.removeAllSourcesOfBlock(number);

  this.unConsumeSource = (identifier, noffset) =>
    that.sourcesDAL.unConsumeSource(identifier, noffset);

  this.saveSource = function(src) {
    return that.sourcesDAL.addSource(src.type, src.number, src.identifier, src.noffset, src.amount, src.base, src.block_hash, src.time, src.conditions);
  };

  this.updateSources = function(sources) {
    return that.sourcesDAL.updateBatchOfSources(sources);
  };

  this.updateCertifications = function(certs) {
    return that.certDAL.updateBatchOfCertifications(certs);
  };

  this.updateMemberships = function(certs) {
    return that.msDAL.updateBatchOfMemberships(certs);
  };

  this.updateLinks = function(certs) {
    return that.linksDAL.updateBatchOfLinks(certs);
  };

  this.updateTransactions = function(txs) {
    return that.txsDAL.updateBatchOfTxs(txs);
  };

  this.officializeCertification = function(cert) {
    return that.certDAL.saveOfficial(cert);
  };

  this.saveCert = (cert) =>
    // TODO: create a specific method with a different name and hide saveCert()
    that.certDAL.saveCert(cert);

  this.savePendingIdentity = function(idty) {
    // TODO: create a specific method with a different name and hide saveIdentity()
    return that.idtyDAL.saveIdentity(idty);
  };

  this.revokeIdentity = (pubkey) => that.idtyDAL.revokeIdentity(pubkey);

  this.unrevokeIdentity = (pubkey) => that.idtyDAL.unrevokeIdentity(pubkey);

  this.excludeIdentity = function(pubkey) {
    return that.idtyDAL.excludeIdentity(pubkey);
  };

  this.newIdentity = (idty) => co(function *() {
    return that.idtyDAL.newIdentity(idty);
  });

  this.joinIdentity = function(pubkey, number) {
    return that.idtyDAL.joinIdentity(pubkey, number);
  };

  this.activeIdentity = function(pubkey, number) {
    return that.idtyDAL.activeIdentity(pubkey, number);
  };

  this.leaveIdentity = function(pubkey, number) {
    return that.idtyDAL.leaveIdentity(pubkey, number);
  };

  this.removeUnWrittenWithPubkey = function(pubkey) {
    return Q(that.idtyDAL.removeUnWrittenWithPubkey(pubkey));
  };

  this.removeUnWrittenWithUID = function(pubkey) {
    return Q(that.idtyDAL.removeUnWrittenWithUID(pubkey));
  };

  this.unacceptIdentity = that.idtyDAL.unacceptIdentity;

  this.unJoinIdentity = (ms) => co(function *() {
    let previousMSN = yield that.msDAL.previousMS(ms.issuer, ms.number);
    let previousINN = previousMSN.number;
    if (previousMSN.membership == 'IN') {
      previousINN = previousMSN;
    }
    else {
      previousINN = yield that.msDAL.previousIN(ms.issuer, ms.number);
    }
    yield that.idtyDAL.unJoinIdentity(ms, previousMSN.number, previousINN.number);
    yield that.msDAL.unwriteMS(ms);
  });

  this.unRenewIdentity = (ms) => co(function *() {
    let previousMSN = yield that.msDAL.previousMS(ms.issuer, ms.number);
    let previousINN = previousMSN.number;
    if (previousMSN.membership == 'IN') {
      previousINN = previousMSN;
    }
    else {
      previousINN = yield that.msDAL.previousIN(ms.issuer, ms.number);
    }
    yield that.idtyDAL.unRenewIdentity(ms, previousMSN.number, previousINN.number);
    yield that.msDAL.unwriteMS(ms);
  });

  this.unLeaveIdentity = (ms) => co(function *() {
    let previousMSN = yield that.msDAL.previousMS(ms.issuer, ms.number);
    yield that.idtyDAL.unLeaveIdentity(ms, previousMSN.number);
    yield that.msDAL.unwriteMS(ms);
  });

  this.unExcludeIdentity = that.idtyDAL.unExcludeIdentity;


  this.listLocalPendingCerts = function() {
    return that.certDAL.listLocalPending();
  };

  this.registerNewCertification = function(cert) {
    return that.certDAL.saveNewCertification(cert);
  };

  this.saveTransaction = function(tx) {
    return that.txsDAL.addPending(tx);
  };

  this.getTransactionsHistory = function(pubkey) {
    return Q({ sent: [], received: [] })
      .then(function(history){
        history.sending = [];
        history.receiving = [];
        return Q.all([
          that.txsDAL.getLinkedWithIssuer(pubkey),
          that.txsDAL.getLinkedWithRecipient(pubkey),
          that.txsDAL.getPendingWithIssuer(pubkey),
          that.txsDAL.getPendingWithRecipient(pubkey)
        ])
          .then(function(res){
            history.sent = res[0] || [];
            history.received = res[1] || [];
            history.sending = res[2] || [];
            history.pending = res[3] || [];
          }).then(() => history);
      });
  };

  this.getUDHistory = (pubkey) => co(function *() {
    let sources = yield that.sourcesDAL.getUDSources(pubkey);
    return {
      history: sources.map((src) => _.extend({
        block_number: src.number
      }, src))
    };
  });

  this.savePeer = function(peer) {
    return that.peerDAL.savePeer(peer);
  };

  this.getUniqueIssuersBetween = (start, end) => co(function *() {
    let current = yield that.blockDAL.getCurrent();
    let firstBlock = Math.max(0, start);
    let lastBlock = Math.max(0, Math.min(current.number - 1, end));
    let blocks = yield that.blockDAL.getBlocks(firstBlock, lastBlock);
    return _.chain(blocks).pluck('issuer').uniq().value();
  });

  /***********************
   *    CONFIGURATION
   **********************/

  this.getParameters = function() {
    return that.confDAL.getParameters();
  };

  this.loadConf = (overrideConf, defaultConf) => co(function *() {
    let conf = Configuration.statics.complete(overrideConf || {});
    if (!defaultConf) {
      let savedConf = yield that.confDAL.loadConf();
      conf = _(savedConf).extend(overrideConf || {});
    }
    currency = conf.currency;
    return conf;
  });

  this.saveConf = function(confToSave) {
    currency = confToSave.currency;
    return that.confDAL.saveConf(confToSave);
  };

  /***********************
   *     STATISTICS
   **********************/

  this.loadStats = that.statDAL.loadStats;
  this.getStat = that.statDAL.getStat;
  this.pushStats = that.statDAL.pushStats;

  this.close = () => co(function *() {
    yield _.values(that.newDals).map((dal) => dal.close && dal.close());
    return Q.nbind(sqlite.close, sqlite);
  });

  this.resetAll = function(done) {
    var files = ['stats', 'cores', 'current', 'conf', UCOIN_DB_NAME, UCOIN_DB_NAME + '.db', WOTB_FILE];
    var dirs  = ['blocks', 'ud_history', 'branches', 'certs', 'txs', 'cores', 'sources', 'links', 'ms', 'identities', 'peers', 'indicators', 'leveldb'];
    return resetFiles(files, dirs, done);
  };

  this.resetData = function(done) {
    var files = ['stats', 'cores', 'current', UCOIN_DB_NAME, UCOIN_DB_NAME + '.db', WOTB_FILE];
    var dirs  = ['blocks', 'ud_history', 'branches', 'certs', 'txs', 'cores', 'sources', 'links', 'ms', 'identities', 'peers', 'indicators', 'leveldb'];
    return resetFiles(files, dirs, done);
  };

  this.resetConf = function(done) {
    var files = ['conf'];
    var dirs  = [];
    return resetFiles(files, dirs, done);
  };

  this.resetStats = function(done) {
    var files = ['stats'];
    var dirs  = ['ud_history'];
    return resetFiles(files, dirs, done);
  };

  this.resetPeers = function(done) {
    var files = [];
    var dirs  = ['peers'];
    return co(function *() {
      that.peerDAL.removeAll();
      yield resetFiles(files, dirs);
      return that.close();
    })
      .then(() => done && done())
      .catch((err) => done && done(err));
  };

  this.resetTransactions = function(done) {
    var files = [];
    var dirs  = ['txs'];
    return resetFiles(files, dirs, done);
  };

  function resetFiles(files, dirs, done) {
    return co(function *() {
      for (let i = 0, len = files.length; i < len; i++) {
        let fName = files[i];
        // JSON file?
        let existsJSON = yield myFS.exists(rootPath + '/' + fName + '.json');
        if (existsJSON) {
          yield myFS.remove(rootPath + '/' + fName + '.json');
        } else {
          // Normal file?
          let existsFile = yield myFS.exists(rootPath + '/' + fName);
          if (existsFile) {
            yield myFS.remove(rootPath + '/' + fName);
          }
        }
      }
      for (let i = 0, len = dirs.length; i < len; i++) {
        let dirName = dirs[i];
        let existsDir = yield myFS.exists(rootPath + '/' + dirName);
        if (existsDir) {
          yield myFS.removeTree(rootPath + '/' + dirName);
        }
      }
      done && done();
    })
      .catch((err) => done && done(err));
  }
}
