"use strict";
const GenericParser = require('./GenericParser');
const util          = require('util');
const rawer         = require('duniter-common').rawer;
const hashf         = require('duniter-common').hashf;
const constants     = require('../../constants');

module.exports = IdentityParser;

function IdentityParser (onError) {

  const captures = [
    {prop: "version",           regexp: constants.DOCUMENTS.DOC_VERSION },
    {prop: "type",              regexp: constants.IDENTITY.IDTY_TYPE},
    {prop: "currency",          regexp: constants.DOCUMENTS.DOC_CURRENCY },
    {prop: "pubkey",            regexp: constants.DOCUMENTS.DOC_ISSUER },
    {prop: "uid",               regexp: constants.IDENTITY.IDTY_UID },
    {prop: "buid",              regexp: constants.DOCUMENTS.TIMESTAMP }
  ];
  const multilineFields = [];
  GenericParser.call(this, captures, multilineFields, rawer.getOfficialIdentity, onError);

  this._clean = (obj) => {
    obj.documentType = 'identity';
    obj.sig = obj.signature;
    if (obj.uid && obj.buid && obj.pubkey) {
      obj.hash = hashf(obj.uid + obj.buid + obj.pubkey).toUpperCase();
    }
  };

  this._verify = (obj) => {
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
