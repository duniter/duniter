var mongoose = require('mongoose');
var async    = require('async');
var sha1     = require('sha1');
var _        = require('underscore');
var jpgp     = require('../lib/jpgp');
var fs       = require('fs');
var hdc      = require('../../node_modules/hdc');
var Schema   = mongoose.Schema;

var TransactionSchema = new Schema({
  version: String,
  currency: String,
  sender: String,
  number: Number,
  previousHash: String,
  recipient: String,
  type: String,
  coins: Array,
  comment: String,
  signature: String,
  propagated: { type: Boolean, default: false },
  hash: String,
  sigDate: { type: Date, default: function(){ return new Date(0); } },
  created: { type: Date, default: Date.now },
  updated: { type: Date, default: Date.now }
});

TransactionSchema.pre('save', function (next) {
  this.updated = Date.now();
  async.waterfall([
    function (next){
      mongoose.model('TxMemory').deleteOverNumber(this.sender, this.number, next);
    }
  ], next);
});

TransactionSchema.methods = {
  
  hdc: function() {
    var tx = new hdc.Transaction(this.getRaw());
    fill(tx, this);
    tx.number = this.number + "";
    return tx;
  },
  
  parse: function(rawTX, callback) {
    rawTX = rawTX.unix2dos();
    var tx = null;
    var sigIndex = rawTX.lastIndexOf("-----BEGIN");
    if(~sigIndex){
      this.signature = rawTX.substring(sigIndex);
      tx = new hdc.Transaction(rawTX.substring(0, sigIndex));
      try{
        this.sigDate = jpgp().signature(this.signature).signatureDate();
      }
      catch(ex){}
    }
    else{
      tx = new hdc.Transaction(rawTX);
    }
    fill(this, tx);
    this.hash = sha1(rawTX).toUpperCase();
    callback(tx.error, this);
  },

  verify: function (currency, done) {
    var hdcTX = this.hdc();
    var valid = hdcTX.verify(currency);
    if(!valid && done){
      done(hdcTX.error, valid);
    }
    if(valid && done){
      done(null, valid);
    }
    return valid;
  },

  verifySignature: function (publicKey, done) {
    jpgp()
      .publicKey(publicKey)
      .data(this.getRaw())
      .noCarriage()
      .signature(this.signature)
      .verify(publicKey, done);
  },

  getCoins: function() {
    var coins = [];
    for (var i = 0; i < this.coins.length; i++) {
      var matches = this.coins[i].match(/([A-Z\d]{40})-(\d+)-(\d)-(\d+)-(A|F|D)-(\d+)(, ([A-Z\d]{40})-(\d+))?/);
      if(matches && matches.length == 10){
        coins.push({
          id: matches[0],
          issuer: matches[1],
          number: parseInt(matches[2], 10),
          base: parseInt(matches[3], 10),
          power: parseInt(matches[4], 10),
          originType: matches[5],
          originNumber: matches[6],
          transaction: matches[7] && {
            sender: matches[8],
            number: matches[9]
          }
        });
      }
    }
    return coins;
  },

  getIssuanceSum: function() {
    var sum = 0;
    this.getCoins().forEach(function (coin) {
      if(coin.originType == 'A'){
        sum += coin.base * Math.pow(10, coin.power);
      }
    });
    return sum;
  },

  getLastIssuedCoin: function() {
    if (this.type == 'ISSUANCE') {
      // Get last coin of the list
      var coins = this.getCoins();
      return coins[coins.length - 1];
    } else if (this.type == 'FUSION') {
      // Get first coin
      return this.getCoins()[0];
    } else if (this.type == 'DIVISION') {
      // Get last coin of the list with no TRANSACTION_ID
      var coins = this.getCoins();
      var lastCoin = null;
      var i = 0;
      while (coins[i] && !coins[i].transaction) {
        lastCoin = coins[i];
        i++;
      }
      return lastCoin;
    } else {
      // No issued coin exists
      return null;
    }
  },

  getRaw: function() {
    var raw = "";
    raw += "Version: " + this.version + "\n";
    raw += "Currency: " + this.currency + "\n";
    raw += "Sender: " + this.sender + "\n";
    raw += "Number: " + this.number + "\n";
    if(this.previousHash){
      raw += "PreviousHash: " + this.previousHash + "\n";
    }
    raw += "Recipient: " + this.recipient + "\n";
    raw += "Type: " + this.type + "\n";
    raw += "Coins:\n";
    for(var i = 0; i < this.coins.length; i++){
      raw += this.coins[i] + "\n";
    }
    raw += "Comment:\n" + this.comment;
    return raw.unix2dos();
  },

  getRawSigned: function() {
    var raw = this.getRaw() + this.signature;
    return raw;
  },

  json: function() {
    var obj = {
      version: this.version,
      currency: this.currency,
      sender: this.sender,
      number: this.number,
      previousHash: this.previousHash,
      recipient: this.recipient,
      type: this.type,
      coins: [],
      sigDate: parseInt(this.sigDate.getTime()/1000, 10),
      comment: this.comment
    }
    this.coins.forEach(function (coin) {
      var matches = coin.match(/^([A-Z\d]{40}-\d+-\d-\d+-(A|F|D)-\d+)(, ([A-Z\d]{40}-\d+))?/);
      obj.coins.push({
        id: matches[1],
        transaction_id: matches[4] ? matches[4] : ''
      });
    });
    return obj;
  }
};

TransactionSchema.statics.getBySenderAndNumber = function (fingerprint, number, done) {

  this.find({ sender: fingerprint, number: number }).exec(function (err, txs) {
    if(txs && txs.length == 1){
      done(err, txs[0]);
      return;
    }
    if(!txs || txs.length == 0){
      done('No transaction found');
      return;
    }
    if(txs || txs.length > 1){
      done('More than one transaction found');
    }
  });
};

TransactionSchema.statics.findLastAll = function (done) {

  this.find().sort({sigDate: -1}).limit(1).exec(function (err, txs) {
    if(txs && txs.length == 1){
      done(err, txs[0]);
      return;
    }
    if(!txs || txs.length == 0){
      done('No transaction found');
      return;
    }
    if(txs || txs.length > 1){
      done('More than one transaction found');
    }
  });
};

TransactionSchema.statics.findLastOf = function (fingerprint, done) {

  this.find({ sender: fingerprint }).sort({number: -1}).limit(1).exec(function (err, txs) {
    if(txs && txs.length == 1){
      done(err, txs[0]);
      return;
    }
    if(!txs || txs.length == 0){
      done('No transaction found');
      return;
    }
    if(txs || txs.length > 1){
      done('More than one transaction found');
    }
  });
};

TransactionSchema.statics.findLastIssuance = function (fingerprint, done) {

  this.find({ sender: fingerprint, type: { $in: ['ISSUANCE', 'FUSION', 'DIVISION'] } }).sort({number: -1}).limit(1).exec(function (err, txs) {
    if(txs && txs.length == 1){
      done(err, txs[0]);
      return;
    }
    if(!txs || txs.length == 0){
      done('No transaction found');
      return;
    }
    if(txs || txs.length > 1){
      done('More than one transaction found');
    }
  });
};

TransactionSchema.statics.findAllIssuanceOfSenderForAmendment = function (fingerprint, amNumber, done) {

  async.waterfall([
    function (next){
      mongoose.model('Merkle').txDividendOfSenderByAmendment(fingerprint, amNumber, next);
    },
    function (merkle, next){
      Transaction.find({ sender: fingerprint, hash: { $in: merkle.leaves() }}).sort({number: -1}).exec(next);
    }
  ], done);
};

var Transaction = mongoose.model('Transaction', TransactionSchema);

function fill (tx1, tx2) {
  tx1.version      = tx2.version;
  tx1.currency     = tx2.currency;
  tx1.sender       = tx2.sender;
  tx1.number       = tx2.number;
  tx1.previousHash = tx2.previousHash;
  tx1.recipient    = tx2.recipient;
  tx1.type         = tx2.type;
  tx1.coins        = tx2.coins;
  tx1.comment      = tx2.comment;
  tx1.hash         = tx2.hash;
}
