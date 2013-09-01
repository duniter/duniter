var jpgp        = require('../lib/jpgp');
var async       = require('async');
var mongoose    = require('mongoose');
var _           = require('underscore');
var Membership  = mongoose.model('Membership');
var Amendment   = mongoose.model('Amendment');
var PublicKey   = mongoose.model('PublicKey');
var Merkle      = mongoose.model('Merkle');
var Coin        = mongoose.model('Coin');
var Transaction = mongoose.model('Transaction');

module.exports = function (pgp, currency, conf) {

  this.all = function (req, res) {
    async.waterfall([
      function (next){
        Merkle.txAll(next);
      },
      function (merkle, next){
        Merkle.processForURL(req, merkle, lambda, next);
      }
    ], function (err, json) {
      if(err){
        res.send(404, err);
        return;
      }
      merkleDone(req, res, json);
    });
  }

  this.sender = {

    get: function (req, res) {
      showMerkle(Merkle.txOfSender, null, null, req, res);
    },

    last: function (req, res) {

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
          Transaction.findLast(matches[1], next);
        }
      ], function (err, result) {
        if(err){
          res.send(404, err);
          return;
        }
        res.send(200, JSON.stringify({
          raw: result.getRaw(),
          signature: result.signature,
          transaction: result.json()
        }, null, "  "));
      });
    },

    dividendLast: function (req, res) {

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
          Transaction.findLastIssuance(matches[1], next);
        }
      ], function (err, result) {
        if(err){
          res.send(404, err);
          return;
        }
        res.send(200, JSON.stringify({
          raw: result.getRaw(),
          signature: result.signature,
          transaction: result.json()
        }, null, "  "));
      });
    },

    issuance: function (req, res) {
      showMerkle(Merkle.txIssuanceOfSender, null, null, req, res);
    },

    dividend: function (req, res) {
      showMerkle(Merkle.txDividendOfSender, null, null, req, res);
    },

    amDividend: function (req, res) {
      showMerkle(Merkle.txDividendOfSenderByAmendment, null, req.params.amnum, req, res);
    },

    transfert: function (req, res) {
      showMerkle(Merkle.txTransfertOfSender, null, null, req, res);
    },

    fusion: function (req, res) {
      showMerkle(Merkle.txFusionOfSender, null, null, req, res);
    }
  };

  this.processTx = {

    issuance: function (req, res) {
      var tx = new Transaction({});
      var am = null;
      var pubkey = null;
      async.waterfall([

        // Parameters
        function(callback){
          if(!(req.body && req.body.transaction && req.body.signature)){
            callback('Requires a transaction + signature');
            return;
          }
          callback(null, req.body.transaction, req.body.signature);
        },

        // Check signature's key ID
        function(tx, sig, callback){
          var keyID = jpgp().signature(sig).issuer();
          if(!(keyID && keyID.length == 16)){
            callback('Cannot identify signature issuer`s keyID');
            return;
          }
          callback(null, tx + sig, keyID);
        },

        // Looking for corresponding public key
        function(signedTX, keyID, callback){
          PublicKey.search("0x" + keyID, function (err, keys) {
            if(keys.length > 1){
              callback('Multiple PGP keys found for this keyID.');
              return;
            }
            if(keys.length < 1){
              callback('Corresponding Public Key not found.');
              return;
            }
            pubkey = keys[0];
            callback(null, signedTX);
          });
        },

        function (signedTX, next){
          tx.parse(signedTX, next);
        },
        function (tx, next){
          tx.verify(currency, next);
        },
        function (verified, next){
          tx.verifySignature(pubkey.raw, next);
        },
        function (verified, next){
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
          Transaction.findLast(tx.sender, function (err, lastTX) {
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
              lastNum = lastCoins[lastCoins.length - 1].number;
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
          // M All
          Merkle.txAll(next);
        },
        function (merkle, next){
          merkle.push(tx.hash);
          merkle.save(next);
        },
        function (merkle, code, next){
          // M1
          Merkle.txOfSender(tx.sender, next);
        },
        function (merkle, next){
          merkle.push(tx.hash);
          merkle.save(next);
        },
        function (merkle, code, next){
          // M2
          Merkle.txIssuanceOfSender(tx.sender, next);
        },
        function (merkle, next){
          merkle.push(tx.hash);
          merkle.save(next);
        },
        function (merkle, code, next){
          // M3
          Merkle.txDividendOfSender(tx.sender, next);
        },
        function (merkle, next){
          merkle.push(tx.hash);
          merkle.save(next);
        },
        function (merkle, code, next){
          // M4
          Merkle.txDividendOfSenderByAmendment(tx.sender, am.number, next);
        },
        function (merkle, next){
          merkle.push(tx.hash);
          merkle.save(next);
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
        if(err){
          console.error(err);
          res.send(500, err);
          return;
        }
        else{
          res.send(200, JSON.stringify(tx.json(), null, "  "));
          return;
        }
      });
    },

    transfert: function (req, res) {
      var tx = new Transaction({});
      var am = null;
      var pubkey = null;
      async.waterfall([

        // Parameters
        function(callback){
          if(!(req.body && req.body.transaction && req.body.signature)){
            callback('Requires a transaction + signature');
            return;
          }
          callback(null, req.body.transaction, req.body.signature);
        },

        // Check signature's key ID
        function(tx, sig, callback){
          var keyID = jpgp().signature(sig).issuer();
          if(!(keyID && keyID.length == 16)){
            callback('Cannot identify signature issuer`s keyID');
            return;
          }
          callback(null, tx + sig, keyID);
        },

        // Looking for corresponding public key
        function(signedTX, keyID, callback){
          PublicKey.search("0x" + keyID, function (err, keys) {
            if(keys.length > 1){
              callback('Multiple PGP keys found for this keyID.');
              return;
            }
            if(keys.length < 1){
              callback('Corresponding Public Key not found.');
              return;
            }
            pubkey = keys[0];
            callback(null, signedTX);
          });
        },

        function (signedTX, next){
          tx.parse(signedTX, next);
        },
        function (tx, next){
          tx.verify(currency, next);
        },
        function (verified, next){
          tx.verifySignature(pubkey.raw, next);
        },
        function (verified, next){
          // Get last transaction
          Transaction.findLast(tx.sender, function (err, lastTX) {
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
        },
        function (next){
          tx.save(next);
        },
        function (txSaved, code, next){
          // Verify each coin is owned
          async.forEach(tx.getCoins(), function(coin, callback){
            Coin.findByCoinID(coin.issuer+'-'+coin.number, function (err, ownership) {
              ownership.owner = tx.recipient;
              ownership.transaction = tx.sender + '-' + tx.number;
              ownership.save(callback);
            });
          }, next);
        },
        function (next){
          // M All
          Merkle.txAll(next);
        },
        function (merkle, next){
          merkle.push(tx.hash);
          merkle.save(next);
        },
        function (merkle, code, next){
          // M1
          Merkle.txOfSender(tx.sender, next);
        },
        function (merkle, next){
          merkle.push(tx.hash);
          merkle.save(next);
        },
        function (merkle, code, next){
          // M6
          Merkle.txTransfertOfSender(tx.sender, next);
        },
        function (merkle, next){
          merkle.push(tx.hash);
          merkle.save(next);
        }
      ], function (err, result) {
        if(err){
          console.error(err);
          res.send(500, err);
          return;
        }
        else{
          res.send(200, JSON.stringify(tx.json(), null, "  "));
          return;
        }
      });
    }
  };
  
  return this;
}

function showMerkle (merkleGetFunc, merkleHashFunc, amNumber, req, res) {
  if(!req.params.fpr){
    res.send(400, "Fingerprint is required");
    return;
  }
  var matches = req.params.fpr.match(/(\w{40})/);
  if(!matches){
    res.send(400, "Fingerprint format is incorrect, must be an upper-cased SHA1 hash");
    return;
  }

  var hash = matches[1];
  async.waterfall([
    function (next){
      if(amNumber)
        merkleGetFunc.call(merkleGetFunc, hash, amNumber, next);
      else
        merkleGetFunc.call(merkleGetFunc, hash, next);
    },
    function (merkle, next){
      Merkle.processForURL(req, merkle, merkleHashFunc || lambda, next);
    }
  ], function (err, json) {
    if(err){
      res.send(404, err);
      return;
    }
    merkleDone(req, res, json);
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

function merkleDone(req, res, json) {
  if(req.query.nice){
    res.setHeader("Content-Type", "text/plain");
    res.end(JSON.stringify(json, null, "  "));
  }
  else res.end(JSON.stringify(json));
}
