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
  amounts: Array,
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
    if (!tx.error) {
      if (this.getAmounts().length == 0) {
        tx.error = "Transaction must carry at least one amount";
      } else {
        this.getAmounts().forEach(function(amount){
          if (amount.value == 0) {
            tx.error = "A coin must have a strictly positive basis";
          }
        });
      }
    }
    callback(tx.error, this);
  },

  check: function () {
    if (this.getAmounts().length == 0) {
      return "Transaction must carry at least one amount";
    } else {
      this.getAmounts().forEach(function(amount){
        if (amount.value == 0) {
          return "A coin must have a strictly positive basis";
        }
      });
    }
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
      .signature(this.signature)
      .verify(publicKey, done);
  },

  getAmounts: function() {
    var amounts = [];
    for (var i = 0; i < this.amounts.length; i++) {
      var matches = this.amounts[i].match(/([A-Z\d]{40})-(\d+):(\d+)/);
      if(matches && matches.length == 4){
        amounts.push({
          origin: matches[1],
          number: parseInt(matches[2], 10),
          value: parseInt(matches[3], 10)
        });
      }
    }
    return amounts;
  },

  getValue: function() {
    var sum = 0;
    this.getAmounts().forEach(function (amount) {
      sum += amount.value;
    });
    return sum;
  },

  getIssuanceSum: function() {
    return this.getValue();
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
    raw += "Amounts:\n";
    for(var i = 0; i < this.amounts.length; i++){
      raw += this.amounts[i] + "\n";
    }
    raw += "Comment:\n" + this.comment;
    return raw.unix2dos();
  },

  getRawSigned: function() {
    var raw = this.getRaw() + this.signature;
    return raw;
  },

  json: function() {
    return {
      signature: this.signature,
      version: parseInt(this.version, 10),
      currency: this.currency,
      sender: this.sender,
      number: parseInt(this.number, 10),
      previousHash: this.previousHash,
      recipient: this.recipient,
      type: this.type,
      amounts: this.amounts,
      sigDate: parseInt(this.sigDate.getTime()/1000, 10),
      comment: this.comment
    };
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

  this.find({ sender: fingerprint, type: { $in: ['ISSUANCE', 'CHANGE'] } }).sort({number: -1}).limit(1).exec(function (err, txs) {
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

  Transaction
    .find({ sender: fingerprint, type: 'ISSUANCE', amounts: new RegExp("-" + amNumber + ":") })
    .sort({number: -1})
    .exec(done);
};

TransactionSchema.statics.findAllWithSource = function (issuer, number, done) {

  Transaction
    .find({ amounts: new RegExp(issuer + "-" + number + ":") })
    .sort({number: -1})
    .exec(done);
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
  tx1.amounts        = tx2.amounts;
  tx1.comment      = tx2.comment;
  tx1.hash         = tx2.hash;
}
