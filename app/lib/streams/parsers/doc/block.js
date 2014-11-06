var util          = require('util');
var sha1          = require('sha1');
var _             = require('underscore');
var GenericParser = require('./GenericParser');
var rawer         = require('../../../rawer');
var split         = require('../../../split');
var unix2dos      = require('../../../unix2dos');
var constants     = require('../../../constants');

module.exports = BlockParser;

function BlockParser (onError) {
  
  var captures = [
    {prop: "version",         regexp: constants.BLOCK.VERSION},
    {prop: "type",            regexp: constants.BLOCK.TYPE},
    {prop: "currency",        regexp: constants.BLOCK.CURRENCY},
    {prop: "nonce",           regexp: constants.BLOCK.NONCE},
    {prop: "number",          regexp: /Number: (.*)/},
    {prop: "date",            regexp: /Date: (.*)/},
    {prop: "confirmedDate",   regexp: /ConfirmedDate: (.*)/},
    {prop: "dividend",        regexp: /UniversalDividend: (.*)/},
    {prop: "issuer",          regexp: /Issuer: (.*)/},
    {prop: "previousHash",    regexp: constants.BLOCK.PREV_HASH},
    {prop: "previousIssuer",  regexp: constants.BLOCK.PREV_ISSUER},
    {prop: "membersCount",    regexp: /MembersCount: (.*)/},
    {prop: "identities",      regexp: /Identities:\n([\s\S]*)Joiners/,          parser: splitAndMatch('\n', constants.IDENTITY.INLINE)},
    {prop: "joiners",         regexp: /Joiners:\n([\s\S]*)Actives/,             parser: splitAndMatch('\n', constants.BLOCK.JOINER)},
    {prop: "actives",         regexp: /Actives:\n([\s\S]*)Leavers/,             parser: splitAndMatch('\n', constants.BLOCK.ACTIVE)},
    {prop: "leavers",         regexp: /Leavers:\n([\s\S]*)Excluded/,            parser: splitAndMatch('\n', constants.BLOCK.LEAVER)},
    {prop: "excluded",        regexp: /Excluded:\n([\s\S]*)Certifications/,     parser: splitAndMatch('\n', constants.PUBLIC_KEY)},
    {prop: "certifications",  regexp: /Certifications:\n([\s\S]*)Transactions/, parser: splitAndMatch('\n', constants.CERT.OTHER.INLINE)},
    {prop: "transactions",    regexp: /Transactions:\n([\s\S]*)/,               parser: extractTransactions}
  ];
  var multilineFields = [];
  GenericParser.call(this, captures, multilineFields, rawer.getBlock, onError);

  this._clean = function (obj) {
    obj.identities = obj.identities || [];
    obj.joiners = obj.joiners || [];
    obj.actives = obj.actives || [];
    obj.leavers = obj.leavers || [];
    obj.excluded = obj.excluded || [];
    obj.certifications = obj.certifications || [];
    obj.transactions = obj.transactions || [];
  };

  this._verify = function(obj){
    var err = null;
    var code = 150;
    var codes = {
      'BAD_VERSION': 150,
      'BAD_CURRENCY': 151,
      'BAD_NUMBER': 152,
      'BAD_TYPE': 153,
      'BAD_NONCE': 154,
      'BAD_RECIPIENT_OF_NONTRANSFERT': 155,
      'BAD_PREV_HASH_PRESENT': 156,
      'BAD_PREV_HASH_ABSENT': 157,
      'BAD_PREV_ISSUER_PRESENT': 158,
      'BAD_PREV_ISSUER_ABSENT': 159,
      'BAD_DIVIDEND': 160,
    }
    if(!err){
      // Version
      if(!obj.version || !obj.version.match(/^1$/))
        err = {code: codes['BAD_VERSION'], message: "Version unknown"};
    }
    if(!err){
      // Type
      if(!obj.type || !obj.type.match(/^Block$/))
        err = {code: codes['BAD_TYPE'], message: "Not a Block type"};
    }
    if(!err){
      // Nonce
      if(!obj.nonce || !obj.nonce.match(constants.INTEGER))
        err = {code: codes['BAD_NONCE'], message: "Nonce must be an integer value"};
    }
    if(!err){
      // Number
      if(!obj.number || !obj.number.match(constants.INTEGER))
        err = {code: codes['BAD_NUMBER'], message: "Incorrect Number field"};
    }
    if(!err){
      // Date
      if(!obj.date || !obj.date.match(constants.INTEGER))
        err = {code: codes['BAD_SENDER'], message: "Date must be an integer"};
    }
    if(!err){
      // ConfirmedDate
      if(!obj.confirmedDate || !obj.confirmedDate.match(constants.INTEGER))
        err = {code: codes['BAD_SENDER'], message: "ConfirmedDate must be an integer"};
    }
    if(!err){
      if(obj.dividend && !obj.dividend.match(constants.INTEGER))
        err = {code: codes['BAD_DIVIDEND'], message: "Incorrect UniversalDividend field"};
    }
    if(!err){
      if(!obj.issuer || !obj.issuer.match(constants.BASE58))
        err = {code: codes['BAD_ISSUER'], message: "Incorrect Issuer field"};
    }
    if(!err){
      // MembersCount
      if(!obj.nonce || !obj.nonce.match(constants.INTEGER))
        err = {code: codes['BAD_MEMBERS_COUNT'], message: "MembersCount must be an integer value"};
    }
    return err && err.message;
  };
}

function splitAndMatch (separator, regexp) {
  return function (raw) {
    var lines = raw.split(new RegExp(separator));
    var kept = [];
    lines.forEach(function(line){
      if (line.match(regexp))
        kept.push(line);
    });
    return kept;
  };
}

function extractTransactions(raw) {
  var transactions = [];
  var lines = raw.split(/\n/);
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    // On each header
    if (line.match(constants.TRANSACTION.HEADER)) {
      // Parse the transaction
      var currentTX = { raw: line + '\n' };
      var sp = line.split(':');
      var nbSignatories = parseInt(sp[2]);
      var nbInputs = parseInt(sp[3]);
      var nbOutputs = parseInt(sp[4]);
      var linesToExtract = {
        signatories: {
          start: 1,
          end: nbSignatories
        },
        inputs: {
          start: 1 + nbSignatories,
          end: nbSignatories + nbInputs
        },
        outputs: {
          start: 1 + nbSignatories + nbInputs,
          end: nbSignatories + nbInputs + nbOutputs
        },
        signatures: {
          start: 1 + nbSignatories + nbInputs + nbOutputs,
          end: 2*nbSignatories + nbInputs + nbOutputs
        },
      };
      ['signatories', 'inputs', 'outputs', 'signatures'].forEach(function(prop){
        for (var j = linesToExtract[prop].start; j <= linesToExtract[prop].end; j++) {
          currentTX.raw += lines[i + j] + '\n';
          currentTX[prop] = currentTX[prop] || [];
          currentTX[prop].push(lines[i + j]);
        }
      });
      transactions.push(currentTX)
      i = i + 2*nbSignatories + nbInputs + nbOutputs;
    } else {
      // Not a transaction header, stop reading
      i = lines.length;
    }
  }
  return transactions;
}

util.inherits(BlockParser, GenericParser);
