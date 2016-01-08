"use strict";
var GenericParser = require('./GenericParser');
var rawer         = require('../../../rawer');
var util          = require('util');
var sha1          = require('sha1');
var moment        = require('moment');
var split         = require('../../../split');
var unix2dos      = require('../../../unix2dos');
var constants     = require('../../../constants');
var _             = require('underscore');

module.exports = MembershipParser;

function MembershipParser (onError) {
  
  var captures = [
    {prop: "version",           regexp: constants.MEMBERSHIP.VERSION },
    {prop: "currency",          regexp: constants.MEMBERSHIP.CURRENCY },
    {prop: "issuer",            regexp: constants.MEMBERSHIP.ISSUER },
    {prop: "membership",        regexp: constants.MEMBERSHIP.MEMBERSHIP },
    {prop: "userid",            regexp: constants.MEMBERSHIP.USERID },
    {prop: "block",             regexp: constants.MEMBERSHIP.BLOCK},
    {prop: "certts",            regexp: /CertTS: (.*)/, parser: parseDateFromTimestamp}
  ];
  var multilineFields = [];
  GenericParser.call(this, captures, multilineFields, rawer.getMembership, onError);

  this._clean = function (obj) {
    obj.documentType = 'membership';
    if (obj.block) {
      obj.number = obj.block.split('-')[0];
      obj.fpr = obj.block.split('-')[1];
    } else {
      obj.number = '0';
      obj.fpr = '';
    }
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
      'BAD_BLOCK': 155,
      'BAD_USERID': 156,
      'BAD_CERTTS': 157
    }
    if(!err){
      if(!obj.version || !obj.version.match(/^1$/))
        err = {code: codes.BAD_VERSION, message: "Version unknown"};
    }
    if(!err){
      if(obj.issuer && !obj.issuer.match(constants.BASE58))
        err = {code: codes.BAD_ISSUER, message: "Incorrect issuer field"};
    }
    if(!err){
      if(!(obj.membership || "").match(/^(IN|OUT)$/))
        err = {code: codes.BAD_MEMBERSHIP, message: "Incorrect Membership field: must be either IN or OUT"};
    }
    if(!err){
      if(obj.block && !obj.block.match(constants.BLOCK_REFERENCE))
        err = {code: codes.BAD_BLOCK, message: "Incorrect Block field: must be a positive or zero integer, a dash and an uppercased SHA1 hash"};
    }
    if(!err){
      if(obj.userid && !obj.userid.match(constants.USER_ID))
        err = {code: codes.BAD_USERID, message: "UserID must match udid2 format"};
    }
    if(!err){
      if(obj.certts && (typeof obj == 'string' ? !obj.certts.match(/^\d+$/) : moment(obj.certts).unix() <= 0))
        err = {code: codes.BAD_CERTTS, message: "CertTS must be a valid timestamp"};
    }
    return err && err.message;
  };
}

function parseDateFromTimestamp (value) {
  return new Date(parseInt(value)*1000);
}

util.inherits(MembershipParser, GenericParser);
