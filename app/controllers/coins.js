var jpgp        = require('../lib/jpgp');
var async       = require('async');
var mongoose    = require('mongoose');
var _           = require('underscore');
var Coin        = mongoose.model('Coin');
var Transaction = mongoose.model('Transaction');
var service     = require('../service');
var logger      = require('../lib/logger')();

// Services
var ParametersService = service.Parameters;

module.exports = function (pgp, currency, conf) {

  this.list = function (req, res) {

    if(!req.params.fpr){
      res.send(400, "Fingerprint is required");
      return;
    }
    var matches = req.params.fpr.match(/(\w{40})/);
    if(!matches){
      res.send(400, "Fingerprint format is incorrect, must be an upper-cased SHA1 hash");
      return;
    }

    async.waterfall([
      function (next){
        Coin.findByOwner(matches[1], next);
      },
      function (coins, next){
        var json = { coins: [] };
        coins.forEach(function(c){
          json.coins.push(c.getId());
        });
        next(null, json);
      }
    ], function (err, result) {
      res.setHeader("Content-Type", "text/plain");
      if(err){
        res.send(500, err);
        return;
      }
      res.send(200, JSON.stringify(result, null, "  "));
    });
  };

  this.view = function (req, res) {

    async.waterfall([
      function (next) {
        ParametersService.getCoinID(req, next);
      },
      Coin.findByCoinID
    ], function (err, coin) {
      if(err){
        res.send(500, err);
        return;
      }
      res.send(200, JSON.stringify({
        coinid: coin.getId(),
        owner: coin.owner,
        transaction: coin.transaction
      }, null, "  "));
    });
  };

  this.history = function (req, res) {

    res.send(501, "To be developped soon.");
  };
  
  return this;
}

function getTransactionStack (coinString, stack, done) {
  logger.debug(coinString);
  var matches = coinString.match(/([A-Z\d]{40}-\d+-\d-\d+-(A|C)-\d+)(, ([A-Z\d]{40})-(\d+))?/);
  if(!matches){
    done('Wrong coin string: ' + coinString);
    return;
  }
  var coinID = matches[1];
  var txSender = matches[4];
  var txNum = matches[5];
  Transaction.getBySenderAndNumber(txSender, txNum, function (err, tx) {
    if(err){
      logger.error(txSender, txNum);
      done(err, stack);
      return;
    }
    stack.push(tx);
    var c = _(tx.coins).find(function (coin) {
      return ~coin.indexOf(coinID);
    });
    if(!c){
      done('Coin chain is broken: not found in transaction ' + txID);
      return;
    }
    matches = c.match(/, [A-Z\d]{40}-\d+?/);
    if(matches){
      getTransactionStack(c, stack, done);
      return;
    }
    done(null, stack);
  });
}
