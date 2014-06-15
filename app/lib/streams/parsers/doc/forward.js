var GenericParser = require('./GenericParser');
var rawer         = require('../../../rawer');
var util          = require('util');
var sha1          = require('sha1');
var split         = require('../../../split');
var unix2dos      = require('../../../unix2dos');
var _             = require('underscore');

module.exports = ForwardParser;

function ForwardParser (onError) {
  
  var captures = [
    {prop: "version",           regexp: /Version: (.*)/},
    {prop: "currency",          regexp: /Currency: (.*)/},
    {prop: "from",              regexp: /From: (.*)/},
    {prop: "to",                regexp: /To: (.*)/},
    {prop: "forward",           regexp: /Forward: (.*)/},
    {prop: "keys",              regexp: /Keys:\n([\s\S]*)/, parser: split('\n')}
  ];
  var multilineFields = [];
  GenericParser.call(this, captures, multilineFields, rawer.getForward, onError);

  this._clean = function (obj) {
    if (obj.keys && obj.keys.length > 0)
      obj.keys.splice(obj.keys.length - 1, 1);
  };

  this._verify = function(obj){
    var err = null;
    var code = 150;
    var codes = {
      'BAD_VERSION': 150,
      'BAD_CURRENCY': 151,
      'BAD_FINGERPRINT': 152,
      'BAD_FORWARD': 156,
      'BAD_KEYS': 157
    }
    if(!err){
      // Version
      if(!obj.version || !obj.version.match(/^1$/))
        err = {code: codes['BAD_VERSION'], message: "Version unknown"};
    }
    if(!err){
      // From
      if(obj.from && !obj.from.match(/^[A-Z\d]+$/))
        err = {code: codes['BAD_FINGERPRINT'], message: "Incorrect From field"};
    }
    if(!err){
      // To
      if(obj.to && !obj.to.match(/^[A-Z\d]+$/))
        err = {code: codes['BAD_FINGERPRINT'], message: "Incorrect To field"};
    }
    if(!err){
      // Forward
      if(!obj.forward || !obj.forward.match(/^(ALL|KEYS)$/))
        err = {code: codes['BAD_FORWARD'], message: "Forward must be provided and match either ALL or KEYS string"};
    }
    return err && err.message;
  };
}

util.inherits(ForwardParser, GenericParser);
