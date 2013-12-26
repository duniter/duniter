var mongoose = require('mongoose');
var async    = require('async');
var sha1     = require('sha1');
var _        = require('underscore');
var Schema   = mongoose.Schema;

var TxMemorySchema = new Schema({
  sender: String,
  number: Number,
  hash: String,
  created: { type: Date, default: Date.now },
  updated: { type: Date, default: Date.now }
});

TxMemorySchema.pre('save', function (next) {
  this.updated = Date.now();
  next();
});

TxMemorySchema.methods = {
};

TxMemorySchema.statics.getTheOne = function (sender, number, hash, done) {

  this.find({ "sender": sender, "number": number, "hash": hash }).exec(function (err, txs) {
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

TxMemorySchema.statics.deleteOverNumber = function (sender, number, done) {
  var start = isNaN(number) ? -1 : number - 1;
  this.remove({ "sender": sender, "number": { $gt: start }}, done);
};

var TxMemory = mongoose.model('TxMemory', TxMemorySchema);
