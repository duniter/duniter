"use strict";
var Q       = require('q');
var co      = require('co');
var _       = require('underscore');
var sha1    = require('sha1');
var path    = require('path');
var Configuration = require('../entity/configuration');
var Membership = require('../entity/membership');
var Merkle = require('../entity/merkle');
var Transaction = require('../entity/transaction');
var constants = require('../constants');
var ConfDAL = require('./fileDALs/confDAL');
var StatDAL = require('./fileDALs/statDAL');
var CertDAL = require('./fileDALs/CertDAL');
var TxsDAL = require('./fileDALs/TxsDAL');
var SourcesDAL = require('./fileDALs/SourcesDAL');
var LinksDAL = require('./fileDALs/LinksDAL');
var MembershipDAL = require('./fileDALs/MembershipDAL');
var IdentityDAL = require('./fileDALs/IdentityDAL');
var IndicatorsDAL = require('./fileDALs/IndicatorsDAL');
var PeerDAL = require('./fileDALs/PeerDAL');
var BlockDAL = require('./fileDALs/BlockDAL');
var CFSStorage = require('./fileDALs/AbstractCFS');
var lokijs = require('lokijs');
var logger = require('../../lib/logger')('database');

module.exports = {
  memory: function(profile) {
    return getHomeFS(profile, true)
      .then(function(params) {
        let loki = new lokijs('ucoin', { autosave: false });
        return Q(new FileDAL(profile, params.home, "", params.fs, null, 'fileDal', loki));
      });
  },
  file: function(profile, forConf) {
    return getHomeFS(profile, false)
      .then(function(params) {
        return Q.Promise(function(resolve){
          let loki;
          if (forConf) {
            // Memory only service dals
            loki = new lokijs('temp', { autosave: false });
            resolve(loki);
          } else {
            logger.info('Loading...');
            loki = new lokijs(path.join(params.home, 'ucoin.json'), {
              autoload: true,
              autosave: true,
              autosaveInterval: 30000,
              autoloadCallback: function() {
                resolve(loki);
              }
            });
          }
        })
          .then(function(loki){
            loki.autosaveClearFlags();
            return new FileDAL(profile, params.home, "", params.fs, null, 'fileDal', loki);
          });
      });
  },
  FileDAL: FileDAL
};

function someDelayFix() {
  return Q.Promise(function(resolve){
    setTimeout(resolve, 100);
  });
}

function getHomeFS(profile, isMemory) {
  let userHome = process.env.HOME || process.env.HOMEPATH || process.env.USERPROFILE;
  let home = userHome + '/.config/ucoin/' + profile;
  let fs;
  return someDelayFix()
    .then(function() {
      fs = (isMemory ? require('q-io/fs-mock')({}) : require('q-io/fs'));
      return fs.makeTree(home);
    })
    .then(function(){
      return { fs: fs, home: home };
    });
}

function FileDAL(profile, home, localDir, myFS, parentFileDAL, dalName, loki) {

  var that = this;

  let localHome = path.join(home, localDir);

  this.name = dalName;
  this.profile = profile;
  this.parentDAL = parentFileDAL;

  var rootPath = home;

  let blocksCFS = require('../cfs')(rootPath, myFS);

  // DALs
  this.confDAL = new ConfDAL(rootPath, myFS, parentFileDAL && parentFileDAL.confDAL.coreFS, that, CFSStorage);
  this.peerDAL = new PeerDAL(rootPath, myFS, parentFileDAL && parentFileDAL.peerDAL.coreFS, that, CFSStorage);
  this.blockDAL = new BlockDAL(loki, blocksCFS, getLowerWindowBlock);
  this.sourcesDAL = new SourcesDAL(loki);
  this.txsDAL = new TxsDAL(loki);
  this.indicatorsDAL = new IndicatorsDAL(rootPath, myFS, parentFileDAL && parentFileDAL.indicatorsDAL.coreFS, that, CFSStorage);
  this.statDAL = new StatDAL(rootPath, myFS, parentFileDAL && parentFileDAL.statDAL.coreFS, that, CFSStorage);
  this.linksDAL = new LinksDAL(loki);
  this.idtyDAL = new IdentityDAL(loki);
  this.certDAL = new CertDAL(loki);
  this.msDAL = new MembershipDAL(loki);

  this.newDals = {
    'peerDAL': that.peerDAL,
    'indicatorsDAL': that.indicatorsDAL,
    'confDAL': that.confDAL,
    'statDAL': that.statDAL
  };

  var currency = '';

  this.init = (overrideConf, defaultConf) => {
    return co(function *() {
      yield _.values(that.newDals).map((dal) => dal.init());
      return that.loadConf(overrideConf, defaultConf);
    });
  };

  function getLowerWindowBlock() {
    return co(function *() {
      let rootBlock = yield that.getRootBlock();
      if (!rootBlock) {
        return -1;
      }
      let conf = getParameters(rootBlock);
      let maxBlock = getMaxBlocksToStoreAsFile(conf);
      let current = yield that.getCurrentBlockOrNull();
      let currentNumber = current ? current.number : -1;
      return currentNumber - maxBlock;
    });
  }

  function getParameters(block) {
    var sp = block.parameters.split(':');
    let theConf = {};
    theConf.c                = parseFloat(sp[0]);
    theConf.dt               = parseInt(sp[1]);
    theConf.ud0              = parseInt(sp[2]);
    theConf.sigDelay         = parseInt(sp[3]);
    theConf.sigValidity      = parseInt(sp[4]);
    theConf.sigQty           = parseInt(sp[5]);
    theConf.sigWoT           = parseInt(sp[6]);
    theConf.msValidity       = parseInt(sp[7]);
    theConf.stepMax          = parseInt(sp[8]);
    theConf.medianTimeBlocks = parseInt(sp[9]);
    theConf.avgGenTime       = parseInt(sp[10]);
    theConf.dtDiffEval       = parseInt(sp[11]);
    theConf.blocksRot        = parseInt(sp[12]);
    theConf.percentRot       = parseFloat(sp[13]);
    theConf.currency         = block.currency;
    return theConf;
  }

  function getMaxBlocksToStoreAsFile(aConf) {
    return Math.floor(Math.max(aConf.dt / aConf.avgGenTime, aConf.medianTimeBlocks, aConf.dtDiffEval, aConf.blocksRot) * constants.SAFE_FACTOR);
  }

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
        if (block.hash != hash) throw "Not found";
        else return block;
      }));
  };

  this.getCurrent = function(done) {
    return that.getBlockCurrent(done);
  };

  this.getCurrentBlockOrNull = function(done) {
    return nullIfErrorIs(that.getBlockCurrent(), constants.ERROR.BLOCK.NO_CURRENT_BLOCK, done);
  };

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

  this.getLastSavedBlockFileNumber = function() {
    return that.blockDAL.getLastSavedBlockFileNumber();
  };

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

  this.getBlocksUntil = function(number) {
    return that.getBlocksBetween(0, number);
  };

  this.getValidLinksFrom = function(from) {
    return that.linksDAL.getValidLinksFrom(from);
  };

  this.getValidLinksTo = function(to) {
    return that.linksDAL.getValidLinksTo(to);
  };

  this.getObsoletesFromTo = function(from, to) {
    return that.linksDAL.getObsoleteLinksFromTo()
      .then(function(links){
        return _.chain(links).
          where({ target: to, source: from }).
          sortBy(function(lnk){ return -lnk.timestamp; }).
          value();
      });
  };

  this.getValidFromTo = function(from, to) {
    return that.getValidLinksFrom(from)
      .then(function(links){
        return _.chain(links).
          where({ target: to }).
          value();
      });
  };

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

  this.getIdentityByHashWithCertsOrNull = function(hash) {
    return that.getIdentityByHashOrNull(hash)
      .catch(function(){
        return null;
      })
      .then(function(idty){
        return that.fillIdentityWithCerts(idty);
      });
  };

  this.fillIdentitiesWithCerts = function(idties) {
    return idties.reduce(function(p, aIdty) {
      return that.certDAL.getToTarget(aIdty.hash)
        .then(function(certs){
          aIdty.certs = certs;
          return Q();
        });
    }, Q())
      .then(() => idties);
  };

  this.fillIdentityWithCerts = function(idty) {
    if (!idty) {
      return Q(null);
    }
    return that.certDAL.getToTarget(idty.hash)
      .then(function(certs){
        idty.certs = certs;
        return idty;
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
      })
      .then(function(idty){
        return that.fillIdentityWithCerts(idty);
      });
  };

  this.searchIdentity = function(search) {
    return Q.all([
      that.idtyDAL.getWhoIsOrWasMember(),
      that.idtyDAL.getPendingIdentities()
    ])
      .then(function(res){
        var idties = _.chain(res[0]).
          where({ revoked: false }).
          filter(function(idty){ return idty.pubkey.match(new RegExp(search, 'i')) || idty.uid.match(new RegExp(search, 'i')); }).
          value();
        var pendings = _.chain(res[1]).
          where({ revoked: false }).
          filter(function(idty){ return idty.pubkey.match(new RegExp(search, 'i')) || idty.uid.match(new RegExp(search, 'i')); }).
          value();
        var hashes = _.pluck(idties, 'hash');
        pendings.forEach(function(pending){
          if (hashes.indexOf(pending.hash) == -1) {
            idties.push(pending);
          }
        });
        return that.fillIdentitiesWithCerts(idties);
      });
  };

  this.searchJustIdentities = (search) => co(function *() {
    let found = yield that.idtyDAL.searchThoseMatching(search);
    return found;
  });

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

  this.listPendingLocalMemberships = function() {
    return that.msDAL.getPendingLocal();
  };

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

  this.existsLinkFromOrAfterDate = function(from, to, maxDate) {
    return co(function *() {
      var links = yield that.linksDAL.getValidLinksFrom(from);
      var matching = _.chain(links).
        where({ target: to }).
        filter(function(lnk){ return lnk.timestamp >= maxDate; }).
        value();
      return matching.length ? true : false;
    });
  };

  this.existsNotConsumed = function(type, pubkey, number, fingerprint, amount) {
    return that.sourcesDAL.isAvailableSource(pubkey, type, number, fingerprint, amount);
  };

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

  this.isLeaving = function(pubkey, done) {
    return that.idtyDAL.getFromPubkey(pubkey)
      .then(function(idty){
        done && done(null, idty.leaving);
        return true;
      })
      .catch(function(){
        done && done(null, false);
        return false;
      });
  };

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

  this.setConsumedSource = function(type, pubkey, number, fingerprint, amount) {
    return that.sourcesDAL.consumeSource(pubkey, type, number, fingerprint, amount);
  };

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

  this.setRevoked = function(hash, done) {
    return that.idtyDAL.getByHash(hash)
      .then(function(idty){
        idty.revoked = true;
        return that.idtyDAL.saveIdentity(idty);
      })
      .then(function(){
        done && done();
      })
      .catch(done);
  };

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

  this.getCertificationExcludingBlock = function(current, certValidtyTime, certDelay) {
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
        if (delaySinceStart > certValidtyTime + certDelay) {
          return that.indicatorsDAL.writeCurrentExcludingForCert(root).then(() => root);
        }
      } else {
        // Check current position
        let currentNextBlock = yield that.getBlock(currentExcluding.number + 1);
        if (isExcluding(current, currentExcluding, currentNextBlock, certValidtyTime, certDelay)) {
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
            let isValidPeriod = delaySinceMiddle <= certValidtyTime + certDelay;
            let isValidPeriodB = delaySinceNextB <= certValidtyTime + certDelay;
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

  function isExcluding(current, excluding, nextBlock, certValidtyTime, certDelay) {
    var delaySinceMiddle = current.medianTime - excluding.medianTime;
    var delaySinceNextB = current.medianTime - nextBlock.medianTime;
    let isValidPeriod = delaySinceMiddle <= certValidtyTime + certDelay;
    let isValidPeriodB = delaySinceNextB <= certValidtyTime + certDelay;
    return !isValidPeriod && isValidPeriodB;
  }

  this.kickWithOutdatedMemberships = (maxNumber) => this.idtyDAL.kickMembersForMembershipBelow(maxNumber);

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

  this.setPeerDown = function(pubkey) {
    return that.getPeer(pubkey)
      .then(function(p){
        p.status = 'DOWN';
        return that.peerDAL.savePeer(p);
      })
      .catch(function() {
        // Silent error
      });
  };

  this.saveBlock = function(block, done) {
    block.wrong = false;
    return Q()
      .then(function() {
        return Q.all([
          that.saveBlockInFile(block, true),
          that.saveTxsInFiles(block.transactions, { block_number: block.number, time: block.medianTime }),
          that.saveMemberships('join', block.joiners),
          that.saveMemberships('active', block.actives),
          that.saveMemberships('leave', block.leavers)
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

  this.saveMemberships = function (type, mss) {
    var msType = type == 'leave' ? 'out' : 'in';
    return mss.reduce(function(p, msRaw) {
      return p.then(function(){
        var ms = Membership.statics.fromInline(msRaw, type == 'leave' ? 'OUT' : 'IN', that.getCurrency());
        ms.type = type;
        ms.hash = String(sha1(ms.getRawSigned())).toUpperCase();
        return that.msDAL.saveOfficialMS(msType, ms);
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

  this.merkleForPeers = function(done) {
    return that.listAllPeersWithStatusNewUP()
      .then(function(peers){
        var leaves = peers.map(function(peer) { return peer.hash; });
        var merkle = new Merkle();
        merkle.initialize(leaves);
        done && done(null, merkle);
        return merkle;
      })
      .catch(function(err){
        done && done(err);
        throw err;
      });
  };

  this.saveLink = function(link) {
    return that.linksDAL.addLink(link);
  };

  this.removeLink = (link) =>
    that.linksDAL.removeLink(link);

  this.removeAllSourcesOfBlock = (number) =>
    that.sourcesDAL.removeAllSourcesOfBlock(number);

  this.unConsumeSource = (type, pubkey, number, fingerprint, amount, time, block_hash) =>
    that.sourcesDAL.unConsumeSource(type, pubkey, number, fingerprint, amount, time, block_hash);

  this.saveSource = function(src) {
    return that.sourcesDAL.addSource('available', src.pubkey, src.type, src.number, src.fingerprint, src.amount, src.block_hash, src.time);
  };

  this.officializeCertification = function(cert) {
    return that.certDAL.saveOfficial(cert);
  };

  this.saveCert = (cert) =>
    that.certDAL.saveCert(cert);

  this.listLocalPendingIdentities = function() {
    return that.idtyDAL.listLocalPending();
  };

  this.savePendingIdentity = function(idty) {
    return that.idtyDAL.saveIdentity(idty);
  };

  this.excludeIdentity = function(pubkey) {
    return that.idtyDAL.excludeIdentity(pubkey);
  };

  this.newIdentity = function(idty, onBlock) {
    return that.idtyDAL.newIdentity(idty, onBlock);
  };

  this.joinIdentity = function(pubkey, onBlock) {
    return that.idtyDAL.joinIdentity(pubkey, onBlock);
  };

  this.activeIdentity = function(pubkey, onBlock) {
    return that.idtyDAL.activeIdentity(pubkey, onBlock);
  };

  this.leaveIdentity = function(pubkey, onBlock) {
    return that.idtyDAL.leaveIdentity(pubkey, onBlock);
  };

  this.unacceptIdentity = that.idtyDAL.unacceptIdentity;

  this.unJoinIdentity = (ms) => co(function *() {
    yield that.idtyDAL.unJoinIdentity(ms);
    that.msDAL.unwriteMS(ms);
  });

  this.unRenewIdentity = (ms) => co(function *() {
    yield that.idtyDAL.unRenewIdentity(ms);
    that.msDAL.unwriteMS(ms);
  });

  this.unLeaveIdentity = (ms) => co(function *() {
    yield that.idtyDAL.unLeaveIdentity(ms);
    that.msDAL.unwriteMS(ms);
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

  this.getUDHistory = function(pubkey, done) {
    return that.sourcesDAL.getUDSources(pubkey)
      .then(function(sources){
        return {
          history: sources.map((src) => _.extend({
            block_number: src.number
          }, src))
        };
      })
      .then(function(obj){
        done && done(null, obj);
        return obj;
      })
      .catch(function(err){
        done && done(err);
        throw err;
      });
  };

  this.savePeer = function(peer) {
    return that.peerDAL.savePeer(peer);
  };

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
  this.saveStat = that.statDAL.saveStat;
  this.pushStats = that.statDAL.pushStats;

  this.needsSave = function() {
    return loki.autosaveDirty();
  };

  this.close = function() {
    if (that.needsSave()) {
      return Q.nbind(loki.saveDatabase, loki)();
    }
    return Q();
  };

  this.resetAll = function(done) {
    var files = ['stats', 'cores', 'current', 'conf', 'ucoin'];
    var dirs  = ['blocks', 'ud_history', 'branches', 'certs', 'txs', 'cores', 'sources', 'links', 'ms', 'identities', 'peers', 'indicators', 'leveldb'];
    return resetFiles(files, dirs, done);
  };

  this.resetData = function(done) {
    var files = ['stats', 'cores', 'current', 'ucoin'];
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
    return resetFiles(files, dirs, done);
  };

  this.resetTransactions = function(done) {
    var files = [];
    var dirs  = ['txs'];
    return resetFiles(files, dirs, done);
  };

  function resetFiles(files, dirs, done) {
    return Q.all([

      // Remove files
      Q.all(files.map(function(fName) {
        return myFS.exists(rootPath + '/' + fName + '.json')
          .then(function(exists){
            return exists ? myFS.remove(rootPath + '/' + fName + '.json') : Q();
          });
      })),

      // Remove directories
      Q.all(dirs.map(function(dirName) {
        return myFS.exists(rootPath + '/' + dirName)
          .then(function(exists){
            return exists ? myFS.removeTree(rootPath + '/' + dirName) : Q();
          });
      }))
    ])
      .then(function(){
        done && done();
      })
      .catch(function(err){
        done && done(err);
      });
  }
}
