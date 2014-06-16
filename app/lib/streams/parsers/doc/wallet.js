var GenericParser = require('./GenericParser');
var rawer         = require('../../../rawer');
var util          = require('util');
var sha1          = require('sha1');
var split         = require('../../../split');
var unix2dos      = require('../../../unix2dos');
var _             = require('underscore');

module.exports = WalletParser;

function WalletParser (onError) {
  
  var captures = [
    {prop: "version",           regexp: /Version: (.*)/},
    {prop: "currency",          regexp: /Currency: (.*)/},
    {prop: "fingerprint",       regexp: /Key: (.*)/},
    {prop: "date",              regexp: /Date: (.*)/, parser: parseDateFromTimestamp},
    {prop: "requiredTrusts",    regexp: /RequiredTrusts: (.*)/},
    {prop: "hosters",           regexp: /Hosters:\n([\s\S]*)Trusts/, parser: split('\n')},
    {prop: "trusts",            regexp: /Trusts:\n([\s\S]*)/, parser: split('\n')}
  ];
  var multilineFields = [];
  GenericParser.call(this, captures, multilineFields, rawer.getWallet, onError);

  this._clean = function (obj) {
    obj.hosters = obj.hosters || [];
    if (obj.hosters.length > 0)
      obj.hosters.splice(obj.hosters.length - 1, 1);
    obj.trusts = obj.trusts || [];
    if (obj.trusts.length > 0)
      obj.trusts.splice(obj.trusts.length - 1, 1);
  };

  this._verify = function(obj){
    var err = null;
    var code = 150;
    var codes = {
      'BAD_VERSION': 150,
      'BAD_CURRENCY': 151,
      'BAD_FINGERPRINT': 152,
      'BAD_THRESHOLD': 153,
      'BAD_DATE': 154,
    }
    if(!err){
      // Version
      if(!obj.version || !obj.version.match(/^1$/))
        err = {code: codes['BAD_VERSION'], message: "Version unknown"};
    }
    if(!err){
      // Fingerprint
      if(obj.fingerprint && !obj.fingerprint.match(/^[A-Z\d]+$/))
        err = {code: codes['BAD_FINGERPRINT'], message: "Incorrect fingerprint field"};
    }
    if(!err){
      // Date
      if(obj.date && (typeof obj == 'string' ? !obj.date.match(/^\d+$/) : obj.date.timestamp() <= 0))
        err = {code: codes['BAD_DATE'], message: "Incorrect Date field: must be a positive or zero integer"};
    }
    if(!err){
      // RequiredTrusts
      if(obj.requiredTrusts && (typeof obj == 'string' ? !obj.requiredTrusts.match(/^\d+$/) : obj.requiredTrusts < 0))
        err = {code: codes['BAD_THRESHOLD'], message: "Incorrect RequiredTrusts field: must be a positive or zero integer"};
    }
    return err && err.message;
  };

  function parseDateFromTimestamp (value) {
    if (value && value.match(/^\d+$/))
      return new Date(parseInt(value)*1000);
    else
      return new Date();
  }
}

util.inherits(WalletParser, GenericParser);
