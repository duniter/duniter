"use strict";
var _ = require('underscore');
var hashf = require('../hashf');

module.exports = Block;

function Block(json) {

  var that = this;

  this.documentType = 'block';

  _(json || {}).keys().forEach(function(key) {
    var value = json[key];
    if (
         key == "number"
      || key == "dividend"
      || key == "medianTime"
      || key == "time"
      || key == "version"
      || key == "nonce"
      || key == "powMin"
      || key == "membersCount"
      || key == "dividend"
      || key == "UDTime"
    ) {
      if (typeof value == "string") {
        value = parseInt(value);
      }
      if (isNaN(value) || value === null) {
        value = 0;
      }
    }
    that[key] = value;
  });

  this.json = function() {
    var that = this;
    var json = {};
    [
      "version",
      "nonce",
      "number",
      "powMin",
      "time",
      "medianTime",
      "membersCount",
      "monetaryMass"
    ].forEach(function(field){
        json[field] = parseInt(that[field], 10);
      });
    [
      "currency",
      "issuer",
      "signature",
      "hash",
      "parameters"
    ].forEach(function(field){
        json[field] = that[field] || "";
      });
    [
      "previousHash",
      "previousIssuer"
    ].forEach(function(field){
        json[field] = that[field] || null;
      });
    [
      "dividend"
    ].forEach(function(field){
        json[field] = parseInt(that[field]) || null;
      });
    [
      "identities",
      "joiners",
      "actives",
      "leavers",
      "excluded",
      "certifications"
    ].forEach(function(field){
        json[field] = [];
        that[field].forEach(function(raw){
          json[field].push(raw);
        });
      });
    [
      "transactions"
    ].forEach(function(field){
        json[field] = [];
        that[field].forEach(function(obj){
          json[field].push(_(obj).omit('raw', 'certifiers', 'hash'));
        });
      });
    json.raw = this.getRaw();
    return json;
  };

  this.getHash = function() {
    if (!this.hash) {
      this.hash = hashf(this.getRawSigned()).toUpperCase();
    }
    return this.hash;
  };

  this.getRaw = function() {
    return require('../../lib/rawer').getBlockWithoutSignature(this);
  };

  this.getRawSigned = function() {
    return require('../../lib/rawer').getBlock(this);
  };

  this.quickDescription = function () {
    var desc = '#' + this.number + ' (';
    desc += this.identities.length + ' newcomers, ' + this.certifications.length + ' certifications)';
    return desc;
  };

  this.getInlineIdentity = function (pubkey) {
    var i = 0;
    var found = false;
    while (!found && i < this.identities.length) {
      if (this.identities[i].match(new RegExp('^' + pubkey)))
        found = this.identities[i];
      i++;
    }
    return found;
  };

  this.isLeaving = function (pubkey) {
    var i = 0;
    var found = false;
    while (!found && i < this.leavers.length) {
      if (this.leavers[i].match(new RegExp('^' + pubkey)))
        found = true;
      i++;
    }
    while (!found && i < this.excluded.length) {
      if (this.excluded[i].match(new RegExp('^' + pubkey)))
        found = true;
      i++;
    }
    return found;
  };

  this.isJoining = function (pubkey) {
    var i = 0;
    var found = false;
    while (!found && i < this.joiners.length) {
      if (this.joiners[i].match(new RegExp('^' + pubkey)))
        found = true;
      i++;
    }
    return found;
  };

  this.getTransactions = function () {
    var transactions = [];
    var version = this.version;
    var currency = this.currency;
    this.transactions.forEach(function (simpleTx) {
      var tx = {};
      tx.issuers = simpleTx.signatories || [];
      tx.signatures = simpleTx.signatures || [];
      // Inputs
      tx.inputs = [];
      (simpleTx.inputs || []).forEach(function (input) {
        var sp = input.split(':');
        tx.inputs.push({
          index: parseInt(sp[0]),
          pubkey: tx.issuers[parseInt(sp[0])] || '',
          type: sp[1],
          number: parseInt(sp[2]),
          fingerprint: sp[3],
          amount: parseInt(sp[4]),
          raw: input
        });
      });
      // Outputs
      tx.outputs = [];
      (simpleTx.outputs || []).forEach(function (output) {
        var sp = output.split(':');
        tx.outputs.push({
          pubkey: sp[0],
          amount: parseInt(sp[1]),
          raw: output
        });
      });
      tx.comment = simpleTx.comment;
      tx.version = version;
      tx.currency = currency;
      transactions.push(tx);
    });
    return transactions;
  };
}

Block.statics = {};

Block.statics.fromJSON = (json) => new Block(json);
