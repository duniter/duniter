var jpgp        = require('../lib/jpgp');
var async       = require('async');
var mongoose    = require('mongoose');
var _           = require('underscore');
var Amendment   = mongoose.model('Amendment');
var PublicKey   = mongoose.model('PublicKey');
var Merkle      = mongoose.model('Merkle');
var Coin        = mongoose.model('Coin');
var Key         = mongoose.model('Key');
var Transaction = mongoose.model('Transaction');
var service     = require('../service');

// Services
var MerkleService      = service.Merkle;
var ParametersService  = service.Parameters;
var TransactionService = service.Transactions;
var PeeringService     = service.Peering;

module.exports = function (pgp, currency, conf) {

  this.viewtx = function (req, res) {
    async.waterfall([
      function (next){
        ParametersService.getTransactionID(req, next);
      },
      function (txSender, txNumber, next){
        Transaction.find({ sender: txSender, number: txNumber }, next);
      }
    ], function (err, result) {
      if(err || result.length == 0){
        res.send(404, err);
        return;
      }
      res.send(200, JSON.stringify({
        raw: result[0].getRaw(),
        signature: result[0].signature,
        transaction: result[0].json()
      }, null, "  "));
    });
  };

  this.lastNAll = function (req, res) {
      async.waterfall([
        function (next){
          ParametersService.getCount(req, next);
        },
        function (count, next){
          Transaction.find().sort({sigDate: -1}).limit(count).exec(next);
        }
      ], function (err, results) {
        if(err){
          res.send(404, err);
          return;
        }
        var json = { transactions: [] };
        results.forEach(function (tx) {
          json.transactions.push(tx.json());
        });
        res.send(200, JSON.stringify(json, null, "  "));
      });
  };

  this.recipient = function (req, res) {
    async.waterfall([
      function (next){
        ParametersService.getFingerprint(req, next);
      },
      function (fingerprint, next){
        Merkle.txToRecipient(fingerprint, next);
      },
      function (merkle, next){
        MerkleService.processForURL(req, merkle, lambda, next);
      }
    ], function (err, json) {
      if(err){
        res.send(404, err);
        return;
      }
      MerkleService.merkleDone(req, res, json);
    });
  };

  this.sender = {

    get: function (req, res) {
      showMerkle(Merkle.txOfSender, null, null, req, res);
    },

    lastNofSender: function (req, res) {
      var count = 1;
      async.waterfall([
        function (next){
          ParametersService.getCount(req, next);
        },
        function (countBack, next){
          count = countBack;
          ParametersService.getFingerprint(req, next);
        },
        function (fingerprint, next){
          Transaction.find({ sender: fingerprint }).sort({number: -1}).limit(count).exec(next);
        }
      ], function (err, results) {
        if(err){
          res.send(404, err);
          return;
        }
        var json = { transactions: [] };
        results.forEach(function (tx) {
          json.transactions.push(tx.json());
        });
        res.send(200, JSON.stringify(json, null, "  "));
      });
    }
  };

  this.processTx = function (req, res) {
    var am = null;
    var pubkey = null;
    async.waterfall([
      function (next){
        ParametersService.getTransaction(req, next);
      },
      function (tx, next) {
        TransactionService.processTx(tx, next);
      }
    ], function (err, tx, alreadyProcessed) {
      if(err){
        res.send(400, err);
      }
      else{
        res.send(200, JSON.stringify({
          signature: tx.signature,
          transaction: tx.json(),
          raw: tx.getRaw()
        }, null, "  "));
      }
      if(!alreadyProcessed){
        process.nextTick(function () {
          PeeringService.propagateTransaction(req, function (err) {
            if(err) console.error('Error during transaction\'s propagation: %s', err);
          });
        });
      }
    });
  };
  
  return this;
}

function showMerkle (merkleGetFunc, merkleHashFunc, amNumber, req, res) {
  async.waterfall([
    function (next){
      ParametersService.getFingerprint(req, next);
    },
    function (fingerprint, next){
      if(amNumber)
        merkleGetFunc.call(merkleGetFunc, fingerprint, amNumber, next);
      else
        merkleGetFunc.call(merkleGetFunc, fingerprint, next);
    },
    function (merkle, next){
      MerkleService.processForURL(req, merkle, merkleHashFunc || lambda, next);
    }
  ], function (err, json) {
    if(err){
      res.send(404, err);
      return;
    }
    MerkleService.merkleDone(req, res, json);
  });
}

function lambda(hashes, done) {
  async.waterfall([
    function (next){
      Transaction.find({ hash: { $in: hashes } }, next);
    },
    function (txs, next){
      var map = {};
      txs.forEach(function (tx){
        map[tx.hash] = {
          signature: tx.signature,
          transaction: tx.json(),
          raw: tx.getRaw()
        };
      });
      next(null, map);
    }
  ], done);
}
