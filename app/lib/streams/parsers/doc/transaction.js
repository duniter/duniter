var GenericParser = require('./GenericParser');
var rawer         = require('../../../rawer');
var constants     = require('../../../constants');
var util          = require('util');
var sha1          = require('sha1');
var split         = require('../../../split');
var unix2dos      = require('../../../unix2dos');
var _             = require('underscore');

module.exports = TransactionParser;

function TransactionParser (onError) {
  
  var captures = [
    {prop: "version",    regexp: /Version: (.*)/},
    {prop: "currency",   regexp: /Currency: (.*)/},
    {prop: "issuers",    regexp: /Issuers:\n([\s\S]*)Inputs/, parser: extractIssuers },
    {prop: "inputs",     regexp: /Inputs:\n([\s\S]*)Outputs/, parser: extractInputs },
    {prop: "outputs",    regexp: /Outputs:\n([\s\S]*)/,       parser: extractOutputs },
    {prop: "signatures", regexp: /Outputs:\n([\s\S]*)/,       parser: extractSignatures }
  ];
  var multilineFields = [];
  GenericParser.call(this, captures, multilineFields, rawer.getTransaction, onError);

  this._clean = function (obj) {
    obj.coins = obj.coins || [];
  };

  this._verify = function(obj){
    var err = null;
    var code = 150;
    var codes = {
      'BAD_VERSION': 150
    }
    if(!err){
      // Version
      if(!obj.version || !obj.version.match(/^1$/))
        err = {code: codes['BAD_VERSION'], message: "Version unknown"};
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
      issuers.push(line)
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
      inputs.push(line)
    } else {
      // Not a transaction input, stop reading
      i = lines.length;
    }
  }
  return inputs;
}

function extractOutputs(raw) {
  var outputs = [];
  var lines = raw.split(/\n/);
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    if (line.match(constants.TRANSACTION.TARGET)) {
      outputs.push(line)
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
      signatures.push(line)
    }
  }
  return signatures;
}

util.inherits(TransactionParser, GenericParser);
