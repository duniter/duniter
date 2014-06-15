var GenericParser = require('./GenericParser');
var rawer         = require('../../../rawer');
var util          = require('util');
var sha1          = require('sha1');
var split         = require('../../../split');
var unix2dos      = require('../../../unix2dos');
var _             = require('underscore');

module.exports = CommunityFlowParser;

function CommunityFlowParser (onError) {
  
  var captures = [
    {prop: "version",             regexp: /Version: (.*)/},
    {prop: "currency",            regexp: /Currency: (.*)/},
    {prop: "amendmentNumber",     regexp: /Amendment: (.*)/, parser: parseAmendmentNumber},
    {prop: "amendmentHash",       regexp: /Amendment: (.*)/, parser: parseAmendmentHash},
    {prop: "algorithm",           regexp: /Algorithm: (.*)/},
    {prop: "membersJoiningCount", regexp: /MembersJoining: (.*)/, parser: parseMerkleNumber},
    {prop: "membersJoiningRoot",  regexp: /MembersJoining: (.*)/, parser: parseMerkleRoot},
    {prop: "membersLeavingCount", regexp: /MembersLeaving: (.*)/, parser: parseMerkleNumber},
    {prop: "membersLeavingRoot",  regexp: /MembersLeaving: (.*)/, parser: parseMerkleRoot},
    {prop: "votersJoiningCount",  regexp: /VotersJoining: (.*)/, parser: parseMerkleNumber},
    {prop: "votersJoiningRoot",   regexp: /VotersJoining: (.*)/, parser: parseMerkleRoot},
    {prop: "votersLeavingCount",  regexp: /VotersLeaving: (.*)/, parser: parseMerkleNumber},
    {prop: "votersLeavingRoot",   regexp: /VotersLeaving: (.*)/, parser: parseMerkleRoot},
    {prop: "issuer",              regexp: /Issuer: (.*)/},
    {prop: "date",                regexp: /Date: (.*)/, parser: parseDateFromTimestamp}
  ];
  var multilineFields = [];
  GenericParser.call(this, captures, multilineFields, rawer.getCommunityFlow, onError);

  this._clean = function (obj) {
  };

  this._verify = function(obj){
    var err = null;
    var code = 150;
    var codes = {
      'BAD_VERSION': 150,
      'BAD_CURRENCY': 151,
      'BAD_FINGERPRINT': 152,
      'BAD_THRESHOLD': 153,
      'BAD_AM_NUMBER': 154,
      'BAD_AM_HASH': 155,
      'BAD_MERKLE_SUMMARY': 156,
    }
    if(!err){
      // Version
      if(!obj.version || !obj.version.match(/^1$/))
        err = {code: codes['BAD_VERSION'], message: "Version unknown"};
    }
    if(!err){
      // Fingerprint
      if(obj.issuer && !obj.issuer.match(/^[A-Z\d]+$/))
        err = {code: codes['BAD_FINGERPRINT'], message: "Incorrect issuer field"};
    }
    if(!err){
      // Date
      if(obj.date && (typeof obj == 'string' ? !obj.date.match(/^\d+$/) : obj.date.timestamp() <= 0))
        err = {code: codes['BAD_DATE'], message: "Incorrect Date field: must be a positive or zero integer"};
    }
    if(!err){
      // Amendment
      if(!err && !obj.amendmentHash.match(/^[A-Z\d]+$/))
        err = {code: codes['BAD_FIELD'], message: "Incorrect amendment field: must be contain an amendment"};
    }
    ['membersJoiningRoot', 'membersLeavingRoot', 'votersJoiningRoot', 'votersLeavingRoot'].forEach(function(field){
      if(!err && !obj[field].match(/^[A-Z\d]+$/))
        err = {code: codes['BAD_MERKLE_SUMMARY'], message: "Incorrect " + field + " field: must be a SHA-1 uppercased hash"};
    });
    return err && err.message;
  };
}

function parseDateFromTimestamp (value) {
  if (value && value.match(/^\d+$/))
    return new Date(parseInt(value)*1000);
  else
    return new Date();
}

function parseAmendmentNumber (value) {
  var m = value.match(/^(\d+)-([A-Z\d]+)$/);
  if (m)
    return m[1];
  else
    return 0;
}

function parseAmendmentHash (value) {
  var m = value.match(/^(\d+)-([A-Z\d]+)$/);
  if (m)
    return m[2];
  else
    return "";
}

var parseMerkleNumber = parseAmendmentNumber;
var parseMerkleRoot = parseAmendmentHash;

util.inherits(CommunityFlowParser, GenericParser);
