var service       = require('../service');
var jpgp          = require('../lib/jpgp');
var async         = require('async');
var mongoose      = require('mongoose');
var _             = require('underscore');
var Amendment     = mongoose.model('Amendment');
var PublicKey     = mongoose.model('PublicKey');
var Merkle        = mongoose.model('Merkle');
var Coin          = mongoose.model('Coin');
var Key           = mongoose.model('Key');
var Transaction   = mongoose.model('Transaction');
var TxMemory      = mongoose.model('TxMemory');
var MerkleService = service.Merkle;

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
      if(err && alreadyProcessed){
        callback(err, tx, alreadyProcessed);
      }
      else if(err){
        callback(err);
      }
      else if(tx.type == 'ISSUANCE'){
        issue(tx, callback);
      }
      else if(tx.type == 'DIVISION'){
        division(tx, callback);
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
        async.forEach(tx.getCoins(), function(coin, callback){
          var amNumber;
          async.waterfall([
            async.apply(Amendment.findPromotedByNumber.bind(Amendment), coin.originNumber),
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
      function (next) {
        // Check coins minimum power
        Amendment.findClosestPreviousWithMinimalCoinPower(tx.sigDate, next);
      },
      function (am, next) {
        var err = null;
        if (am) {
          tx.getCoins().forEach(function (coin) {
            if (!err && coin.power < am.coinMinPower) {
              err = 'Coins must now have a minimum power of ' + am.coinMinPower + ', as written in amendment #' + am.number;
            }
          });
        }
        next(err);
      },
      function (next){
        // Get last issuance
        Transaction.findLastIssuance(tx.sender, function (err, lastTX) {
          // Verify coins chaining
          var lastNum = -1;
          if(lastTX){
            lastNum = lastTX.getLastIssuedCoin();
            lastNum = lastNum && lastNum.number;
            if (lastNum == null) {
              lastNum = -1;
            }
          }
          var newCoins = tx.getCoins();
          if(newCoins[0].number != lastNum + 1){
            next('Bad transaction: coins number must follow last issuance transaction');
            return;
          }
          var err = null;
          newCoins.forEach(function (coin) {
            if (!err && coin.base == 0) {
              err = 'Coin base must be a value between 1 and 9';
            }
            if(!err && coin.number != ++lastNum){
              err = 'Bad transaction: coins do not have a good sequential numerotation';
            }
          });
          next(err);
        });
      },
      function (next){
        // Check coins sum, for each targeted AM, do not come over UD of each AM
        var coinsByAM = {};
        tx.getCoins().forEach(function(c){
          coinsByAM[c.originNumber] = coinsByAM[c.originNumber] || [];
          coinsByAM[c.originNumber].push(c);
        });
        async.forEach(_(coinsByAM).keys(), function(amNumber, callback){
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
      function (txSaved, code, next){
        // Saves transaction's coins IDs
        async.forEach(tx.coins, function(coin, callback){
          var c = new Coin({
            id: coin.match(/([A-Z\d]{40}-\d+-\d-\d+-\w-\d+)?/)[1],
            transaction: tx.sender + '-' + tx.number,
            owner: tx.sender
          });
          c.save(callback);
        }, next);
      }
    ], function (err, result) {
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
                // Verify each coin is owned
                async.forEach(tx.getCoins(), function(coin, callback){
                  Coin.findByCoinID(coin.issuer+'-'+coin.number, function (err, ownership) {
                    if(err || ownership.owner != tx.sender){
                      callback(err || 'You are not the owner of coin ' + coin.issuer + '-' + coin.number + ' (' + (coin.base * Math.pow(10, coin.power)) + '). Cannot send it.');
                      return;
                    }
                    callback();
                  })
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
        // Save new ownership
        async.forEach(tx.getCoins(), function(coin, callback){
          Coin.findByCoinID(coin.issuer+'-'+coin.number, function (err, ownership) {
            if(err){
              // Creation
              var ownership = new Coin({
                id: coin.id,
                owner: tx.recipient,
                transaction: tx.sender + '-' + tx.number
              });
              ownership.save(callback);
            } else {
              // Modification
              ownership.owner = tx.recipient;
              ownership.transaction = tx.sender + '-' + tx.number;
              ownership.save(callback);
            }
          });
        }, next);
      },
      function (next){
        Merkle.updateForTransfert(tx, next);
      }
    ], function (err, result) {
      callback(err, tx);
    });
  }

  function division(tx, callback) {
    var divisionCoins = [];
    async.waterfall([
      function (next){
        Key.isManaged(tx.sender, next);
      },
      function (verified, next){
        if(!verified){
          next('Issuer\'s key not managed by this node');
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
        // Get last issuance
        Transaction.findLastIssuance(tx.sender, function (err, lastTX) {
          // Verify coins chaining
          var lastNum = -1;
          if(lastTX){
            lastNum = lastTX.getLastIssuedCoin();
            lastNum = lastNum && lastNum.number;
            if (lastNum == null) {
              lastNum = -1;
            }
          }
          var coins = tx.getCoins();
          if(coins[0].number != lastNum + 1){
            next('Bad transaction: coins number must follow last issuance transaction' + coins[0].number + ' ' + lastNum);
            return;
          }
          var err = null;
          var isDivisionCoin = true;
          coins.forEach(function (coin) {
            isDivisionCoin = isDivisionCoin && !coin.transaction;
            if (isDivisionCoin) {
              divisionCoins.push(coin);
            }
            if (!err && coin.base == 0) {
              err = 'Coins base must be a value between 1 and 9';
            }
            if(!err && isDivisionCoin && coin.number != ++lastNum){
              err = 'Bad transaction: coins do not have a good sequential numerotation';
            }
          });
          if(err){
            next(err);
            return;
          }
          next();
        });
      },
      function (next){
        // Verify change coin sum
        var divisionSum = 0;
        var materialSum = 0;
        var isDivisionCoin = true;
        tx.getCoins().forEach(function (coin, index) {
          isDivisionCoin = isDivisionCoin && !coin.transaction;
          if (!isDivisionCoin && !coin.transaction) {
            next('Bad coin sequence: first part must contains only division coins, second part must contain only material coins');
            return;
          }
          if(isDivisionCoin)
            divisionSum += coin.base * Math.pow(10, coin.power);
          else
            materialSum += coin.base * Math.pow(10, coin.power);
        });
        if(materialSum != divisionSum){
          next('Bad division sum: division sum (' + divisionSum + ') != material sum (' + materialSum + ')');
          return;
        }
        next();
      },
      function (next) {
        // Check coins minimum power
        Amendment.findClosestPreviousWithMinimalCoinPower(tx.sigDate, next);
      },
      function (am, next) {
        var err = null;
        if (am) {
          divisionCoins.forEach(function (coin) {
            if (!err && coin.power < am.coinMinPower) {
              err = 'Coins must now have a minimum power of ' + am.coinMinPower + ', as written in amendment #' + am.number;
            }
          });
        }
        next(err);
      },
      function (next){
        // Verify each coin is owned
        var coins = tx.getCoins();
        coins = _(coins).last(coins.length - divisionCoins.length);
        async.forEach(coins, function(coin, callback){
          Coin.findByCoinID(coin.issuer+'-'+coin.number, function (err, ownership) {
            if(err || ownership.owner != tx.sender){
              callback(err || 'You are not the owner of coin ' + coin.issuer + '-' + coin.number + ' (' + (coin.base * Math.pow(10, coin.power)) + '). Cannot send it.');
              return;
            }
            callback();
          })
        }, next);
      },
      function (next){
        tx.save(next);
      },
      function (txSaved, code, next){
        Merkle.updateForDivision(tx, next);
      },
      function (merkle, code, next){
        // Remove ownership of division coins
        var coins = tx.getCoins();
        var materialCoins = _(coins).last(coins.length - divisionCoins.length);
        async.forEach(materialCoins, function(coin, callback){
          Coin.findByCoinID(coin.issuer+'-'+coin.number, function (err, ownership) {
            ownership.owner = '';
            ownership.transaction = tx.sender + '-' + tx.number;
            ownership.save(callback);
          });
        }, next);
      },
      function (next) {
        async.forEach(divisionCoins, function(coin, callback){
          var c = new Coin({
            id: coin.id,
            transaction: tx.sender + '-' + tx.number,
            owner: tx.sender
          });
          c.save(function (err) {
            callback(err);
          });
        }, next);
      }
    ], function (err, result) {
      callback(err, tx);
    });
  }

  return this;
}
