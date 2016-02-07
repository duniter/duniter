"use strict";
var GenericParser = require('./GenericParser');
var util          = require('util');
var ucp           = require('../../../ucp');
var rawer         = require('../../../rawer');
var hashf         = require('../../../hashf');
var constants     = require('../../../constants');

module.exports = IdentityParser;

function IdentityParser (onError) {

  let captures = [
    {prop: "version",           regexp: constants.DOCUMENTS.DOC_VERSION },
    {prop: "type",              regexp: constants.IDENTITY.IDTY_TYPE},
    {prop: "currency",          regexp: constants.DOCUMENTS.DOC_CURRENCY },
    {prop: "pubkey",            regexp: constants.DOCUMENTS.DOC_ISSUER },
    {prop: "uid",               regexp: constants.IDENTITY.IDTY_UID },
    {prop: "buid",              regexp: constants.DOCUMENTS.TIMESTAMP }
  ];
  let multilineFields = [];
  GenericParser.call(this, captures, multilineFields, rawer.getOfficialIdentity, onError);

  this._clean = function (obj) {
    obj.documentType = 'identity';
    obj.sig = obj.signature;
    if (obj.uid && obj.buid && obj.pubkey) {
      obj.hash = hashf(obj.uid + obj.buid + obj.pubkey).toUpperCase();
    }
  };

  this._verify = function (obj) {
    if (!obj.pubkey) {
      return "No pubkey found";
    }
    if (!obj.uid) {
      return "Wrong user id format";
    }
    if (!obj.buid) {
      return "Could not extract block uid";
    }
    if (!obj.sig) {
      return "No signature found for self-certification";
    }
  };
}

util.inherits(IdentityParser, GenericParser);
