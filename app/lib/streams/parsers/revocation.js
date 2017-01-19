"use strict";
const GenericParser = require('./GenericParser');
const util          = require('util');
const rawer         = require('duniter-common').rawer;
const hashf         = require('duniter-common').hashf;
const constants     = require('../../constants');

module.exports = RevocationParser;

function RevocationParser (onError) {

  const captures = [
    {prop: "version",           regexp: constants.DOCUMENTS.DOC_VERSION },
    {prop: "type",              regexp: constants.REVOCATION.REVOC_TYPE },
    {prop: "currency",          regexp: constants.DOCUMENTS.DOC_CURRENCY },
    {prop: "issuer",            regexp: constants.DOCUMENTS.DOC_ISSUER },
    {prop: "sig",               regexp: constants.REVOCATION.IDTY_SIG },
    {prop: "buid",              regexp: constants.REVOCATION.IDTY_TIMESTAMP},
    {prop: "uid",               regexp: constants.REVOCATION.IDTY_UID }
  ];
  const multilineFields = [];
  GenericParser.call(this, captures, multilineFields, rawer.getOfficialRevocation, onError);

  this._clean = (obj) => {
    obj.documentType = 'revocation';
    obj.pubkey = obj.issuer;
    obj.revocation = obj.signature;
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
      return "No signature found for identity";
    }
    if (!obj.revocation) {
      return "No revocation signature found";
    }
  };
}

util.inherits(RevocationParser, GenericParser);
