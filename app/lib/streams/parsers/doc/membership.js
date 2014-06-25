var GenericParser = require('./GenericParser');
var rawer         = require('../../../rawer');
var util          = require('util');
var sha1          = require('sha1');
var split         = require('../../../split');
var unix2dos      = require('../../../unix2dos');
var _             = require('underscore');

module.exports = MembershipParser;

function MembershipParser (onError) {
  
  var captures = [
    {prop: "version",           regexp: /Version: (.*)/},
    {prop: "currency",          regexp: /Currency: (.*)/},
    {prop: "type",              regexp: /Registry: (.*)/},
    {prop: "issuer",            regexp: /Issuer: (.*)/},
    {prop: "amNumber",          regexp: /AmendmentNumber: (.*)/},
    {prop: "amHash",            regexp: /AmendmentHash: (.*)/},
    {prop: "membership",        regexp: /Membership: (.*)/},
    {prop: "date",              regexp: /Date: (.*)/, parser: parseDateFromTimestamp}
  ];
  var multilineFields = [];
  GenericParser.call(this, captures, multilineFields, rawer.getMembership, onError);

  this._clean = function (obj) {
  };

  this._verify = function(obj){
    var err = null;
    var code = 150;
    var codes = {
      'BAD_VERSION': 150,
      'BAD_CURRENCY': 151,
      'BAD_FINGERPRINT': 152,
      'BAD_MEMBERSHIP': 153,
      'BAD_REGISTRY_TYPE': 154,
      'BAD_DATE': 155,
      'BAD_AM_NUMBER': 156,
      'BAD_AM_HASH': 157,
    }
    if(!err){
      // Version
      if(!obj.version || !obj.version.match(/^1$/))
        err = {code: codes['BAD_VERSION'], message: "Version unknown"};
    }
    if(!err){
      // Registry document type
      if(!obj.type || !obj.type.match("^MEMBERSHIP$"))
        err = {code: codes['BAD_REGISTRY_TYPE'], message: "Incorrect Registry field: must be MEMBERSHIP"};
    }
    if(!err){
      // Fingerprint
      if(obj.issuer && !obj.issuer.match(/^[A-Z\d]+$/))
        err = {code: codes['BAD_FINGERPRINT'], message: "Incorrect issuer field"};
    }
    if(!err){
      // AmendmentNumber
      if(!obj.amNumber || !obj.amNumber.match(/^\d+$/))
        err = {code: codes['BAD_AM_NUMBER'], message: "Incorrect AmendmentNumber field"};
    }
    if(!err){
      // AmendmentHash
      if(obj.amHash && !obj.amHash.match(/^[A-Z\d]+$/))
        err = {code: codes['BAD_AM_HASH'], message: "Incorrect AmendmentHash field"};
    }
    if(!err){
      // Membership
      if(obj.membership && !obj.membership.match(/^(IN|OUT)$/))
        err = {code: codes['BAD_MEMBERSHIP'], message: "Incorrect Membership field: must be either IN or OUT"};
    }
    if(!err){
      // Date
      if(obj.date && (typeof obj == 'string' ? !obj.date.match(/^\d+$/) : obj.date.timestamp() <= 0))
        err = {code: codes['BAD_DATE'], message: "Incorrect Date field: must be a positive or zero integer"};
    }
    return err && err.message;
  };
}

function parseDateFromTimestamp (value) {
  return new Date(parseInt(value)*1000);
}

util.inherits(MembershipParser, GenericParser);
