var jpgp    = require('../lib/jpgp');
var async   = require('async');
var status  = require('../models/statusMessage');
var parsers = require('../lib/streams/parsers/doc');

module.exports.get = function (conn, currencyName) {

  return ParameterNamespace(conn, currencyName);
};

function ParameterNamespace (conn, currency) {

  var that = this;
  var PublicKey   = conn.model('PublicKey');
  var Membership  = conn.model('Membership');
  var Voting      = conn.model('Voting');
  var Vote        = conn.model('Vote');
  var Peer        = conn.model('Peer');
  var Transaction = conn.model('Transaction');
  var Forward     = conn.model('Forward');
  var Wallet      = conn.model('Wallet');

  this.getTransaction = function (req, callback) {
    async.waterfall([
      function (next){
        this.getTransactionFromRaw(req.body && req.body.transaction, req.body && req.body.signature, next);
      },
      function (pubkey, signedTx, next) {
        var tx;
        async.waterfall([
          function (next){
            parsers.parseTransaction(next).asyncWrite(signedTx, next);
          },
          function (obj, next){
            tx = new Transaction(obj);
            tx.verifySignature(pubkey.raw, next);
          }
        ], function (err, verified) {
          next(err, tx);
        });
      }
    ], callback);
  };

  this.getTransactionFromRaw = function (transaction, signature, callback) {
    // Parameters
    if(!(transaction && signature)){
      callback('Requires a transaction + signature');
      return;
    }

    // Check signature's key ID
    var keyID = jpgp().signature(signature).issuer();
    if(!(keyID && keyID.length == 16)){
      callback('Cannot identify signature issuer`s keyID');
      return;
    }

    // Looking for corresponding public key
    PublicKey.getTheOne(keyID, function (err, pubkey) {
      callback(err, pubkey, transaction + signature);
    });
  };

  this.getPeeringEntry = function (req, callback) {
    this.getPeeringEntryFromRaw(req.body && req.body.entry, req.body && req.body.signature, callback);
  };

  this.getPeeringEntryFromRaw = function (entry, signature, callback) {
    // Parameters
    if(!(entry && signature)){
      callback('Requires a peering entry + signature');
      return;
    }

    // Check signature's key ID
    var keyID = jpgp().signature(signature).issuer();
    if(!(keyID && keyID.length == 16)){
      callback('Cannot identify signature issuer`s keyID');
      return;
    }

    var peer;

    async.waterfall([
      function (next){
        parsers.parsePeer(next).asyncWrite(entry + signature, next);
      },
      function (obj, next){
        next(null, new Peer(obj), keyID);
      },
    ], callback);
  };

  this.getFingerprint = function (req, callback){
    if(!req.params.fpr){
      callback("Fingerprint is required");
      return;
    }
    var matches = req.params.fpr.match(/(\w{40})/);
    if(!matches){
      callback("Fingerprint format is incorrect, must be an upper-cased SHA1 hash");
      return;
    }
    callback(null, matches[1]);
  };

  this.getNumber = function (req, callback){
    if(!req.params.number){
      callback("Number is required");
      return;
    }
    var matches = req.params.number.match(/^(\d+)$/);
    if(!matches){
      callback("Number format is incorrect, must be a positive integer");
      return;
    }
    callback(null, matches[1]);
  };

  this.getCount = function (req, callback){
    if(!req.params.count){
      callback("Count is required");
      return;
    }
    var matches = req.params.count.match(/^(\d+)$/);
    if(!matches){
      callback("Count format is incorrect, must be a positive integer");
      return;
    }
    var count = parseInt(matches[1], 10);
    if(count <= 0){
      callback("Count must be a positive integer");
      return;
    }
    callback(null, matches[1]);
  };

  this.getTransactionID = function (req, callback) {
    async.series({
      fprint: async.apply(that.getFingerprint, req),
      number: async.apply(that.getNumber, req)
    },
    function(err, results) {
      callback(null, results.fprint, results.number);
    });
  };

  this.getVote = function (req, callback){
    if(!(req.body && req.body.amendment && req.body.signature)){
      callback('Requires an amendment + signature');
      return;
    }
    var vote = new Vote();
    async.waterfall([
      function (next){
        // Extract data
        vote.parse(req.body.amendment.unix2dos() + req.body.signature.unix2dos(), next);
      },
      function (vote, next){
        // Verify content and signature
        vote.verify(currency, next);
      },
    ], function (err, verified) {
      callback(err, vote);
    });
  };

  this.getAmendmentID = function (req, callback) {
    if(!req.params || !req.params.amendment_id){
      callback("Amendment ID is required");
      return;
    }
    var matches = req.params.amendment_id.match(/^(\d+)-(\w{40})$/);
    if(!matches){
      callback("Amendment ID format is incorrect, must be 'number-hash'");
      return;
    }
    callback(null, matches[1], matches[2]);
  };

  this.getAmendmentNumber = function (req, callback) {
    if(!req.params || !req.params.am_number){
      callback("Amendment number is required");
      return;
    }
    var matches = req.params.am_number.match(/^(\d+)$/);
    if(!matches){
      callback("Amendment number format is incorrect, must be an integer value");
      return;
    }
    callback(null, matches[1]);
  };

  this.getAmendmentNumberAndAlgo = function (req, callback) {
    if(!req.params || !req.params.am_number){
      callback("Amendment number is required");
      return;
    }
    if(!req.params || !req.params.algo){
      callback("Algorithm is required");
      return;
    }
    var matchAMNumber = req.params.am_number.match(/^(\d+)$/);
    if(!matchAMNumber){
      callback("Amendment number format is incorrect, must be an integer value");
      return;
    }
    var matchAlgo = req.params.algo.match(/^(AnyKey|1Sig)$/);
    if(!matchAlgo){
      callback("Algorithm is incorrect, must be either AnyKey or 1Sig");
      return;
    }
    callback(null, matchAMNumber[1], matchAlgo[1]);
  };

  this.getCoinID = function (req, callback) {
    if(!req.params || !req.params.coin_id){
      callback("Coin ID is required");
      return;
    }
    var matches = req.params.coin_id.match(/^(\w{40})-(\d+)-(\d+)$/);
    if(!matches){
      callback("Coin ID format is incorrect, must be 'hash-amNumber-coinNumber'");
      return;
    }
    callback(null, matches[1], matches[2], matches[3]);
  };

  this.getMembership = function (req, callback) {
    if(!(req.body && req.body.membership && req.body.signature)){
      callback('Requires a membership + signature');
      return;
    }
    async.waterfall([

      // Check signature's key ID
      function(callback){
        var sig = req.body.signature;
        var keyID = jpgp().signature(sig).issuer();
        if(!(keyID && keyID.length == 16)){
          callback('Cannot identify signature issuer`s keyID');
          return;
        }
        callback(null, keyID);
      },

      // Looking for corresponding public key
      function(keyID, callback){
        PublicKey.getTheOne(keyID, function (err, pubkey) {
          callback(err, pubkey);
        });
      },

      function (pubkey, next){
        var entry = new Membership();
        async.waterfall([
          function (next){
            parsers.parseMembership(next).asyncWrite(req.body.membership + req.body.signature, next);
          },
          function (obj, next){
            entry = new Membership(obj);
            entry.verifySignature(pubkey.raw, next);
          },
          function (verified, next){
            if(!verified){
              next('Bad signature');
              return;
            }
            if(pubkey.fingerprint != entry.issuer){
              next('Fingerprint in Membership (' + entry.issuer + ') does not match signatory (' + pubkey.fingerprint + ')');
              return;
            }
            next(null, entry);
          },
        ], next);
      },
    ], callback);
  };

  this.getVoting = function (req, callback) {
    if(!(req.body && req.body.voting && req.body.signature)){
      callback('Requires a voting + signature');
      return;
    }
    async.waterfall([

      function (callback) {
        if(req.body.signature.indexOf('-----BEGIN') == -1){
          callback('Signature does not seem to be valid');
          return;
        }
        callback();
      },

      // Check signature's key ID
      function(callback){
        var sig = req.body.signature;
        var keyID = jpgp().signature(sig).issuer();
        if(!(keyID && keyID.length == 16)){
          callback('Cannot identify signature issuer`s keyID');
          return;
        }
        callback(null, keyID);
      },

      // Looking for corresponding public key
      function(keyID, callback){
        PublicKey.getTheOne(keyID, function (err, pubkey) {
          callback(err, pubkey);
        });
      },

      function (pubkey, next){
        var entry = new Voting();
        async.waterfall([
          function (next){
            parsers.parseVoting(next).asyncWrite(req.body.voting + req.body.signature, next);
          },
          function (obj, next){
            entry = new Voting(obj);
            entry.verifySignature(pubkey.raw, next);
          },
          function (verified, next){
            if(!verified){
              next('Bad signature');
              return;
            }
            if(pubkey.fingerprint != entry.issuer){
              next('Fingerprint in Voting (' + entry.issuer + ') does not match signatory (' + pubkey.fingerprint + ')');
              return;
            }
            next(null, entry);
          },
        ], next);
      },
    ], callback);
  };

  this.getWallet = function (req, callback) {
    if(!(req.body && req.body.entry && req.body.signature)){
      callback('Requires a Wallet entry + signature');
      return;
    }

    var entry = new Wallet();
    var pubkey;
    var signedEntry = req.body.entry.unix2dos() + req.body.signature.unix2dos();
    
    async.waterfall([

      function (next) {
        if(signedEntry.indexOf('-----BEGIN') == -1){
          next('Signature not found in given Wallet');
          return;
        }
        next();
      },

      // Check signature's key ID
      function(next){
        var sig = signedEntry.substring(signedEntry.indexOf('-----BEGIN'));
        var keyID = jpgp().signature(sig).issuer();
        if(!(keyID && keyID.length == 16)){
          next('Cannot identify signature issuer`s keyID');
          return;
        }
        next(null, keyID);
      },

      // Looking for corresponding public key
      function(keyID, next){
        PublicKey.getTheOne(keyID, function (err, pk) {
          pubkey = pk;
          next(err);
        });
      },

      // Verify signature
      function(next){
        parsers.parseWallet(next).asyncWrite(signedEntry, next);
      },
      function (obj, next){
        entry = new Wallet(obj);
        entry.verifySignature(pubkey.raw, next);
      },
      function (verified, next){
        if(!verified){
          next('Bad signature');
          return;
        }
        var obj = {};
        entry.copyValues(obj);
        next(null, obj);
      }
    ], callback);
  };

  this.getForward = function (req, callback) {
    async.waterfall([

      // Parameters
      function(next){
        if(!(req.body && req.body.forward && req.body.signature)){
          next('Requires a peering forward + signature');
          return;
        }
        next(null, req.body.forward, req.body.signature);
      },

      // Check signature's key ID
      function(pr, sig, next){
        PublicKey.getFromSignature(sig, function (err, pubkey) {
          next(null, pr + sig, pubkey);
        });
      },

      // Verify signature
      function(signedPR, pubkey, next){

        var fwd;
        async.waterfall([
          function (next){
            parsers.parseForward(next).asyncWrite(signedPR, next);
          },
          function (obj, next){
            fwd = new Forward(obj);
            fwd.verifySignature(pubkey, next);
          },
          function (verified, next){
            next(null, fwd);
          },
        ], next);
      }
    ], callback);
  };

  this.getStatus = function (req, callback) {
    if(!(req.body && req.body.status && req.body.signature)){
      callback('Requires a status + signature');
      return;
    }
    var status, pubkey;
    async.waterfall([
      function (next){
        parsers.parseStatus(next).asyncWrite(req.body.status + req.status.signature, next);
      },
      function (obj, next){
        status = new Status(obj);
        PublicKey.getFromSignature(status.signature, next);
      },
      function (pk, next){
        pubkey = pk;
        status.verifySignature(pubkey.raw, next);
      },
      function (verified, next){
        if (!verified) {
          next('Wrong signature');
          return;
        }
        next(null, status);
      },
    ], callback);
  };

  return this;
};