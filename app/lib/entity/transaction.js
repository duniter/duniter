var _ = require('underscore');
var rawer = require('../rawer');
var sha1 = require('sha1');

var Transaction = function(obj, currency) {

  var that = this;
  var json = obj || {};

  this.inputs = [];
  this.outputs = [];
  this.issuers = [];

  _(json).keys().forEach(function(key) {
   that[key] = json[key];
  });

  this.version = 1;
  this.currency = currency || this.currency;

  if (this.signatories && this.signatories.length)
    this.issuers = this.signatories;
  if (this.issuers && this.issuers.length)
    this.signatories = this.issuers;

  this.json = function() {
    return {
      'version': parseInt(this.version, 10),
      'currency': this.currency,
      'issuers': this.issuers,
      'inputs': this.inputs,
      'outputs': this.outputs,
      'comment': this.comment,
      'signatures': this.signatures,
      'raw': this.getRaw(),
      'hash': this.hash
    };
  };

  this.getTransaction = function () {
    var tx = {};
    tx.hash = this.hash;
    tx.version = this.version;
    tx.currency = this.currency;
    tx.issuers = this.issuers || this.signatories;
    tx.signatures = this.signatures;
    // Inputs
    tx.inputs = [];
    this.inputs.forEach(function (input) {
      var sp = input.split(':');
      tx.inputs.push({
        index: parseInt(sp[0]),
        pubkey: tx.issuers[parseInt(sp[0])] || '',
        type: sp[1],
        number: parseInt(sp[2]),
        fingerprint: sp[3],
        amount: parseInt(sp[4]),
        raw: input
      });
    });
    // Outputs
    tx.outputs = [];
    this.outputs.forEach(function (output) {
      var sp = output.split(':');
      tx.outputs.push({
        pubkey: sp[0],
        amount: parseInt(sp[1]),
        raw: output
      });
    });
    tx.comment = this.comment;
    return tx;
  };

  this.getRaw = function () {
    return rawer.getTransaction(this);
  };

  this.getHash = function (recompute) {
    return (!recompute && this.hash) || sha1(rawer.getTransaction(this)).toUpperCase();
  };

  this.compact = function () {
    return rawer.getCompactTransaction(this);
  };

  this.hash = this.hash || sha1(this.getRaw()).toUpperCase();
};

Transaction.statics = {};

module.exports = Transaction;
