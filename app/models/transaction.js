var mongoose = require('mongoose');
var async    = require('async');
var sha1     = require('sha1');
var _        = require('underscore');
var fs       = require('fs');
var rawer    = require('../lib/rawer');
var Schema   = mongoose.Schema;

var TransactionSchema = new Schema({
  version: String,
  currency: String,
  hash: String,
  issuers: [String],
  inputs: [String],
  outputs: [String],
  signatures: [String],
  created: { type: Date, default: Date.now },
  updated: { type: Date, default: Date.now }
});

TransactionSchema.pre('save', function (next) {
  this.updated = Date.now();
  next();
});

TransactionSchema.methods = {

  json: function() {
    return {
      'version': parseInt(this.version, 10),
      'currency': this.currency,
      'issuers': this.issuers,
      'inputs': this.inputs,
      'outputs': this.outputs,
      'signatures': this.signatures,
      'raw': this.getRaw(),
      'hash': this.hash
    };
  },

  getTransaction: function () {
    var tx = {};
    tx.issuers = this.issuers;
    tx.signatures = this.signatures;
    // Inputs
    tx.inputs = [];
    this.inputs.forEach(function (input) {
      var sp = input.split(':');
      tx.inputs.push({
        pubkey: tx.issuers[parseInt(sp[0])],
        type: sp[1],
        number: parseInt(sp[2]),
        fingerprint: sp[3],
        amount: parseInt(sp[4])
      });
    });
    // Outputs
    tx.outputs = [];
    this.outputs.forEach(function (output) {
      var sp = output.split(':');
      tx.outputs.push({
        pubkey: sp[0],
        amount: parseInt(sp[1])
      });
    });
    return tx;
  },

  getRaw: function () {
    return rawer.getTransaction(this);
  },

  getHash: function () {
    return sha1(rawer.getTransaction(this)).toUpperCase();
  },

  compact: function () {
    return rawer.getCompactTransaction(this);
  }
};

TransactionSchema.statics.getByHash = function (hash, done) {
  this
    .find({ "hash": hash })
    .sort({number: -1})
    .exec(function (err, txs) {
      done(err, txs.length > 0 ? txs[0] : null);
    });
};

TransactionSchema.statics.removeByHash = function (hash, done) {
  this
    .find({ "hash": hash })
    .remove(function (err) {
      done(err);
    });
};

module.exports = TransactionSchema;
