var GenericParser = require('./GenericParser');
var rawer         = require('../../../rawer');
var util          = require('util');
var sha1          = require('sha1');
var split         = require('../../../split');
var unix2dos      = require('../../../unix2dos');
var _             = require('underscore');

module.exports = VoteParser;

function VoteParser (onError) {
  
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
  GenericParser.call(this, captures, multilineFields, rawer.getVote, onError);

  this._clean = function (obj) {
    this.cleanAmendment(obj);
    restructurate(obj);
  };

  this.cleanAmendment = function (am) {
    am.membersChanges.splice(am.membersChanges.length - 1, 1);
    am.votersChanges.splice(am.votersChanges.length - 1, 1);
    if (am.coinList) {
      am.coinList = am.coinList.split(' ');
      am.coinList.forEach(function(cs, index){
        am.coinList[index] = parseInt(cs);
      });
    }
  }

  function restructurate (obj) {
    // Move structure into obj.amendment, BUT the signature & hash
    obj.amendment = {};
    _(_(obj).keys()).without('amendment', 'signature', 'hash').forEach(function(k){
      obj.amendment[k] = obj[k];
      delete obj[k];
    });
    obj.amendment.hash = sha1(rawer.getAmendment(obj.amendment)).toUpperCase();
  }

  this._verify = function(obj){
    var am = obj.amendment;
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
    };
    if(!err){
      // Version
      if(!am.version || !am.version.match(/^1$/))
        err = {code: codes['VERSION'], message: "Version unknown"};
    }
    if(!err){
      // Number
      if(!am.number || !am.number.match(/^\d+$/))
        err = {code: codes['NUMBER'], message: "Incorrect Number field"};
    }
    if(!err){
      // GeneratedOn
      if(!am.generated || !am.generated.match(/^\d+$/))
        err = {code: codes['GENERATEDON'], message: "GeneratedOn field must be a positive or zero integer"};
    }
    if(!err){
      // Universal Dividend
      if(am.dividend && !am.dividend.match(/^\d+$/))
        err = {code: codes['UD'], message: "UniversalDividend must be a positive or zero integer"};
      // Coin Base
      if(am.dividend && (!am.coinBase || !am.coinBase.match(/^\d+$/)))
        err = {code: codes['COIN_BASE'], message: "CoinBase must be a positive or zero integer"};
      // Coin List
      if(am.dividend && (!am.coinList || !am.coinList.join(' ').match(/^(\d+ )*\d+$/)))
        err = {code: codes['COIN_LIST'], message: "CoinList must be a space separated list of positive or zero integers"};
      else if(am.dividend) {
        var dividendSum = 0;
        var power = parseInt(am.coinBase);
        am.coinList.forEach(function(c){
          dividendSum += parseInt(c) * Math.pow(2, power++);
        });
        if (parseInt(am.dividend) != dividendSum) {
          err = {code: codes['COIN_SUM'], message: "CoinList sum '" + dividendSum + "' does not match UniversalDividend '" + am.dividend + "'"};
        }
      }
    }
    if(!err){
      // NextRequiredVotes
      if(am.nextVotes && !am.nextVotes.match(/^\d+$/))
        err = {code: codes['NEXT_VOTES'], message: "NextRequiredVotes must be a positive or zero integer"};
    }
    if(!err){
      // Previous hash
      var isRoot = parseInt(am.number, 10) === 0;
      if(!isRoot && (!am.previousHash || !am.previousHash.match(/^[A-Z\d]{40}$/)))
        err = {code: codes['PREV_HASH'], message: "PreviousHash must be provided for non-root amendment and match an uppercase SHA1 hash"};
      else if(isRoot && am.previousHash)
        err = {code: codes['PREV_HASH'], message: "PreviousHash must not be provided for root amendment"};
    }
    if(!err){
      // VotersRoot
      if(am.previousHash && (!am.votersRoot || !am.votersRoot.match(/^[A-Z\d]{40}$/)))
        err = {code: codes['VOTERS_ROOT'], message: "VotersRoot must be provided and match an uppercase SHA1 hash"};
    }
    if(!err){
      // VotersCount
      if(am.previousHash && (!am.votersCount || !am.votersCount.match(/^\d+$/)))
        err = {code: codes['VOTERS_COUNT'], message: "VotersCount must be a positive or zero integer"};
    }
    if(!err){
      // MembersRoot
      if(!am.membersRoot || !am.membersRoot.match(/^[A-Z\d]{40}$/))
        err = {code: codes['MEMBERS_ROOT'], message: "MembersRoot must be provided and match an uppercase SHA1 hash"};
    }
    if(!err){
      // MembersCount
      if(!am.membersCount || !am.membersCount.match(/^\d+$/))
        err = {code: codes['MEMBERS_COUNT'], message: "MembersCount must be a positive or zero integer"};
    }
    return err && err.message;
  };
}

util.inherits(VoteParser, GenericParser);
