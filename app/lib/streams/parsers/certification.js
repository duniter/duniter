"use strict";
const GenericParser = require('./GenericParser');
const util          = require('util');
const rawer         = require('duniter-common').rawer;
const constants     = require('../../constants');

module.exports = CertificationParser;

function CertificationParser (onError) {

  const captures = [
    {prop: "version",           regexp: constants.DOCUMENTS.DOC_VERSION },
    {prop: "type",              regexp: constants.CERTIFICATION.CERT_TYPE },
    {prop: "currency",          regexp: constants.DOCUMENTS.DOC_CURRENCY },
    {prop: "issuer",            regexp: constants.DOCUMENTS.DOC_ISSUER },
    {prop: "idty_issuer",       regexp: constants.CERTIFICATION.IDTY_ISSUER },
    {prop: "idty_sig",          regexp: constants.CERTIFICATION.IDTY_SIG },
    {prop: "idty_buid",         regexp: constants.CERTIFICATION.IDTY_TIMESTAMP},
    {prop: "idty_uid",          regexp: constants.CERTIFICATION.IDTY_UID },
    {prop: "buid",              regexp: constants.CERTIFICATION.CERT_TIMESTAMP }
  ];
  const multilineFields = [];
  GenericParser.call(this, captures, multilineFields, rawer.getOfficialCertification, onError);

  this._clean = (obj) => {
    obj.documentType = 'certification';
    obj.sig = obj.signature;
    obj.block = obj.buid;
    if (obj.block) {
      obj.number = obj.block.split('-')[0];
      obj.fpr = obj.block.split('-')[1];
    } else {
      obj.number = '0';
      obj.fpr = '';
    }
  };

  this._verify = (obj) => ["version", "type", "currency", "issuer", "idty_issuer", "idty_sig", "idty_buid", "idty_uid", "block"].reduce(function (p, field) {
    return p || (!obj[field] && "Wrong format for certification");
  }, null);
}

util.inherits(CertificationParser, GenericParser);
