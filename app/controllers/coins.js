var jpgp        = require('../lib/jpgp');
var async       = require('async');
var mongoose    = require('mongoose');
var _           = require('underscore');
var Coin        = mongoose.model('Coin');
var Transaction = mongoose.model('Transaction');

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
        var json = {
          owner: matches[1],
          coins: []
        };
        var map = {};
        coins.forEach(function (coin) {
          var matches = coin.id.match(/^([A-Z\d]{40})-(\d+-\d-\d+-(A|F)-\d+)$/);
          var issuer = matches[1];
          map[issuer] = map[issuer] || [];
          map[issuer].push(matches[2]);
        });
        _(map).each(function (coinsStrings, issuer) {
          json.coins.push({ issuer: issuer, ids: coinsStrings });
        })
        next(null, json);
      }
    ], function (err, result) {
      if(err){
        res.send(500, err);
        return;
      }
      res.send(200, JSON.stringify(result, null, "  "));
    });
  };

  this.view = function (req, res) {

    if(!req.params.fpr){
      res.send(400, "Fingerprint is required");
      return;
    }
    var matches = req.params.fpr.match(/(\w{40})/);
    if(!matches){
      res.send(400, "Fingerprint format is incorrect, must be an upper-cased SHA1 hash");
      return;
    }

    var fingerprint = matches[1];

    if(!req.params.coin_id){
      res.send(400, "Coin ID is required");
      return;
    }
    var matches = req.params.coin_id.match(/^\d+-\d-\d+-(A|F)-\d+$/);
    if(!matches){
      res.send(400, "Coind ID format is incorrect");
      return;
    }

    var coindID = matches[0];

    async.waterfall([
      function (next){
        console.log(fingerprint+'-'+coindID);
        Coin.findByCoinID(fingerprint+'-'+coindID, next);
      },
      function (coin, next){
        getTransactionStack(coin.id + ', ' + coin.transaction, [], next);
      }
    ], function (err, txStack) {
      if(err){
        res.send(500, err);
        return;
      }
      var json = { "transactions": [] };
      txStack.forEach(function (tx) {
        json.transactions.push(tx.json());
      });
      res.send(200, JSON.stringify(json, null, "  "));
    });
  };
  
  return this;
}

function getTransactionStack (coinString, stack, done) {
  console.log(coinString);
  var matches = coinString.match(/([A-Z\d]{40}-\d+-\d-\d+-(A|F)-\d+)(, ([A-Z\d]{40})-(\d+))?/);
  if(!matches){
    done('Wrong coin string: ' + coinString);
    return;
  }
  var coinID = matches[1];
  var txSender = matches[4];
  var txNum = matches[5];
  Transaction.getBySenderAndNumber(txSender, txNum, function (err, tx) {
    if(err){
      console.error(txSender, txNum);
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
