"use strict";
var GenericParser = require('./GenericParser');
var ucp           = require('../../../ucp');
var rawer         = require('../../../rawer');
var util          = require('util');
var constants     = require('../../../constants');

module.exports = MembershipParser;

function MembershipParser (onError) {
  
  var captures = [
    {prop: "version",           regexp: constants.MEMBERSHIP.VERSION },
    {prop: "currency",          regexp: constants.MEMBERSHIP.CURRENCY },
    {prop: "issuer",            regexp: constants.MEMBERSHIP.ISSUER },
    {prop: "membership",        regexp: constants.MEMBERSHIP.MEMBERSHIP },
    {prop: "userid",            regexp: constants.MEMBERSHIP.USERID },
    {prop: "block",             regexp: constants.MEMBERSHIP.BLOCK},
    {prop: "certts",            regexp: constants.MEMBERSHIP.CERTTS}
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
    var codes = {
      'BAD_VERSION': 150,
      'BAD_CURRENCY': 151,
      'BAD_ISSUER': 152,
      'BAD_MEMBERSHIP': 153,
      'BAD_REGISTRY_TYPE': 154,
      'BAD_BLOCK': 155,
      'BAD_USERID': 156,
      'BAD_CERTTS': 157
    };
    if(!err){
      if(!obj.version || !obj.version.match(constants.DOCUMENTS_VERSION_REGEXP))
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
      if(obj.block && !obj.block.match(constants.BLOCK_UID))
        err = {code: codes.BAD_BLOCK, message: "Incorrect Block field: must be a positive or zero integer, a dash and an uppercased SHA1 hash"};
    }
    if(!err){
      if(obj.userid && !obj.userid.match(constants.USER_ID))
        err = {code: codes.BAD_USERID, message: "UserID must match udid2 format"};
    }
    if(!err){
      if(!ucp.format.isBuid(obj.certts))
        err = {code: codes.BAD_CERTTS, message: "CertTS must be a valid timestamp"};
    }
    return err && err.message;
  };
}

util.inherits(MembershipParser, GenericParser);
