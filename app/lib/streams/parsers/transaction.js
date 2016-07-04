"use strict";
const GenericParser = require('./GenericParser');
const rawer         = require('../../ucp/rawer');
const constants     = require('../../constants');
const util          = require('util');

module.exports = TransactionParser;

function TransactionParser (onError) {

  const captures = [
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
  const multilineFields = [];
  GenericParser.call(this, captures, multilineFields, rawer.getTransaction, onError);

  this._clean = (obj) => {
    obj.documentType = 'transaction';
    obj.comment = obj.comment || "";
    obj.locktime = parseInt(obj.locktime) || 0;
    obj.signatures.push(obj.signature)
  };

  this._verify = (obj) => {
    let err = null;
    const codes = {
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
  const issuers = [];
  const lines = raw.split(/\n/);
  for (const line of lines) {
    if (line.match(constants.TRANSACTION.SENDER)) {
      issuers.push(line);
    } else {
      // Not a pubkey, stop reading
      break;
    }
  }
  return issuers;
}

function extractInputs(raw) {
  const inputs = [];
  const lines = raw.split(/\n/);
  for (const line of lines) {
    if (line.match(constants.TRANSACTION.SOURCE)) {
      inputs.push(line);
    } else {
      // Not a transaction input, stop reading
      break;
    }
  }
  return inputs;
}

function extractUnlocks(raw) {
  const unlocks = [];
  const lines = raw.split(/\n/);
  for (const line of lines) {
    if (line.match(constants.TRANSACTION.UNLOCK)) {
      unlocks.push(line);
    } else {
      // Not a transaction unlock, stop reading
      break;
    }
  }
  return unlocks;
}

function extractOutputs(raw) {
  const outputs = [];
  const lines = raw.split(/\n/);
  for (const line of lines) {
    if (line.match(constants.TRANSACTION.TARGET)) {
      outputs.push(line);
    } else {
      // Not a transaction input, stop reading
      break;
    }
  }
  return outputs;
}

function extractSignatures(raw) {
  const signatures = [];
  const lines = raw.split(/\n/);
  for (const line of lines) {
    if (line.match(constants.SIG)) {
      signatures.push(line);
    }
  }
  return signatures;
}

util.inherits(TransactionParser, GenericParser);
