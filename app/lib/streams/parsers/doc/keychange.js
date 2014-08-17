var GenericParser = require('./GenericParser');
var rawer         = require('../../../rawer');
var util          = require('util');
var sha1          = require('sha1');
var split         = require('../../../split');
var unix2dos      = require('../../../unix2dos');
var _             = require('underscore');

module.exports = KeychangeParser;

function KeychangeParser (onError) {
  
  var captures = [
    {prop: "type",            regexp: /#####----([FNULB]):[A-Z0-9]{40}----#####/},
    {prop: "fingerprint",     regexp: /#####----[FNULB]:([A-Z0-9]{40})----#####/},
    {prop: "keypackets",      regexp: /KeyPackets:\n([\s\S]*).+:/, parser: extractBase64Lines},
    {prop: "certpackets",     regexp: /CertificationPackets:\n([\s\S]*)(Membership)?/,            parser: extractBase64Lines},
    {prop: "membership",      regexp: /Membership:\n([\s\S]*)/,                                   parser: extractMembership},
  ];
  var multilineFields = [];
  GenericParser.call(this, captures, multilineFields, rawer.getKeychange, onError);

  this._clean = function (obj) {
    if (obj.keypackets == undefined) obj.keypackets = '';
    if (obj.certpackets == undefined) obj.certpackets = '';
  };

  this._verify = function(obj){
    var err = null;
    var code = 150;
    var codes = {
      'BAD_TYPE': 150,
      'BAD_FINGERPRINT': 151
    }
    if(!err){
      // Type
      if(!obj.type || !obj.type.match(/^(F|N|U|L|B)$/))
        err = {code: codes['BAD_TYPE'], message: "Type must be either F,N,U,L or B"};
    }
    if(!err){
      // Fingerprint
      if(!obj.fingerprint || !obj.fingerprint.match(/^[A-Z\d]{40}$/))
        err = {code: codes['BAD_FINGERPRINT'], message: "Fingerprint must match an uppercased SHA-1 hash"};
    }
    return err && err.message;
  };
}

function extractBase64Lines(raw) {
  var validLines = "";
  var lines = raw.split(/\n/);
  lines.forEach(function(line){
    if (line.match(/^[A-Za-z0-9\/+=]{1,64}$/)) {
      validLines += line + '\n';
    }
  });
  return validLines;
}

function extractMembership(raw) {
  var splits = raw ? raw.split(/\n/) : [""];
  var inlineMS = splits[0];
  var lines = splits.slice(1, splits.length - 1);
  var validLines = "";
  lines.forEach(function(line){
    if (line.match(/^[A-Za-z0-9\/+=]{1,64}$/)) {
      validLines += line + '\n';
    }
  });
  return { membership: inlineMS, signature: validLines };
}

util.inherits(KeychangeParser, GenericParser);
