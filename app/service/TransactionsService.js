var jpgp        = require('../lib/jpgp');
var async       = require('async');
var mongoose    = require('mongoose');
var _           = require('underscore');
var Membership  = mongoose.model('Membership');
var Amendment   = mongoose.model('Amendment');
var PublicKey   = mongoose.model('PublicKey');
var Merkle      = mongoose.model('Merkle');
var Coin        = mongoose.model('Coin');
var Key         = mongoose.model('Key');
var Transaction = mongoose.model('Transaction');
var MerkleService = require('../service/MerkleService');

module.exports.get = function (currency) {

  this.process = function (pubkey, signedTX, callback) {
    var tx = new Transaction({});
    async.waterfall([
      function (next){
        tx.parse(signedTX, next);
      },
      function (tx, next){
        tx.verify(currency, next);
      },
      function (verified, next){
        if(!verified){
          next('Bad document structure');
          return;
        }
        Transaction.getBySenderAndNumber(tx.sender, tx.number, function (err) {
          if(err)
            next();
          else
            next('Transaction already processed');
        });
      },
      function (next){
        tx.verifySignature(pubkey.raw, next);
      }
    ], function (err, verified) {
      if(err){
        callback(err);
      }
      else if(!verified){
        callback('Transaction\'s signature does not match');
      }
      else if(tx.type == 'ISSUANCE'){
        issue(tx, callback);
      }
      else if(tx.type == 'FUSION'){
        fusion(tx, callback);
      }
      else if(tx.type == 'TRANSFERT'){
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
        // Get targeted AM
        Amendment.findPromotedByNumber(tx.getCoins()[0].originNumber, next);
      },
      function (amendment, next){
        am = amendment;
        Merkle.membersWrittenForAmendment(am.number, am.hash, next);
      },
      function (merkle, next){
        // Verify he was a member of the AM
        if(merkle.leaves().indexOf(tx.sender) == -1){
          next('Sender was not part of the Community for this amendment');
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
            var lastCoins = lastTX.getCoins();
            // For issuance transaction, last num <=> LAST coin
            // For fusion transaction, last num <=> FIRST coin
            lastNum =  lastTX.type == 'ISSUANCE' ? lastCoins[lastCoins.length - 1].number : lastCoins[0].number;
          }
          var newCoins = tx.getCoins();
          if(newCoins[0].number != lastNum + 1){
            next('Bad transaction: coins number must follow last issuance transaction');
            return;
          }
          var err = null;
          newCoins.forEach(function (coin) {
            if(!err && coin.number != ++lastNum){
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
        // Get all for amendment AM
        Transaction.findAllIssuanceOfSenderForAmendment(tx.sender, am.number, next);
      },
      function (lastTXs, next){
        // Verify total is <= UD
        var sum = 0;
        lastTXs.forEach(function (txOfAM) {
          sum += txOfAM.getIssuanceSum();
        });
        if(sum > am.dividend){
          next('Integrity error: you already issued more coins than you could');
          return;
        }
        if(sum == am.dividend){
          next('You cannot create coins for this amendment anymore');
          return;
        }
        if(am.dividend - sum - tx.getIssuanceSum() < 0){
          next('You cannot create that much coins (remaining to create ' + (am.dividend - sum) + ', wish to create ' + tx.getIssuanceSum() + ')');
          return;
        }
        next();
      },
      function (next){
        tx.save(next);
      },
      function (txSaved, code, next){
        Key.setSeenTX(tx, true, next);
      },
      function (next){
        Merkle.updateForIssuance(tx, am, next);
      },
      function (merkle, code, next){
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
                  // Recipient managed
                  // THT verifications
                  next();
                }
                else{
                  next('Recipient\'s key ' + tx.recipient + ' is not managed by this node');
                }
              }
            ], function (err) {
              recipientDone(null, err);
            });
          },
        },
        function(err, results) {
          if(results.sender && senderManaged){
            next(results.sender);
            return;
          }
          if(results.recipient && recipientManaged){
            next(results.recipient);
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
            ownership.owner = tx.recipient;
            ownership.transaction = tx.sender + '-' + tx.number;
            ownership.save(callback);
          });
        }, next);
      },
      function (next){
        Key.setSeenTX(tx, true, next);
      },
      function (next){
        Merkle.updateForTransfert(tx, next);
      }
    ], function (err, result) {
      callback(err, tx);
    });
  }

  function fusion(tx, callback) {
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
            var lastCoins = lastTX.getCoins();
            lastNum = lastTX.type == 'ISSUANCE' ? lastCoins[lastCoins.length - 1].number : lastCoins[0].number;
          }
          var newCoins = tx.getCoins();
          if(newCoins[0].number != lastNum + 1){
            next('Bad transaction: fusionned coin number must follow last issuance transaction');
            return;
          }
          next();
        });
      },
      function (next){
        // Verify fusion coin sum
        var fusion = 0;
        var sum = 0;
        tx.getCoins().forEach(function (coin, index) {
          if(index == 0)
            fusion = coin.base * Math.pow(10, coin.power);
          else
            sum += coin.base * Math.pow(10, coin.power);
        });
        if(sum != fusion){
          next('Bad fusion sum');
          return;
        }
        next();
      },
      function (next){
        // Verify each coin is owned
        var coins = tx.getCoins();
        coins = _(coins).last(coins.length - 1);
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
        Key.setSeenTX(tx, true, next);
      },
      function (next){
        Merkle.updateForFusion(tx, next);
      },
      function (merkle, code, next){
        // Remove ownership of fusion coins
        async.forEach(_(tx.getCoins()).last(tx.coins.length-1), function(coin, callback){
          Coin.findByCoinID(coin.issuer+'-'+coin.number, function (err, ownership) {
            ownership.owner = '';
            ownership.transaction = tx.sender + '-' + tx.number;
            ownership.save(callback);
          });
        }, next);
      },
      function (next) {
        var coin = tx.coins[0];
        var c = new Coin({
          id: coin.match(/([A-Z\d]{40}-\d+-\d-\d+-\w-\d+)?/)[1],
          transaction: tx.sender + '-' + tx.number,
          owner: tx.sender
        });
        c.save(next);
      }
    ], function (err, result) {
      callback(err, tx);
    });
  }

  return this;
}
