var mongoose = require('mongoose');
var async    = require('async');
var sha1     = require('sha1');
var _        = require('underscore');
var jpgp     = require('../lib/jpgp');
var fs       = require('fs');
var rawer    = require('../lib/rawer');
var Schema   = mongoose.Schema;

var TransactionSchema = new Schema({
  version: String,
  currency: String,
  sender: String,
  number: Number,
  previousHash: String,
  recipient: String,
  coins: [String],
  comment: String,
  signature: String,
  propagated: { type: Boolean, default: false },
  hash: String,
  sigDate: { type: Date, default: function(){ return new Date(0); } },
  created: { type: Date, default: Date.now },
  updated: { type: Date, default: Date.now }
});

TransactionSchema.pre('save', function (next) {
  var that = this;
  this.updated = Date.now();
  async.waterfall([
    function (next){
      that.model('TxMemory').deleteOverNumber(this.sender, this.number, next);
    }
  ], next);
});

TransactionSchema.virtual('pubkey').get(function () {
  return this._pubkey;
});

TransactionSchema.virtual('pubkey').set(function (am) {
  this._pubkey = am;
});

TransactionSchema.methods = {

  verifySignature: function (publicKey, done) {
    jpgp()
      .publicKey(publicKey)
      .data(this.getRaw())
      .signature(this.signature)
      .verify(publicKey, done);
  },

  getCoins: function() {
    var coins = [];
    for (var i = 0; i < this.coins.length; i++) {
      var matches = this.coins[i].match(/([A-Z\d]{40})-(\d+)-(\d+)(:([A-Z\d]{40})-(\d+))?/);
      if(matches && matches.length == 7){
        coins.push({
          issuer: matches[1],
          amNumber: parseInt(matches[2], 10),
          coinNumber: parseInt(matches[3], 10),
          transaction: matches[4] && {
            sender: matches[5],
            number: matches[6]
          },
          toString: function () {
            return this.issuer + '-' + this.amNumber + '-' + this.coinNumber;
          },
          getID: function () {
            return this.issuer + '-' + this.amNumber + '-' + this.coinNumber;
          }
        });
      }
    }
    return coins;
  },

  getHash: function() {
    if (!this.hash) {
      this.hash = sha1(rawTX).toUpperCase();
    }
    return this.hash;
  },

  getRaw: function() {
    return rawer.getTransactionWithoutSignature(this);
  },

  getRawSigned: function() {
    return rawer.getTransaction(this);
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
      coins: this.coins,
      sigDate: parseInt(this.sigDate.getTime()/1000, 10),
      comment: this.comment,
      raw: this.getRaw()
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

TransactionSchema.statics.findAllWithSource = function (issuer, number, done) {

  this
    .find({ coins: new RegExp(issuer + "-" + number + ":") })
    .sort({number: -1})
    .exec(done);
};

module.exports = TransactionSchema;
