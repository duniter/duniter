"use strict";
var GenericParser = require('./GenericParser');
var rawer         = require('../../ucp/rawer');
var constants     = require('../../constants');
var util          = require('util');

module.exports = TransactionParser;

function TransactionParser (onError) {
  
  var captures = [
    {prop: "version",    regexp: /Version: (.*)/},
    {prop: "currency",   regexp: /Currency: (.*)/},
    {prop: "issuers",    regexp: /Issuers:\n([\s\S]*)Inputs/, parser: extractIssuers },
    {prop: "inputs",     regexp: /Inputs:\n([\s\S]*)Unlocks/, parser: extractInputs },
    {prop: "unlocks",    regexp: /Unlocks:\n([\s\S]*)Outputs/,parser: extractUnlocks },
    {prop: "outputs",    regexp: /Outputs:\n([\s\S]*)/,       parser: extractOutputs },
    {prop: "comment",    regexp: constants.TRANSACTION.COMMENT },
    {prop: "locktime",   regexp: constants.TRANSACTION.LOCKTIME },
    {prop: "signatures", regexp: /Outputs:\n([\s\S]*)/,       parser: extractSignatures }
  ];
  var multilineFields = [];
  GenericParser.call(this, captures, multilineFields, rawer.getTransaction, onError);

  this._clean = function (obj) {
    obj.documentType = 'transaction';
    obj.comment = obj.comment || "";
    obj.locktime = parseInt(obj.locktime) || 0;
    obj.signatures.push(obj.signature)
  };

  this._verify = function(obj){
    var err = null;
    var codes = {
      'BAD_VERSION': 150
    };
    if(!err){
      // Version
      if(!obj.version || !obj.version.match(constants.DOCUMENTS_VERSION_REGEXP))
        err = {code: codes.BAD_VERSION, message: "Version unknown"};
    }
    return err && err.message;
  };
}

function extractIssuers(raw) {
  var issuers = [];
  var lines = raw.split(/\n/);
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    if (line.match(constants.TRANSACTION.SENDER)) {
      issuers.push(line);
    } else {
      // Not a pubkey, stop reading
      i = lines.length;
    }
  }
  return issuers;
}

function extractInputs(raw) {
  var inputs = [];
  var lines = raw.split(/\n/);
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    if (line.match(constants.TRANSACTION.SOURCE)) {
      inputs.push(line);
    } else {
      // Not a transaction input, stop reading
      i = lines.length;
    }
  }
  return inputs;
}

function extractUnlocks(raw) {
  var unlocks = [];
  var lines = raw.split(/\n/);
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    if (line.match(constants.TRANSACTION.UNLOCK)) {
      unlocks.push(line);
    } else {
      // Not a transaction unlock, stop reading
      i = lines.length;
    }
  }
  return unlocks;
}

function extractOutputs(raw) {
  var outputs = [];
  var lines = raw.split(/\n/);
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    if (line.match(constants.TRANSACTION.TARGET)) {
      outputs.push(line);
    } else {
      // Not a transaction input, stop reading
      i = lines.length;
    }
  }
  return outputs;
}

function extractSignatures(raw) {
  var signatures = [];
  var lines = raw.split(/\n/);
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    if (line.match(constants.SIG)) {
      signatures.push(line);
    }
  }
  return signatures;
}

util.inherits(TransactionParser, GenericParser);
