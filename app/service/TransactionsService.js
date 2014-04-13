var service       = require('../service');
var jpgp          = require('../lib/jpgp');
var async         = require('async');
var mongoose      = require('mongoose');
var _             = require('underscore');
var Amendment     = mongoose.model('Amendment');
var PublicKey     = mongoose.model('PublicKey');
var Merkle        = mongoose.model('Merkle');
var Key           = mongoose.model('Key');
var Transaction   = mongoose.model('Transaction');
var TxMemory      = mongoose.model('TxMemory');
var MerkleService = service.Merkle;
var logger        = require('../lib/logger')();

module.exports.get = function (pgp, currency, conf) {

  this.processTx = function (tx, doFilter, callback) {
    if (arguments.length == 2) {
      callback = doFilter;
      doFilter = true;
    }
    async.waterfall([
      function (next) {
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
      }
    ], function (err, alreadyProcessed) {
      if (!err && !alreadyProcessed) {
        err = tx.check();
      }
      if(err && alreadyProcessed){
        callback(err, tx, alreadyProcessed);
      }
      else if(err){
        callback(err);
      }
      else if(tx.type == 'ISSUANCE'){
        issue(tx, callback);
      }
      else if(tx.type == 'TRANSFER'){
        transfert(tx, callback);
      }
      else{
        callback('Bad transaction type');
      }
    });
  }

  function issue(tx, callback) {
    async.waterfall([
      function (next){
        Key.isManaged(tx.sender, next);
      },
      function (verified, next){
        if(!verified){
          next('Issuer\'s key not managed by this node');
          return;
        }
        async.forEach(tx.getAmounts(), function(amount, callback){
          var amNumber;
          async.waterfall([
            async.apply(Amendment.findPromotedByNumber.bind(Amendment), amount.number),
            function (amendment, next) {
              next(null, amNumber = amendment.number);
            },
            async.apply(Amendment.isMember.bind(Amendment), tx.sender)
          ], function (err, wasMember) {
            callback(err || (!wasMember && "Not a member for AM#" + amNumber));
          });
        }, next);
      },
      function (next){
        // Get last transaction
        Transaction.findLastOf(tx.sender, function (err, lastTX) {
          if(lastTX){
            // Verify tx chaining
            if(lastTX.number != tx.number - 1){
              next('Transaction doest not follow your last one');
              return;
            }
            if(lastTX.hash != tx.previousHash) {
              next('Transaction have wrong previousHash (given ' + tx.previousHash + ', expected ' + lastTX.hash + ')');
              return;
            }
          }
          else{
            if(tx.number != 0){
              next('Transaction must have number #0 as it is your first');
              return;
            }
            if(tx.previousHash){
              next('Transaction must not have a previousHash as it is your first');
              return;
            }
          }
          next();
        });
      },
      function (next){
        // Check amounts sum, for each targeted AM, do not come over UD of each AM
        var amountsByAM = {};
        var err = null;
        tx.getAmounts().forEach(function(c){
          if (c.value == 0) {
            err = 'Cannot issue 0 value';
            return;
          }
          amountsByAM[c.number] = amountsByAM[c.number] || [];
          amountsByAM[c.number].push(c);
        });
        if (err) {
          next(err);
          return;
        }
        async.forEach(_(amountsByAM).keys(), function(amNumber, callback){
          var am;
          async.waterfall([
            function (next) {
              Amendment.findPromotedByNumber(amNumber, next);
            },
            function (amendment, next){
              am = amendment;
              next(!am.dividend ? "No Universal Dividend for AM#" + amNumber : null);
            },
            function (next){
              Transaction.findAllIssuanceOfSenderForAmendment(tx.sender, amNumber, next);
            },
            function (txs, next){
              // Verify total is <= UD
              var sum = 0;
              txs.forEach(function (txOfAM) {
                sum += txOfAM.getIssuanceSum(amNumber);
              });
              if(sum > am.dividend){
                // This should NEVER happen
                next('Integrity error: you already issued more coins than you could');
                return;
              }
              if(sum == am.dividend){
                next('You cannot create coins for this amendment (#' + amNumber + ') anymore');
                return;
              }
              if(am.dividend - sum - tx.getIssuanceSum(amNumber) < 0){
                next('You cannot create that much coins (remaining to create ' + (am.dividend - sum) + ', wish to create ' + tx.getIssuanceSum(amNumber) + ')');
                return;
              }
              next();
            },
          ], callback);
        }, next);
      },
      function (next){
        tx.save(next);
      },
    ], function (err, tx) {
      callback(err, tx);
    });
  }

  function transfert(tx, callback) {
    var senderManaged = false;
    var recipientManaged = false;
    async.waterfall([
      function (next) {
        async.parallel({
          sender: function(senderDone){
            async.waterfall([
              function (next){
                Key.isManaged(tx.sender, next);
              },
              function (isManaged, next){
                senderManaged = isManaged;
                if(!isManaged){
                  next('Sender\'s key ' + tx.sender + ' not managed by this node');
                  return;
                }
                // Get last transaction
                Transaction.findLastOf(tx.sender, function (err, lastTX) {
                  if(lastTX){
                    // Verify tx chaining
                    if(lastTX.number != tx.number - 1){
                      next('Transaction doest not follow your last one');
                      return;
                    }
                    if(lastTX.hash != tx.previousHash) {
                      next('Transaction have wrong previousHash (given ' + tx.previousHash + ', expected ' + lastTX.hash + ')');
                      return;
                    }
                  }
                  else{
                    if(tx.number != 0){
                      next('Transaction must have number #0 as it is your first');
                      return;
                    }
                    if(tx.previousHash){
                      next('Transaction must not have a previousHash as it is your first');
                      return;
                    }
                  }
                  next();
                });
              },
              function (next){
                // Verify amounts can be spent
                async.forEach(tx.getAmounts(), function(amount, callback){
                  var subTx = null;
                  var subTxSpent = 0;
                  async.waterfall([
                    function (next){
                      Transaction.getBySenderAndNumber(amount.origin, amount.number, next);
                    },
                    function (tx, next){
                      subTx = tx;
                      Transaction.findAllWithSource(tx.issuer, tx.number, next);
                    },
                    function (txs, next){
                      txs.forEach(function(tx){
                        subTxSpent += tx.getValue();
                      });
                      var subTxAvail = subTx.getValue();
                      if (subTxSpent > subTxAvail) {
                        var err = 'Transaction ' + amount.origin + '#' + amount.number + ' was more spent than what it could. Operation aborted.';
                        logger.error(err);
                        next(err);
                        return;
                      } else if (subTxSpent == subTxAvail) {
                        next('Transaction ' + amount.origin + '#' + amount.number + ' was completely consumed. Amount not available.');
                        return;
                      } else if (subTxSpent + amount.value > subTxAvail) {
                        next('Transaction ' + amount.origin + '#' + amount.number + ' has only ' + (subTxAvail - subTxSpent) + ' available. Change your amount.');
                        return;
                      }
                      next();
                    },
                  ], callback);
                }, next);
              }
            ], function (err) {
              // Do not send err as async.parallel() error, but as a result.
              // So async wait for recipient() to end too.
              senderDone(null, err);
            });
          },
          recipient: function(recipientDone){
            async.waterfall([
              function (next){
                Key.isManaged(tx.recipient, next);
              },
              function (isManaged, next){
                recipientManaged = isManaged;
                if(isManaged){
                  // Recipient managed: transaction will be saved
                  // without local full transaction chain test
                  next();
                }
                else{
                  next('Recipient\'s key ' + tx.recipient + ' is not managed by this node');
                }
              }
            ], function (err) {
              // Do not send err as async.parallel() error, but as a result.
              // So async wait for sender() to end too.
              recipientDone(null, err);
            });
          },
        },
        function(err, results) {
          var senderError = results.sender;
          var recipientError = results.recipient;
          if(senderError && senderManaged){
            next(senderError);
            return;
          }
          if(recipientError && recipientManaged){
            next(recipientError);
            return;
          }
          if(!senderManaged && !recipientManaged){
            next('Neither sender nor recipient managed by this node');
            return;
          }
          next();
        });
      },
      function (next){
        tx.save(next);
      },
      function (txSaved, code, next){
        Merkle.updateForTransfert(txSaved, next);
      }
    ], function (err, result) {
      callback(err, tx);
    });
  }

  return this;
}
