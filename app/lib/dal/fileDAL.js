"use strict";
var Q       = require('q');
var _       = require('underscore');
var sha1    = require('sha1');
var async   = require('async');
var moment = require('moment');
var util = require('util');
var Identity = require('../entity/identity');
var Membership = require('../entity/membership');
var Merkle = require('../entity/merkle');
var Configuration = require('../entity/configuration');
var Transaction = require('../entity/transaction');
var Source = require('../entity/source');
var constants = require('../constants');

var BLOCK_FILE_PREFIX = "0000000000";
var BLOCK_FOLDER_SIZE = 500;
var SAVE_HEADERS_INTERVAL = 3000;

module.exports = {
  memory: function(profile, subPath) {
    return getHomeFS(profile, subPath, true)
      .then(function(params) {
        return Q(new FileDAL(profile, subPath, params.fs));
      });
  },
  file: function(profile, subPath) {
    return getHomeFS(profile, subPath, false)
      .then(function(params) {
        return new FileDAL(profile, subPath, params.fs);
      });
  }
};

function someDelayFix() {
  return Q.Promise(function(resolve){
    setTimeout(resolve, 100);
  });
}

function getHomeFS(profile, subpath, isMemory) {
  var home = getUCoinHomePath(profile, subpath);
  var fs;
  return someDelayFix()
    .then(function() {
      fs = (isMemory ? require('q-io/fs-mock')({}) : require('q-io/fs'));
      return fs.makeTree(home);
    })
    .then(function(){
      return { fs: fs, home: home };
    });
}

function getUCoinHomePath(profile) {
  var userHome = process.env.HOME || process.env.HOMEPATH || process.env.USERPROFILE;
  return userHome + '/.config/ucoin/' + profile;
}

function FileDAL(profile, subPath, myFS) {

  var that = this;

  this.profile = profile;

  var rootPath = getUCoinHomePath(profile) + (subPath ? '/' + subPath : '');
  var logger = require('../../lib/logger')(profile);

  var headers = [];
  var links = [];
  var certs = [];
  var sources = [];
  var memberships = [];
  var identities = [];
  var txs = [];
  var peers = [];
  var merkles = [];
  var global = { currentNumber: -1 };
  var conf = {};

  var lastBlockFileNumber = -1;

  var dalLoaded;
  function onceLoadedDAL() {
    return dalLoaded || (dalLoaded = (function () {
        return Q.all([
          loadIntoArray(headers, 'headers.json'),
          loadIntoArray(links, 'links.json'),
          loadIntoArray(certs, 'certs.json'),
          loadIntoArray(sources, 'sources.json'),
          loadIntoArray(memberships, 'memberships.json'),
          loadIntoArray(identities, 'identities.json'),
          loadIntoArray(txs, 'txs.json'),
          loadIntoArray(peers, 'peers.json'),
          loadIntoArray(merkles, 'merkles.json'),
          loadIntoObject(conf, 'conf.json'),
          loadIntoObject(global, 'global.json'),
          getCurrentMaxNumberInBlockFiles()
            .then(function(max){
              lastBlockFileNumber = max;
            })
        ])
          .then(function(){
            if (lastBlockFileNumber + 1 > headers.length) {
              return _.range(headers.length, Math.min(global.currentNumber + 1, lastBlockFileNumber + 1)).reduce(function(promise, number){
                return promise.then(function(){
                    return that.readFileOfBlock.now(number);
                  })
                  .then(function(block){
                    return that.addHead.now(JSON.parse(block));
                  })
                  .fail(function(err){
                    throw err;
                  });
              }, Q());
            }
          })
          .then(function(){
            var lastSavedHeader = -1;
            function saveHeaders() {
              if (headers.length > 0 && lastSavedHeader < headers[headers.length - 1].number) {
                lastSavedHeader = headers[headers.length - 1].number;
                that.saveHeadsInFile(headers);
              }
            }
            saveHeaders();
            setInterval(saveHeaders, SAVE_HEADERS_INTERVAL);
          });
      })());
  }

  function folderOfBlock(blockNumber) {
    return (Math.floor(blockNumber / BLOCK_FOLDER_SIZE) + 1) * BLOCK_FOLDER_SIZE;
  }

  function pathOfBlock(blockNumber) {
    return rootPath + '/blocks/' + folderOfBlock(blockNumber) + '/' + blockFileName(blockNumber) + '.json';
  }

  this.hasFileOfBlock = function(blockNumber) {
    if(blockNumber > lastBlockFileNumber) {
      // Update the current last number
      return that.getCurrentMaxNumberInBlockFilesMember()
        .then(function(maxNumber){
          lastBlockFileNumber = maxNumber;
          return blockNumber <= lastBlockFileNumber;
        });
    } else {
      return true;
    }
  };

  this.getCurrentMaxNumberInBlockFilesMember = getCurrentMaxNumberInBlockFiles;

  function getCurrentMaxNumberInBlockFiles() {
    // Look in local files
    return myFS.makeTree(rootPath + '/blocks/')
      .then(function(){
        return myFS.list(rootPath + '/blocks/');
      })
      .then(function(files){
        if(files.length == 0){
          return -1;
        } else {
          var maxDir = _.max(files, function(dir){ return parseInt(dir); });
          return myFS.list(rootPath + '/blocks/' + maxDir + '/')
            .then(function(files){
              if(files.length > 0) {
                return parseInt(_.max(files, function (f) {
                  return parseInt(f);
                }).replace(/\.json/, ''));
              }
              else{
                // Last number is the one of the directory, minus the chunk of director, minus 1
                return maxDir - BLOCK_FOLDER_SIZE - 1;
              }
            });
        }
      });
  }

  this.readFileOfBlock = function(blockNumber) {
    return myFS.read(pathOfBlock(blockNumber));
  };

  that.writeFileOfBlock = function(block) {
    return myFS.write(pathOfBlock(block.number), JSON.stringify(block, null, ' '))
      .then(function(){
        global.lastSavedBlockFile = Math.max(global.lastSavedBlockFile || 0, block.number);
        return that.writeJSON(global, 'global.json');
      });
  };

  var blocksTreeLoaded = {};
  this.onceMadeTree = function(blockNumber) {
    var folder = folderOfBlock(blockNumber);
    if (!blocksTreeLoaded[folder]) {
      blocksTreeLoaded[folder] = ((function () {
        return myFS.makeTree(rootPath + '/blocks/' + folderOfBlock(blockNumber));
      })());
    }
    return blocksTreeLoaded[folder];
  };

  function loadIntoArray(theArray, fileName) {
    return myFS.read(rootPath + '/' + fileName)
      .then(function (data) {
        JSON.parse(data).forEach(function(item){
          theArray.push(item);
        });
      })
      .fail(function() {
      });
  }

  function loadIntoObject(obj, fileName) {
    return myFS.read(rootPath + '/' + fileName)
      .then(function (data) {
        _.extend(obj, JSON.parse(data));
      })
      .fail(function() {
      });
  }

  this.listAllPeers = function(done) {
    done && done(null, peers);
    return Q(peers);
  };

  this.nullIfError = function(promise, done) {
    return promise
      .then(function(p){
        done && done(null, p);
        return p;
      })
      .fail(function(){
        done && done(null, null);
        return null;
      });
  };

  this.getParameters = function(done) {
    var parameters = {
      "currency": conf.currency,
      "c": conf.c,
      "dt": conf.dt,
      "ud0": conf.ud0,
      "sigDelay": conf.sigDelay,
      "sigValidity": conf.sigValidity,
      "sigQty": conf.sigQty,
      "sigWoT": conf.sigWoT,
      "msValidity": conf.msValidity,
      "stepMax": 3, // uCoin only handles 3 step currencies for now
      "medianTimeBlocks": conf.medianTimeBlocks,
      "avgGenTime": conf.avgGenTime,
      "dtDiffEval": conf.dtDiffEval,
      "blocksRot": conf.blocksRot,
      "percentRot": conf.percentRot
    };
    done && done(null, parameters);
    return Q(parameters);
  };

  this.getPeer = function(pubkey, done) {
    var matching = _.chain(peers).
      where({ pubkey: pubkey }).
      value();
    done && done(!matching[0] && 'Unknown peer ' + pubkey, matching[0] || null);
    return Q(matching[0] || null);
  };

  this.getBlock = function(number, done) {
    return that.readFileOfBlock(number)
      .then(function(data) {
        return JSON.parse(data);
      })
      .fail(function(){
        throw 'Block not found';
      })
      .then(function(conf){
        done && done(null, conf);
        return conf;
      })
      .fail(function(err){
        done && done(err);
        throw err;
      });
  };

  this.getBlockByNumberAndHash = function(number, hash, done) {
    return that.readFileOfBlock(number)
      .then(function(data) {
        return JSON.parse(data);
      })
      .then(function(block){
        if (block.hash != hash) throw "Not found";
        else return block;
      })
      .fail(function(){
        throw 'Block not found';
      })
      .then(function(conf){
        done && done(null, conf);
        return conf;
      })
      .fail(function(err){
        done && done(err);
        throw err;
      });
  };

  this.getCurrent = function(done) {
    return that.getBlockCurrent(done);
  };

  this.getCurrentBlockOrNull = function(done) {
    return that.nullIfError(that.getBlockCurrent(), done);
  };

  this.getPromoted = function(number, done) {
    return that.getBlock(number, done);
  };

  // Block
  this.getLastBeforeOrAt = function (t, done) {
    var blocks =_.chain(headers).
      filter(function(b) { return b.medianTime <= t; }).
      sortBy(function(b){ return -b.number; }).
      value();
    done && done(null, blocks[0]);
    return blocks[0];
  };

  this.lastUDBlock = function(done) {
    var blocks =_.chain(headers).
      filter(function(b) { return b.dividend > 0; }).
      sortBy(function(b){ return -b.number; }).
      value();
    done && done(null, blocks[0]);
    return blocks[0];
  };

  this.getRootBlock = function(done) {
    var blocks =_.chain(headers).
      where({ number: 0 }).
      sortBy(function(b){ return -b.number; }).
      value();
    done && done(null, blocks[0]);
    return blocks[0];
  };

  this.lastBlocksOfIssuer = function(issuer, count, done) {
    var blocks =_.chain(headers).
      where({ issuer: issuer }).
      sortBy(function(b){ return b.number; }).
      last(count).
      value();
    done && done(null, blocks);
    return blocks;
  };

  this.getBlocksBetween = function(start, end, done) {
    var blocks =_.chain(headers).
      filter(function(b){ return b.number >= start; }).
      filter(function(b){ return b.number <= end; }).
      sortBy(function(b){ return -b.number; }).
      value();
    done && done(null, blocks);
    return blocks;
  };

  this.getCurrentNumber = function() {
    return Q(global.currentNumber);
  };

  this.getLastSavedBlockFileNumber = function() {
    return Q(global.lastSavedBlockFile || -1);
  };

  this.getBlockCurrent = function(done) {
    return that.getCurrentNumber()
      .then(function(number) {
        if (number != -1)
          return that.getBlock(number);
        else
          throw 'No current block';
      })
      .then(function(block){
        done && done(null, block);
        return block;
      });
  };

  this.getBlockFrom = function(number, done) {
    var blocks =_.chain(headers).
      filter(function(b){ return b.number >= number; }).
      sortBy(function(b){ return b.number; }).
      value();
    done && done(null, blocks);
    return blocks;
  };

  this.getBlocksUntil = function(number, done) {
    var blocks =_.chain(headers).
      filter(function(b){ return b.number < number; }).
      sortBy(function(b){ return b.number; }).
      value();
    done && done(null, blocks);
    return blocks;
  };

  this.getValidLinksFrom = function(from, done) {
    var matching =_.chain(links).
      where({ source: from, obsolete: false }).
      value();
    done && done(null, matching);
    return matching;
  };

  this.getValidLinksTo = function(to, done) {
    var matching =_.chain(links).
      where({ target: to, obsolete: false }).
      value();
    done && done(null, matching);
    return matching;
  };

  this.currentValidLinks = function(fpr, done) {
    var matching = _.chain(links).
      where({ target: fpr, obsolete: false }).
      value();
    done && done(null, matching);
    return matching;
  };

  this.getObsoletesFromTo = function(from, to, done) {
    var matching =_.chain(links).
      where({ source: from, target: to, obsolete: true }).
      sortBy(function(lnk){ return -lnk.timestamp; }).
      first(1).
      value();
    done && done(null, matching);
    return matching;
  };

  this.getValidFromTo = function(from, to, done) {
    var matching =_.chain(links).
      where({ source: from, target: to, obsolete: false }).
      value();
    done && done(null, matching);
    return matching;
  };

  this.getAvailableSourcesByPubkey = function(pubkey, done) {
    var matching =_.chain(sources).
      where({ pubkey: pubkey, consumed: false }).
      value();
    done && done(null, matching);
    return matching;
  };

  this.getIdentityByPubkeyAndHashOrNull = function(pubkey, hash, done) {
    var matching = _.chain(identities).
      where({ pubkey: pubkey, hash: hash }).
      value();
    done && done(null, matching[0] || null);
    return matching[0] || null;
  };

  this.getIdentityByHashOrNull = function(hash, done) {
    var matching = _.chain(identities).
      where({ hash: hash }).
      value();
    done && done(null, matching[0] || null);
    return matching[0] || null;
  };

  this.getIdentityByHashWithCertsOrNull = function(hash, done) {
    return that.fillIdentityWithCerts(Q(that.getIdentityByHashOrNull(hash)), done);
  };

  this.fillIdentityWithCerts = function(idtyPromise, done) {
    return idtyPromise
      .then(function(idty){
        if (idty) {
          idty.certs = _.chain(certs).where({target: idty.hash}).value();
        }
        done && done(null, idty);
        return idty;
      })
      .fail(function(){
        done && done(null, null);
        return null;
      })
  };

  this.getMembers = function(done) {
    var matching = _.chain(identities).
      where({ member: true }).
      value();
    done && done(null, matching);
    return matching;
  };

  this.getWritten = function(pubkey, done) {
    return that.fillInMembershipsOfIdentity(
      Q(_.chain(identities).
        where({ pubkey: pubkey, wasMember: true }).
        value()[0] || null), done);
  };

  this.fillInMembershipsOfIdentity = function(queryPromise, done) {
    return Q(queryPromise)
      .tap(function(row){
        if (row) {
          row.memberships = [].concat(
            _.where(memberships, { type: 'join', issuer: row.pubkey })
          ).concat(
            _.where(memberships, { type: 'active', issuer: row.pubkey })
          ).concat(
            _.where(memberships, { type: 'leave', issuer: row.pubkey })
          );
        }
      })
      .then(function(rows){
        done && done(null, rows);
        return rows;
      })
      .fail(function(err){
        done && done(null, null);
      });
  };

  this.findPeersWhoseHashIsIn = function(hashes, done) {
    var matching = _.chain(peers).
      filter(function(p){ return hashes.indexOf(p.hash) !== -1; }).
      value();
    done && done(null, matching);
    return matching;
  };

  this.getTxByHash = function(hash, done) {
    return myFS.read(rootPath + '/tx/' + hash + '.json')
      .fail(function(){
        return _.chain(txs).
          where({ hash: hash }).
          value()[0] || null;
      })
      .then(function(tx){
        done && done(null, tx);
        return tx;
      })
      .fail(function(err){
        done && done(err);
        throw err;
      });
  };

  this.removeTxByHash = function(hash, done) {
    txs = _.chain(txs).
      reject(function(tx){ return tx.hash == hash; }).
      value();
    return that.writeJSON(txs, 'txs.json')
      .then(function(){
        done && done();
      })
      .fail(function(err){
        done && done(err);
        throw err;
      });
  };

  this.findAllWaitingTransactions = function(done) {
    done && done(null, txs);
    return txs;
  };

  this.getNonWritten = function(pubkey, done) {
    var matching = _.chain(identities).
      where({ pubkey: pubkey, wasMember: false }).
      value();
    done && done(null, matching);
    return matching;
  };

  this.getToBeKicked = function(done) {
    var matching =_.chain(identities).
      where({ kick: true }).
      value();
    done && done(null, matching);
    return matching;
  };

  this.getWrittenByUID = function(uid, done) {
    return that.fillIdentityWithCerts(
      Q(_.chain(identities).
      where({ wasMember: true, uid: uid }).
      value()[0] || null), done);
  };

  this.searchIdentity = function(search, done) {
    return that.fillIdentityWithCerts(
      Q(_.chain(identities).
        where({ revoked: false }).
        filter(function(idty){ return idty.pubkey.match(new RegExp(search)) || idty.uid.match(new RegExp(search)); }).
        value()), done);
  };

  this.certsToTarget = function(hash, done) {
    var matching =_.chain(certs).
      where({ target: hash }).
      sortBy(function(c){ return -c.block; }).
      value();
    matching.reverse();
    done && done(null, matching);
    return matching;
  };

  this.certsFrom = function(pubkey, done) {
    var matching =_.chain(certs).
      where({ from: pubkey }).
      sortBy(function(c){ return c.block; }).
      value();
    done && done(null, matching);
    return matching;
  };

  this.certsFindNew = function(done) {
    var matching =_.chain(certs).
      where({ linked: false }).
      sortBy(function(c){ return -c.block; }).
      value();
    done && done(null, matching);
    return matching;
  };

  this.certsNotLinkedToTarget = function(hash) {
    return _.chain(certs).
      where({ linked: false, target: hash }).
      sortBy(function(c){ return -c.block; }).
      value();
  };

  this.certsTo = function(pubkey) {
    return _.chain(certs).
      where({ to: pubkey }).
      sortBy(function(c){ return -c.block; }).
      value();
  };

  this.getMembershipsForHashAndIssuer = function(hash, issuer, done) {
    var matching =_.chain(memberships).
      where({ issuer: issuer, fpr: hash }).
      sortBy(function(c){ return -c.sigDate; }).
      value();
    done && done(null, matching);
    return matching;
  };

  this.findNewcomers = function(done) {
    var matching =_.chain(memberships).
      where({ membership: 'IN' }).
      sortBy(function(c){ return -c.sigDate; }).
      value();
    done && done(null, matching);
    return matching;
  };

  this.findLeavers = function(done) {
    var matching =_.chain(memberships).
      where({ membership: 'OUT' }).
      sortBy(function(c){ return -c.sigDate; }).
      value();
    done && done(null, matching);
    return matching;
  };

  this.existsLinkFromOrAfterDate = function(from, to, maxDate) {
    var matching =_.chain(links).
      where({ source: from, target: to}).
      filter(function(lnk){ return lnk.timestamp >= maxDate; }).
      value();
    return matching.length ? true : false;
  };

  this.existsNotConsumed = function(type, pubkey, number, fingerprint, amount, done) {
    var matching =_.chain(sources).
      where({ type: type, pubkey: pubkey, number: number, fingerprint: fingerprint, amount: amount, consumed: false }).
      sortBy(function(src){ return -src.number; }).
      value();
    done && done(null, matching.length > 0);
    return matching.length > 0;
  };

  this.isMember = function(pubkey, done) {
    var matching = _.chain(identities).
      where({ pubkey: pubkey, member: true }).
      value();
    done && done(null, matching.length > 0);
    return matching.length > 0;
  };

  this.isMemberOrError = function(pubkey, done) {
    var matching = _.chain(identities).
      where({ pubkey: pubkey, member: true }).
      value();
    done && done((!matching.length && 'Is not a member') || null);
    return matching.length > 0;
  };

  this.isLeaving = function(pubkey, done) {
    var matching = _.chain(identities).
      where({ pubkey: pubkey, member: true, leaving: true }).
      value();
    done && done(null, matching.length > 0);
    return matching.length > 0;
  };

  this.isMembeAndNonLeaverOrError = function(pubkey, done) {
    var matching = _.chain(identities).
      where({ pubkey: pubkey, member: true, leaving: false }).
      value();
    done && done((!matching.length && 'Not a non-leaving member') || null);
    return matching.length > 0;
  };

  this.existsCert = function(cert, done) {
    var matching =_.chain(certs).
      where({ from: cert.pubkey, sig: cert.sig, block_number: cert.block_number, target: cert.target }).
      value();
    done && done(null, matching[0]);
    return matching[0];
  };

  this.obsoletesLinks = function(minTimestamp, done) {
    var matching = _.chain(links).
      filter(function(link){ return link.timestamp <= minTimestamp; }).
      value();
    matching.forEach(function(i){
        i.obsolete = true;
      });
    return matching.length ? that.writeJSON(links, 'links.json', done) : that.donable(Q(), done);
  };

  this.setConsumedSource = function(type, pubkey, number, fingerprint, amount, done) {
    var matching =_.chain(sources).
      where({ type: type, pubkey: pubkey, number: number, fingerprint: fingerprint, amount: amount }).
      sortBy(function(src){ return -src.number; }).
      value();
    matching[0].consumed = true;
    return that.writeJSON(sources, 'sources.json', done);
  };

  this.setKicked = function(pubkey, hash, notEnoughLinks, done) {
    var kicked = notEnoughLinks ? true : false;
    var matching =_.chain(identities).
      where({ pubkey: pubkey, hash: hash }).
      value();
    var oneChanged = false;
    matching.forEach(function(i){
      oneChanged = oneChanged || (!i.kick && kicked);
      i.kick = i.kick || kicked;
    });
    return oneChanged ? saveIdentitiesInFile(identities, function(err) {
      done && done(err);
    }) : that.donable(Q(), done);
  };

  this.deleteIfExists = function(ms, done) {
    var prevCount = memberships.length;
    memberships = _.reject(memberships, function(aMS) {
      return aMS.membership == ms.membership
        && aMS.issuer == ms.issuer
        && aMS.userid == ms.userid
        && aMS.certts == ms.certts
        && aMS.number == ms.number
        && aMS.fpr == ms.fpr;
    });
    return memberships.length != prevCount ? that.writeJSON(memberships, 'memberships.json', done) : that.donable(Q(), done);
  };

  this.kickWithOutdatedMemberships = function(maxNumber, done) {
    var matching =_.chain(identities).
      where({ member: true }).
      filter(function(i){ return i.currentMSN <= maxNumber; }).
      value();
    matching.forEach(function(i){
      i.kick = true;
    });
    return matching.length ? saveIdentitiesInFile(identities, function(err) {
      done && done(err);
    }) : that.donable(Q(), done);
  };

  this.getPeerOrNull = function(pubkey, done) {
    return that.nullIfError(that.getPeer(pubkey), done);
  };

  this.getBlockOrNull = function(number, done) {
    return that.nullIfError(that.getBlock(number), done);
  };

  this.getPeers = function(pubkeys, done) {
    return Q.all(pubkeys.map(function(pubkey) {
      return that.getPeerOrNull(pubkey);
    })).spread(function(){
      var peers = Array.prototype.slice.call(arguments).filter(function(p) {
        return !!p;
      });
      done(null, peers);
      return peers;
    }).fail(done);
  };

  this.getAllPeers = function(done) {
    done && done(null, peers);
    return peers;
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
      .fail(done);
  };

  this.listAllPeersWithStatusNewUP = function(done) {
    var matching = _.chain(peers).
      filter(function(p){ return ['UP'].indexOf(p.status) !== -1; }).
      value();
    done && done(null, matching);
    return Q(matching);
  };

  this.findPeers = function(pubkey, done) {
    var matching = _.chain(peers).
      where({ pubkey: pubkey }).
      value();
    done && done(null, matching);
    return matching;
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
      .fail(done);
  };

  this.setDownWithStatusOlderThan = function(minSigTimestamp, done) {
    var matching = _.chain(peers).
      filter(function(p){ return !p.statusTS || p.statusTS < minSigTimestamp; }).
      value();
    matching.forEach(function(p){
      p.status = 'DOWN';
    });
    return that.writeJSON(peers, 'peers.json', done);
  };

  this.setPeerDown = function(pubkey, done) {
    var matching = _.chain(peers).
      where({ pubkey: pubkey }).
      value();
    matching.forEach(function(p){
      p.status = 'DOWN';
    });
    return that.writeJSON(peers, 'peers.json', done);
  };

  this.saveBlock = function(block, done) {
    return Q()
      .then(function() {
        that.addHead(block);
        return Q.all([
          that.saveBlockInFile(block, true),
          that.saveTxsInFiles(block.transactions, { block_number: block.number, time: block.medianTime }),
          that.saveMemberships('join', block.joiners),
          that.saveMemberships('active', block.actives),
          that.saveMemberships('leave', block.leavers)
        ]);
      })
      .then(function(){
        global.currentNumber = block.number;
        return that.writeJSON(global, 'global.json');
      })
      .then(function(){
        lastBlockFileNumber = Math.max(lastBlockFileNumber, block.number);
        done && done();
      })
      .fail(function(err){
        done && done(err);
        throw err;
      });
  };

  this.addHead = function(block) {
    headers.push(_.omit(block, 'identities','certifications','joiners','actives','leavers','excluded',
      'transactions','raw','membersChanges'));
    return Q();
  };

  this.saveMemberships = function (type, mss) {
    return Q.all(mss.map(function(msRaw) {
      var ms = Membership.statics.fromInline(msRaw, type == 'leave' ? 'OUT' : 'IN', conf.currency);
      ms.type = type;
      ms.hash = sha1(ms.getRawSigned()).toUpperCase();
      return that.saveMembership(ms);
    }));
  };

  this.saveMembership = function(ms, done) {
    var existing = _.where(memberships, { hash: ms.hash })[0];
    if (!existing) {
      memberships.push(ms);
    } else {
      _.extend(existing, ms);
    }
    return that.writeJSON(memberships, 'memberships.json', done);
  };

  that.saveBlockInFile = function(block, check, done) {
    return that.onceMadeTree(block.number)
      .then(function(){
        return check ? that.hasFileOfBlock(block.number) : false;
      })
      .then(function(exists){
        return exists ? Q() : that.writeFileOfBlock(block);
      })
      .then(function(){
        done && done();
      })
      .fail(function(err){
        done && done(err);
        throw err;
      });
  };

  this.saveTxsInFiles = function (txs, extraProps) {
    return myFS.makeTree(rootPath + '/tx/')
      .then(function(){
        return Q.all(txs.map(function(tx) {
          _.extend(tx, extraProps);
          _.extend(tx, { currency: conf.currency });
          var hash = new Transaction(tx).getHash(true);
          return myFS.write(rootPath + '/tx/' + hash + '.json', JSON.stringify(tx, null, ' '));
        }));
      });
  };

  this.saveHeadsInFile = function (headers, done) {
    return that.writeJSON(headers, 'headers.json', done);
  };

  this.writeJSON = function(obj, fileName, done) {
    return that.donable(myFS.write(rootPath + '/' + fileName, JSON.stringify(obj, null, ' ')), done);
  };

  this.donable = function(promise, done) {
    return promise
      .then(function(){
        done && done();
      })
      .fail(function(err){
        done && done(err);
        throw err;
      });
  };

  function blockFileName(blockNumber) {
    return BLOCK_FILE_PREFIX.substr(0, BLOCK_FILE_PREFIX.length - ("" + blockNumber).length) + blockNumber;
  }

  this.merkleForPeers = function(done) {
    return Q()
      .then(function(){
        var leaves = (_.where(merkles, { tree: 'peers' })[0] || {}).leaves || [];
        var merkle = new Merkle();
        merkle.initialize(leaves);
        done && done(null, merkle);
        return merkle;
      })
      .fail(function(err){
        done && done(err);
        throw err;
      });
  };

  this.updateMerkleForPeers = function(done) {
    return that.findAllPeersNEWUPBut([])
      .then(function(peers){
        var merkle = new Merkle();
        var leaves = [];
        peers.forEach(function (p) {
          leaves.push(p.hash);
        });
        merkle.initialize(leaves);
        return merkle.leaves();
      })
      .then(function(leaves){
        merkles = _.reject(merkles, function(m){ return m.tree == 'peers'; });
        merkles.push({
          tree: 'peers',
          leaves: leaves
        });
      })
      .then(function(){
        done && done();
      })
      .fail(function(err){
        done && done(err);
        throw err;
      });
  };

  this.saveLink = function(link, done) {
    links.push(link);
    return that.writeJSON(links, 'links.json', done);
  };

  this.saveSource = function(src, done) {
    sources.push(src);
    return (src.type == "D" ? that.saveUDInHistory(src.pubkey, src) : Q())
      .then(function(){
        return that.writeJSON(sources, 'sources.json', done);
      });
  };

  this.saveIdentity = function(idty, done) {
    var existing = _.where(identities, {
      pubkey: idty.pubkey,
      hash: idty.hash
    })[0];
    if (!existing) {
      idty.block_number = parseInt(idty.block_number);
      identities.push(idty);
    } else {
      idty.block_number = parseInt(idty.block_number);
      _.extend(existing, idty);
    }
    return saveIdentitiesInFile(identities, done);
  };

  function saveIdentitiesInFile(identities, done) {
    return that.writeJSON(identities.map(function(idty) {
      return _.omit(idty, 'certs');
    }), 'identities.json', function(err, obj) {
      done(err, obj);
    });
  }

  this.saveCertification = function(cert, done) {
    var existing = _.where(certs, {
      from: cert.from,
      to: cert.to,
      target: cert.target,
      sig: cert.sig
    })[0];
    if (!existing) {
      cert.block_number = parseInt(cert.block_number);
      certs.push(cert);
    } else {
      cert.block_number = parseInt(cert.block_number);
      _.extend(existing, cert);
    }
    return that.writeJSON(certs.map(function(cert) {
      return _.omit(cert, 'identity','idty');
    }), 'certs.json', function(err, obj) {
      done(err, obj);
    });
  };

  this.saveTransaction = function(tx, done) {
    txs.push(tx);
    return that.writeJSON(txs, 'txs.json', done);
  };

  this.dropTxRecords = function(pubkey) {
    return myFS.removeTree(rootPath + '/tx/');
  };

  this.dropTxHistory = function(pubkey) {
    return myFS.makeTree(rootPath + '/tx_history/')
      .then(function(){
        return myFS.remove(rootPath + '/tx_history/' + pubkey + '.json');
      })
      .fail(function(){
      });
  };

  this.saveTxInHistory = function(type, pubkey, tx) {
    return myFS.makeTree(rootPath + '/tx_history/')
      .then(function(){
        return myFS.read(rootPath + '/tx_history/' + pubkey + '.json')
          .then(function(data){
            return JSON.parse(data);
          });
      })
      .fail(function(){
        return { sent: [], received: [] };
      })
      .then(function(history){
        tx.currency = conf.currency;
        var hash = new Transaction(tx).getHash();
        history[type].push(hash);
        return myFS.write(rootPath + '/tx_history/' + pubkey + '.json', JSON.stringify(history, null, ' '));
      });
  };

  this.saveUDInHistory = function(pubkey, ud) {
    return myFS.makeTree(rootPath + '/ud_history/')
      .then(function(){
        return myFS.read(rootPath + '/ud_history/' + pubkey + '.json')
          .then(function(data){
            return JSON.parse(data);
          });
      })
      .fail(function(){
        return { history: [] };
      })
      .then(function(obj){
        obj.history.push(new Source(ud).UDjson());
        return myFS.write(rootPath + '/ud_history/' + pubkey + '.json', JSON.stringify(obj, null, ' '));
      });
  };

  this.getTransactionsHistory = function(pubkey, done) {
    return myFS.makeTree(rootPath + '/tx_history/')
      .then(function(){
        return myFS.read(rootPath + '/tx_history/' + pubkey + '.json')
          .then(function(data){
            return JSON.parse(data);
          });
      })
      .fail(function(){
        return { sent: [], received: [] };
      })
      .then(function(history){
        history.sending = [];
        history.receiving = [];
        return Q.all([
          // Sent
          Q.all(history.sent.map(function(hash, index) {
            return that.getTxByHash(hash)
              .then(function(tx){
                history.sent[index] = (tx && JSON.parse(tx)) || null;
              });
          })),
          // Received
          Q.all(history.received.map(function(hash, index) {
            return that.getTxByHash(hash)
              .then(function(tx){
                history.received[index] = (tx && JSON.parse(tx)) || null;
              });
          })),
          // Sending
          Q.all(txs.map(function(tx) {
            if (~tx.issuers.indexOf(pubkey)) {
              history.sending.push(tx || null);
            }
          })),
          // Receiving
          Q.all(txs.map(function(tx, index) {
            if (~tx.issuers.indexOf(pubkey)) {
              return;
            }
            var isRecipient = false;
            for (var i = 0; i < tx.outputs.length; i++) {
              var output = tx.outputs[i];
              if (output.match(new RegExp('^' + pubkey))) {
                isRecipient = true;
                break;
              }
            }
            if (isRecipient) {
              history.receiving.push(tx || null);
            }
          }))
        ]).thenResolve(history);
      })
      .then(function(history){
        done && done(null, history);
        return history;
      })
      .fail(function(err){
        done && done(err);
        throw err;
      });
  };

  this.getUDHistory = function(pubkey, done) {
    return myFS.makeTree(rootPath + '/ud_history/')
      .then(function(){
        return myFS.read(rootPath + '/ud_history/' + pubkey + '.json')
          .then(function(data){
            return JSON.parse(data);
          });
      })
      .fail(function(){
        return { history: [] };
      })
      .then(function(obj){
        obj.history = obj.history.map(function(src) {
          var completeSrc = _.extend({}, src);
          _.extend(completeSrc, _.findWhere(sources, { type: 'D', pubkey: pubkey, number: src.block_number }));
          return completeSrc;
        });
        done && done(null, obj);
        return obj;
      })
      .fail(function(err){
        done && done(err);
        throw err;
      });
  };

  this.getTransactionsPending = function() {
    return txs;
  };

  this.savePeer = function(peer, done) {
    peer.hash = (sha1(peer.getRawSigned()) + "").toUpperCase();
    var existing = _.where(peers, { pubkey: peer.pubkey })[0];
    if (!existing) {
      peers.push(peer);
    } else {
      _.extend(existing, peer);
    }
    return that.writeJSON(peers, 'peers.json', done);
  };

  this.loadConf = function(done) {
    return myFS.read(rootPath + '/conf.json')
      .then(function(data){
        return _(Configuration.statics.defaultConf()).extend(JSON.parse(data));
      })
      .fail(function(){
        return {};
      })
      .then(function(conf){
        done && done(null, conf);
        return conf;
      });
  };

  this.saveConf = function(confToSave, done) {
    _.extend(conf, confToSave);
    return myFS.write(rootPath + '/conf.json', JSON.stringify(conf, null, ' '))
      .then(function(){
        done && done();
      })
      .fail(function(err){
        done && done(err);
        throw err;
      });
  };

  this.loadStats = function (done) {
    return myFS.read(rootPath + '/stats.json')
      .then(function(data) {
        return JSON.parse(data);
      })
      .fail(function(){
        return {};
      })
      .then(function(stats){
        done && done(null, stats);
        return stats;
      });
  };

  this.getStat = function(statName, done) {
    return that.loadStats()
      .then(function(conf){
        // Create stat if it does not exist
        var res = (conf && conf[statName]) || { statName: statName, blocks: [], lastParsedBlock: -1 };
        done && done(null, res);
        return res;
      })
      .fail(function(err){
        done && done(err);
        throw err;
      });
  };

  this.saveStat = function(stat, name, done) {
    return that.loadStats()
      .then(function(stats){
        stats[name] = stat;
        return myFS.write(rootPath + '/stats.json', JSON.stringify(stats, null, ' '));
      })
      .then(function(){
        done && done();
      })
      .fail(function(err){
        done && done(err);
        throw err;
      });
  };

  this.close = function() {
    // TODO
  };

  this.resetAll = function(done) {
    var files = ['peers', 'txs', 'stats', 'sources', 'memberships', 'links', 'identities', 'headers', 'global', 'certs', 'conf'];
    var dirs  = ['tx', 'blocks', 'tx_history', 'ud_history'];
    return resetFiles(files, dirs, done);
  };

  this.resetData = function(done) {
    var files = ['peers', 'txs', 'stats', 'sources', 'memberships', 'links', 'identities', 'headers', 'global', 'certs'];
    var dirs  = ['tx', 'blocks', 'tx_history', 'ud_history'];
    return resetFiles(files, dirs, done);
  };

  this.resetConf = function(done) {
    var files = ['conf'];
    var dirs  = [];
    return resetFiles(files, dirs, done);
  };

  this.resetStats = function(done) {
    var files = ['stats'];
    var dirs  = ['ud_history','tx_history'];
    return resetFiles(files, dirs, done);
  };

  this.resetPeers = function(done) {
    var files = ['peers'];
    var dirs  = [];
    return resetFiles(files, dirs, done);
  };

  this.resetTransactions = function(done) {
    var files = ['txs'];
    var dirs  = [];
    return resetFiles(files, dirs, done);
  };

  function resetFiles(files, dirs, done) {
    return Q.all([

      // Remove files
      Q.all(files.map(function(fName) {
        return myFS.exists(rootPath + '/' + fName + '.json')
          .then(function(exists){
            return exists ? myFS.remove(rootPath + '/' + fName + '.json') : Q();
          })
      })),

      // Remove directories
      Q.all(dirs.map(function(dirName) {
        return myFS.exists(rootPath + '/' + dirName)
          .then(function(exists){
            return exists ? myFS.removeTree(rootPath + '/' + dirName) : Q();
          })
      }))
    ])
      .then(function(){
        done && done();
      })
      .fail(function(err){
        done && done(err);
      });
  }

  // INSTRUMENTALIZE ALL METHODS
  var f;
  for (f in this) {
    if (that.hasOwnProperty(f) && typeof that[f] == 'function') {
      (function() {
        var fname = f + "";
        var func = that[fname];
        // Instrumentalize the function
        that[fname] = function() {
          var args = arguments;
          //var start = new Date();
          return onceLoadedDAL()
            .then(function() {
              return Q()
                .then(function(){
                  return func.apply(that, args);
                })
                // TODO: add a parameter to enable/disable performance logging
                //.then(function (o) {
                //  var duration = (new Date() - start);
                //  if (duration >= constants.DEBUG.LONG_DAL_PROCESS)
                //    logger.debug('Time %s ms | %s', duration, fname);
                //  return o;
                //})
                ;
            });
        };
        that[fname].now = function() {
          var args = arguments;
          //var start = new Date();
          return Q()
            .then(function(){
              return func.apply(that, args);
            })
            // TODO: add a parameter to enable/disable performance logging
            //.then(function (o) {
            //  var duration = (new Date() - start);
            //  //if (duration >= constants.DEBUG.LONG_DAL_PROCESS)
            //  //  logger.debug('Time %s ms | %s', duration, fname);
            //  return o;
            //})
          ;
        };
      })();
    }
  }
}
