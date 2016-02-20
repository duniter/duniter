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
      || key == "medianTime"
      || key == "time"
      || key == "version"
      || key == "nonce"
      || key == "powMin"
      || key == "membersCount"
      || key == "dividend"
      || key == "unitbase"
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
      "previousIssuer",
      "inner_hash"
    ].forEach(function(field){
        json[field] = that[field] || null;
      });
    [
      "dividend",
      "unitbase"
    ].forEach(function(field){
        json[field] = parseInt(that[field]) || null;
      });
    [
      "identities",
      "joiners",
      "actives",
      "leavers",
      "revoked",
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

  this.getRawInnerPart = function() {
    return require('../../lib/rawer').getBlockInnerPart(this);
  };

  this.getRaw = function() {
    return require('../../lib/rawer').getBlockWithInnerHashAndNonce(this);
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
          type: sp[0],
          identifier: sp[1],
          noffset: parseInt(sp[2]),
          raw: input
        });
      });
      // Unlocks
      tx.unlocks = simpleTx.unlocks;
      // Outputs
      tx.outputs = [];
      (simpleTx.outputs || []).forEach(function (output) {
        var sp = output.split(':');
        tx.outputs.push({
          amount: parseInt(sp[0]),
          base: parseInt(sp[1]),
          conditions: sp[2],
          raw: output
        });
      });
      tx.comment = simpleTx.comment;
      tx.version = version;
      tx.currency = currency;
      tx.locktime = parseInt(simpleTx.locktime);
      transactions.push(tx);
    });
    return transactions;
  };
}

Block.statics = {};

Block.statics.fromJSON = (json) => new Block(json);
