var GenericParser = require('./GenericParser');
var rawer         = require('../../../rawer');
var util          = require('util');
var sha1          = require('sha1');
var split         = require('../../../split');
var unix2dos      = require('../../../unix2dos');
var constants     = require('../../../constants');
var _             = require('underscore');

module.exports = MembershipParser;

function MembershipParser (onError) {
  
  var captures = [
    {prop: "version",           regexp: /Version: (.*)/},
    {prop: "currency",          regexp: /Currency: (.*)/},
    {prop: "issuer",            regexp: /Issuer: (.*)/},
    {prop: "membership",        regexp: /Membership: (.*)/},
    {prop: "userid",            regexp: /UserID: (.*)/},
    {prop: "certts",            regexp: /CertTS: (.*)/, parser: parseDateFromTimestamp},
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
      'BAD_ISSUER': 152,
      'BAD_MEMBERSHIP': 153,
      'BAD_REGISTRY_TYPE': 154,
      'BAD_DATE': 155,
      'BAD_USERID': 156,
      'BAD_CERTTS': 157
    }
    if(!err){
      if(!obj.version || !obj.version.match(/^1$/))
        err = {code: codes['BAD_VERSION'], message: "Version unknown"};
    }
    if(!err){
      if(obj.issuer && !obj.issuer.match(constants.BASE58))
        err = {code: codes['BAD_ISSUER'], message: "Incorrect issuer field"};
    }
    if(!err){
      if(obj.membership && !obj.membership.match(/^(IN|OUT)$/))
        err = {code: codes['BAD_MEMBERSHIP'], message: "Incorrect Membership field: must be either IN or OUT"};
    }
    if(!err){
      if(obj.date && (typeof obj == 'string' ? !obj.date.match(/^\d+$/) : obj.date.timestamp() <= 0))
        err = {code: codes['BAD_DATE'], message: "Incorrect Date field: must be a positive or zero integer"};
    }
    if(!err){
      if(obj.userid && !obj.userid.match(constants.UDID2_FORMAT))
        err = {code: codes['BAD_USERID'], message: "UserID must match udid2 format"};
    }
    if(!err){
      if(obj.certts && (typeof obj == 'string' ? !obj.certts.match(/^\d+$/) : obj.certts.timestamp() <= 0))
        err = {code: codes['BAD_CERTTS'], message: "CertTS must be a valid timestamp"};
    }
    return err && err.message;
  };
}

function parseDateFromTimestamp (value) {
  return new Date(parseInt(value)*1000);
}

util.inherits(MembershipParser, GenericParser);
