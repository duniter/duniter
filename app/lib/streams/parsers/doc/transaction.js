var GenericParser = require('./GenericParser');
var rawer         = require('../../../rawer');
var util          = require('util');
var sha1          = require('sha1');
var split         = require('../../../split');
var unix2dos      = require('../../../unix2dos');
var _             = require('underscore');

module.exports = TransactionParser;

function TransactionParser (onError) {
  
  var captures = [
    {prop: "version",           regexp: /Version: (.*)/},
    {prop: "currency",          regexp: /Currency: (.*)/},
    {prop: "sender",            regexp: /Sender: (.*)/},
    {prop: "number",            regexp: /Number: (.*)/},
    {prop: "previousHash",      regexp: /PreviousHash: (.*)/},
    {prop: "recipient",         regexp: /Recipient: (.*)/},
    {prop: "coins",             regexp: /Coins:\n([\s\S]*)Comment/, parser: extractCoins},
    {prop: "comment",           regexp: /Comment:\n([\s\S]*)/}
  ];
  var multilineFields = [];
  GenericParser.call(this, captures, multilineFields, rawer.getTransaction, onError);

  this._clean = function (obj) {
  };

  this._verify = function(obj){
    var err = null;
    var code = 150;
    var codes = {
      'BAD_VERSION': 150,
      'BAD_CURRENCY': 151,
      'BAD_NUMBER': 152,
      'BAD_SENDER': 153,
      'BAD_RECIPIENT': 154,
      'BAD_RECIPIENT_OF_NONTRANSFERT': 155,
      'BAD_PREV_HASH_PRESENT': 156,
      'BAD_PREV_HASH_ABSENT': 157,
      'BAD_TX_NEEDONECOIN': 159,
      'BAD_TX_NULL': 160,
      'BAD_TX_NOTNULL': 161,
      'BAD_COINS_OF_VARIOUS_AM': 164,
      'BAD_CHANGE_COIN': 165,
      'BAD_CHANGE_SUM': 166
    }
    if(!err){
      // Version
      if(!obj.version || !obj.version.match(/^1$/))
        err = {code: codes['BAD_VERSION'], message: "Version unknown"};
    }
    if(!err){
      // Number
      if(!obj.number || !obj.number.match(/^\d+$/))
        err = {code: codes['BAD_NUMBER'], message: "Incorrect Number field"};
    }
    if(!err){
      // Sender
      if(!obj.sender || !obj.sender.match(/^[A-Z\d]{40}$/))
        err = {code: codes['BAD_SENDER'], message: "Sender must be provided and match an uppercase SHA1 hash"};
    }
    if(!err){
      // Recipient
      if(!obj.recipient || !obj.recipient.match(/^[A-Z\d]{40}$/))
        err = {code: codes['BAD_RECIPIENT'], message: "Recipient must be provided and match an uppercase SHA1 hash"};
    }
    if(!err){
      // Previous hash
      var isRoot = parseInt(obj.number, 10) === 0;
      if(!isRoot && (!obj.previousHash || !obj.previousHash.match(/^[A-Z\d]{40}$/)))
        err = {code: codes['BAD_PREV_HASH_ABSENT'], message: "PreviousHash must be provided for non-root transactions and match an uppercase SHA1 hash"};
      else if(isRoot && obj.previousHash)
        err = {code: codes['BAD_PREV_HASH_PRESENT'], message: "PreviousHash must not be provided for root transactions"};
    }
    if(!err){
      // Coins
      if(obj.coins.length == 0){
        err = {code: codes['BAD_TX_NEEDONECOIN'], message: "Transaction requires at least one coin"};
      }
    }
    return err && err.message;
  };
}

function extractCoins(rawCoins) {
  var coins = [];
  var lines = rawCoins.split(/\n/);
  if(lines[lines.length - 1].match(/^$/)){
    for (var i = 0; i < lines.length - 1; i++) {
      var line = lines[i];
      var match = line.match(/([A-Z\d]{40})-(\d+)-(\d+)(:([A-Z\d]{40})-(\d+))?/);
      if(match && match.length == 7){
        coins.push(line);
      }
    }
  }
  return coins;
}

util.inherits(TransactionParser, GenericParser);
