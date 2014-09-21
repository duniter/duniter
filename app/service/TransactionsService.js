var async         = require('async');
var _             = require('underscore');
var logger        = require('../lib/logger')();

module.exports.get = function (conn, MerkleService, PeeringService) {
  return new TransactionService(conn, MerkleService, PeeringService);
};

function TransactionService (conn, MerkleService, PeeringService) {

  var Merkle        = conn.model('Merkle');
  var Transaction   = conn.model('Transaction');
  var TxMemory      = conn.model('TxMemory');

  this.processTx = function (txObj, doFilter, callback) {
    if (arguments.length == 2) {
      callback = doFilter;
      doFilter = true;
    }
    var tx = new Transaction(txObj);
    async.waterfall([
      function (next) {
        if (tx.pubkey.fingerprint != tx.sender) {
          next('Sender does not match signatory');
          return;
        }
        if (doFilter) {
          TxMemory.getTheOne(tx.sender, tx.number, tx.hash, function (err, found) {
            if(err) {
              // Sibling was not found: transaction was not processed
              var txMem = new TxMemory({
                "sender": tx.sender,
                "number": tx.number,
                "hash": tx.hash
              });
              txMem.save(function (err){
                next(err);
              });
            } else {
              tx = found;
              next('Transaction already processed', true);
            }
          });
        } else {
          next();
        }
      },
    ], function (err, alreadyProcessed) {
      if(alreadyProcessed){
        callback(err, tx, alreadyProcessed);
      }
      else if(err){
        callback(err);
      }
      else{
        transfert(tx, callback);
      }
    });
  }

  function transfert(tx, callback) {
    // TODO
  }
};
