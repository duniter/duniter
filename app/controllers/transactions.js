var jpgp        = require('../lib/jpgp');
var async       = require('async');
var _           = require('underscore');
var logger      = require('../lib/logger')('transaction');

module.exports = function (hdcServer) {
  return new TransactionBinding(hdcServer);
};

function TransactionBinding(hdcServer) {

  // Services
  var MerkleService      = hdcServer.MerkleService;
  var ParametersService  = hdcServer.ParametersService;
  var TransactionService = hdcServer.TransactionsService;
  var PeeringService     = hdcServer.PeeringService;

  // Models
  var Amendment   = hdcServer.conn.model('Amendment');
  var PublicKey   = hdcServer.conn.model('PublicKey');
  var Merkle      = hdcServer.conn.model('Merkle');
  var Key         = hdcServer.conn.model('Key');
  var Transaction = hdcServer.conn.model('Transaction');

  this.viewtx = function (req, res) {
    async.waterfall([
      function (next){
        ParametersService.getTransactionID(req, next);
      },
      function (txSender, txNumber, next){
        Transaction.find({ sender: txSender, number: txNumber }, next);
      }
    ], function (err, result) {
      res.setHeader("Content-Type", "text/plain");
      if(err || result.length == 0){
        res.send(404, err);
        return;
      }
      res.send(200, JSON.stringify({
        raw: result[0].getRaw(),
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
        res.setHeader("Content-Type", "text/plain");
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

  this.refering = function (req, res) {
    async.waterfall([
      function (next){
        ParametersService.getTransactionID(req, next);
      },
      function (txSender, txNumber, next){
        Transaction.findAllWithSource(txSender, txNumber, next);
      },
    ], function (err, results) {
      res.setHeader("Content-Type", "text/plain");
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
        res.setHeader("Content-Type", "text/plain");
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
        if (err)
          logger.debug(err);
      }
      else{
        res.send(200, JSON.stringify({
          transaction: tx.json(),
          raw: tx.getRaw()
        }, null, "  "));
      }
      if(!alreadyProcessed){
        process.nextTick(function () {
          PeeringService.propagateTransaction(req, function (err) {
            if(err) logger.error('Error during transaction\'s propagation: %s', err);
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
          transaction: tx.json(),
          raw: tx.getRaw()
        };
      });
      next(null, map);
    }
  ], done);
}
