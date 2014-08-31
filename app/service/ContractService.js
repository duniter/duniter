var async  = require('async');
var _      = require('underscore');
var log4js = require('log4js');
var logger = require('../lib/logger')('service');
var coiner = require('../lib/algos/coins/coiner');

module.exports.get = function (conn, conf) {
  return new ContractService(conn, conf);
};

function ContractService (conn, conf) {

  var Amendment = conn.model('Amendment');
  var KeyBlock  = conn.model('KeyBlock');

  // Reference to currently promoted amendment
  var currentAm;
  var proposed;
  var rootTs;

  this.currentAm = function (newValue) {
    if (newValue) {
      currentAm = newValue;
    }
    return currentAm;
  };

  this.proposed = function (newValue) {
    if (newValue) {
      proposed = newValue;
    }
    return proposed;
  };

  this.createAmendmentForBlock = function (currentBlock, done) {
    var previousBlock, currentModulo;
    if (!rootTs) {
      rootTs = currentBlock.timestamp;
      // No amendment for root block
      done();
      return;
    }
    if (currentBlock.timestamp - rootTs < conf.dt) {
      // No amendment to generate: elapsed time is lower than dt
      done();
      return;
    }
    async.waterfall([
      function (next){
        KeyBlock.findByNumber(currentBlock.number - 1, next);
      },
      function (previous, next){
        previousBlock = previous;
        currentModulo = (currentBlock.timestamp - rootTs) % conf.dt;
        Amendment.findByTimestamp(currentBlock.timestamp - currentModulo, next);
      },
      function (am, next){
        if (!am) {
          var newAm = new Amendment();
          newAm.version = 1;
          newAm.currency = conf.currency;
          newAm.membersRoot = previousBlock.membersRoot;
          newAm.membersCount = previousBlock.membersCount;
          newAm.membersChanges = previousBlock.membersChanges;
          // Create new Amendment since last was not created
          if (!currentAm) {
            newAm.number = 0;
            newAm.generated = rootTs;
          } else {
            newAm.generated = currentBlock.timestamp - currentModulo;
            newAm.number = currentAm.number + 1;
            newAm.previousHash = currentAm.hash;
          }
          // Compute new dividend
          var previousUD = currentAm ? currentAm.dividend : conf.ud0;
          var previousMM = currentAm ? currentAm.monetaryMass : 0;
          newAm.dividend = Math.max(previousUD, Math.ceil(conf.c*previousMM/previousBlock.membersCount));
          newAm.monetaryMass = previousMM + newAm.dividend*newAm.membersCount;
          var coinage = coiner.Base2Draft(newAm.dividend, 0);
          newAm.coinBase = coinage.coinBase;
          newAm.coinList = coinage.coinList;
          newAm.save(function (err) {
            if (!err) currentAm = newAm;
            next(err);
          });
          // TODO: maybe do it recursively?
        }
        else next();
      },
    ], done);
  };

  this.load = function (done) {
    async.waterfall([
      function (next){
        Amendment.current(function (err, am) {
          currentAm = am;
          next();
        });
      },
      function (next){
        KeyBlock.findByNumber(0, function (err, block) {
          if (block)
            rootTs = block.timestamp;
          next();
        });
      },
    ], done);
  };
}
