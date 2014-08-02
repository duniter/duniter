var GenericParser = require('./GenericParser');
var rawer         = require('../../../rawer');
var util          = require('util');
var sha1          = require('sha1');
var split         = require('../../../split');
var unix2dos      = require('../../../unix2dos');
var _             = require('underscore');

module.exports = KeyblockParser;

function KeyblockParser (onError) {
  
  var captures = [
    {prop: "version",         regexp: /Version: (.*)/},
    {prop: "type",            regexp: /Type: (.*)/},
    {prop: "currency",        regexp: /Currency: (.*)/},
    {prop: "nonce",           regexp: /Nonce: (.*)/},
    {prop: "number",          regexp: /Number: (.*)/},
    {prop: "timestamp",       regexp: /Timestamp: (.*)/},
    {prop: "previousHash",    regexp: /PreviousHash: (.*)/},
    {prop: "previousIssuer",  regexp: /PreviousIssuer: (.*)/},
    {prop: "membersCount",    regexp: /MembersCount: (.*)/},
    {prop: "membersRoot",     regexp: /MembersRoot: (.*)/},
    {prop: "membersChanges",  regexp: /MembersChanges:\n([\s\S]*)PublicKeys/,         parser: split("\n")},
    {prop: "publicKeys",      regexp: /PublicKeys:\n([\s\S]*)Memberships/,            parser: extractFingerprintSeparatedPackets},
    {prop: "memberships",     regexp: /Memberships:\n([\s\S]*)MembershipsSignatures/, parser: split("\n")},
    {prop: "membershipsSigs", regexp: /MembershipsSignatures:\n([\s\S]*)/,            parser: extractFingerprintSeparatedPackets},
  ];
  var multilineFields = [];
  GenericParser.call(this, captures, multilineFields, rawer.getKeyblock, onError);

  this._clean = function (obj) {
    ['membersChanges', 'memberships'].forEach(function(field){
      obj[field] = obj[field] || [];
      if (obj[field].length > 0)
        obj[field].splice(obj[field].length - 1, 1);
    });
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
      'BAD_MEMBERS_ROOT': 160,
    }
    if(!err){
      // Version
      if(!obj.version || !obj.version.match(/^1$/))
        err = {code: codes['BAD_VERSION'], message: "Version unknown"};
    }
    if(!err){
      // Type
      if(!obj.type || !obj.type.match(/^KeyBlock$/))
        err = {code: codes['BAD_TYPE'], message: "Not a keyblock type"};
    }
    if(!err){
      // Nonce
      if(!obj.nonce || !obj.nonce.match(/^\d+$/))
        err = {code: codes['BAD_NONCE'], message: "Nonce must be an integer value"};
    }
    if(!err){
      // MembersCount
      if(!obj.nonce || !obj.nonce.match(/^\d+$/))
        err = {code: codes['BAD_MEMBERS_COUNT'], message: "MembersCount must be an integer value"};
    }
    if(!err){
      // Number
      if(!obj.number || !obj.number.match(/^\d+$/))
        err = {code: codes['BAD_NUMBER'], message: "Incorrect Number field"};
    }
    if(!err){
      // Timestamp
      if(!obj.timestamp || !obj.timestamp.match(/^\d+$/))
        err = {code: codes['BAD_SENDER'], message: "Timestamp must be an integer"};
    }
    if(!err){
      // MembersRoot
      var isRoot = parseInt(obj.number, 10) === 0;
      if(!isRoot && (!obj.membersRoot || !obj.membersRoot.match(/^[A-Z\d]{40}$/)))
        err = {code: codes['BAD_MEMBERS_ROOT'], message: "MembersRoot must match an uppercased SHA-1 hash"};
    }
    if(!err){
      // Previous hash
      var isRoot = parseInt(obj.number, 10) === 0;
      if(!isRoot && (!obj.previousHash || !obj.previousHash.match(/^[A-Z\d]{40}$/)))
        err = {code: codes['BAD_PREV_HASH_ABSENT'], message: "PreviousHash must be provided for non-root keyblock"};
      else if(isRoot && obj.previousHash)
        err = {code: codes['BAD_PREV_HASH_PRESENT'], message: "PreviousHash must not be provided for root keyblock"};
    }
    if(!err){
      // Previous issuer
      var isRoot = parseInt(obj.number, 10) === 0;
      if(!isRoot && (!obj.previousIssuer || !obj.previousIssuer.match(/^[A-Z\d]{40}$/)))
        err = {code: codes['BAD_PREV_ISSUER_ABSENT'], message: "PreviousIssuer must be provided for non-root keyblock"};
      else if(isRoot && obj.previousIssuer)
        err = {code: codes['BAD_PREV_ISSUER_PRESENT'], message: "PreviousIssuer must not be provided for root keyblock"};
    }
    return err && err.message;
  };
}

function extractFingerprintSeparatedPackets(raw) {
  var packetsByFPR = [];
  var lines = raw.split(/\n/);
  var nbKeys = 0;
  lines.forEach(function(line){
    if (line.match(/^#[A-Z0-9]{40}$/)) {
      // New key block
      packetsByFPR.push({
        number: nbKeys++,
        fingerprint: line.substring(1),
        packets: ""
      });
    } else if (line.match(/^[A-Za-z0-9\/+=]{1,64}$/) && nbKeys > 0) {
      packetsByFPR[nbKeys-1].packets += line + '\n';
    }
  });
  return _(packetsByFPR).sortBy(function (pubk) {
    return pubk.number;
  });
}

util.inherits(KeyblockParser, GenericParser);
