var GenericParser = require('./GenericParser');
var util          = require('util');
var split         = require('../../../split');
var rawer         = require('../../../rawer');

module.exports = AmendmentParser;

function AmendmentParser (onError) {
  
  var captures = [
    {prop: "version",           regexp: /Version: (.*)/},
    {prop: "currency",          regexp: /Currency: (.*)/},
    {prop: "number",            regexp: /Number: (.*)/},
    {prop: "generated",         regexp: /GeneratedOn: (.*)/},
    {prop: "dividend",          regexp: /UniversalDividend: (.*)/},
    {prop: "coinBase",          regexp: /CoinBase: (.*)/},
    {prop: "coinList",          regexp: /CoinList: (.*)/},
    {prop: "coinAlgo",          regexp: /CoinAlgo: (.*)/},
    {prop: "nextVotes",         regexp: /NextRequiredVotes: (.*)/},
    {prop: "previousHash",      regexp: /PreviousHash: (.*)/},
    {prop: "membersRoot",       regexp: /MembersRoot: (.*)/},
    {prop: "membersCount",      regexp: /MembersCount: (.*)/},
    {prop: "membersChanges",    regexp: /MembersChanges:\n([\s\S]*)VotersRoot/, parser: split("\n")},
    {prop: "votersRoot",        regexp: /VotersRoot: (.*)/},
    {prop: "votersCount",       regexp: /VotersCount: (.*)/},
    {prop: "votersChanges",     regexp: /VotersChanges:\n([\s\S]*)/, parser: split("\n")},
  ];
  var multilineFields = ["membersChanges", "votersChanges"];
  GenericParser.call(this, {}, captures, multilineFields, rawer.getAmendment, onError);

  this._clean = function (obj) {
    obj.membersChanges.splice(obj.membersChanges.length - 1, 1);
    obj.votersChanges.splice(obj.votersChanges.length - 1, 1);
    if (obj.coinList) {
      obj.coinList = obj.coinList.split(' ');
      obj.coinList.forEach(function(cs, index){
        obj.coinList[index] = parseInt(cs);
      });
    }
  };

  this.verify = function(obj){
    var err = null;
    var codes = {
      'VERSION': 150,
      'CURRENCY': 151,
      'NUMBER': 152,
      'GENERATEDON': 153,
      'UD': 154,
      'NEXT_VOTES': 156,
      'PREV_HASH': 157,
      'MEMBERS_ROOT': 160,
      'MEMBERS_COUNT': 161,
      'MEMBERS_CHANGES': 162,
      'VOTERS_ROOT': 160,
      'VOTERS_COUNT': 161,
      'VOTERS_CHANGES': 162,
      'COIN_BASE': 173,
      'COIN_LIST': 174,
      'COIN_SUM': 175
    }
    if(!err){
      // Version
      if(!obj.version || !obj.version.match(/^1$/))
        err = {code: codes['VERSION'], message: "Version unknown"};
    }
    if(!err){
      // Number
      if(!obj.number || !obj.number.match(/^\d+$/))
        err = {code: codes['NUMBER'], message: "Incorrect Number field"};
    }
    if(!err){
      // GeneratedOn
      if(!obj.generated || !obj.generated.match(/^\d+$/))
        err = {code: codes['GENERATEDON'], message: "GeneratedOn field must be a positive or zero integer"};
    }
    if(!err){
      // Universal Dividend
      if(obj.dividend && !obj.dividend.match(/^\d+$/))
        err = {code: codes['UD'], message: "UniversalDividend must be a positive or zero integer"};
      // Coin Base
      if(obj.dividend && (!obj.coinBase || !obj.coinBase.match(/^\d+$/)))
        err = {code: codes['COIN_BASE'], message: "CoinBase must be a positive or zero integer"};
      // Coin List
      if(obj.dividend && (!obj.coinList || !obj.coinList.join(' ').match(/^(\d+ )*\d+$/)))
        err = {code: codes['COIN_LIST'], message: "CoinList must be a space separated list of positive or zero integers"};
      else if(obj.dividend) {
        var dividendSum = 0;
        var power = parseInt(obj.coinBase);
        obj.coinList.forEach(function(c){
          dividendSum += parseInt(c) * Math.pow(2, power++);
        });
        if (parseInt(obj.dividend) != dividendSum) {
          err = {code: codes['COIN_SUM'], message: "CoinList sum '" + dividendSum + "' does not match UniversalDividend '" + obj.dividend + "'"};
        }
      }
    }
    if(!err){
      // NextRequiredVotes
      if(obj.nextVotes && !obj.nextVotes.match(/^\d+$/))
        err = {code: codes['NEXT_VOTES'], message: "NextRequiredVotes must be a positive or zero integer"};
    }
    if(!err){
      // Previous hash
      var isRoot = parseInt(obj.number, 10) === 0;
      if(!isRoot && (!obj.previousHash || !obj.previousHash.match(/^[A-Z\d]{40}$/)))
        err = {code: codes['PREV_HASH'], message: "PreviousHash must be provided for non-root amendment and match an uppercase SHA1 hash"};
      else if(isRoot && obj.previousHash)
        err = {code: codes['PREV_HASH'], message: "PreviousHash must not be provided for root amendment"};
    }
    if(!err){
      // VotersRoot
      if(obj.previousHash && (!obj.votersRoot || !obj.votersRoot.match(/^[A-Z\d]{40}$/)))
        err = {code: codes['VOTERS_ROOT'], message: "VotersRoot must be provided and match an uppercase SHA1 hash"};
    }
    if(!err){
      // VotersCount
      if(obj.previousHash && (!obj.votersCount || !obj.votersCount.match(/^\d+$/)))
        err = {code: codes['VOTERS_COUNT'], message: "VotersCount must be a positive or zero integer"};
    }
    if(!err){
      // MembersRoot
      if(!obj.membersRoot || !obj.membersRoot.match(/^[A-Z\d]{40}$/))
        err = {code: codes['MEMBERS_ROOT'], message: "MembersRoot must be provided and match an uppercase SHA1 hash"};
    }
    if(!err){
      // MembersCount
      if(!obj.membersCount || !obj.membersCount.match(/^\d+$/))
        err = {code: codes['MEMBERS_COUNT'], message: "MembersCount must be a positive or zero integer"};
    }
    return err && err.message;
  };
}

util.inherits(AmendmentParser, GenericParser);
