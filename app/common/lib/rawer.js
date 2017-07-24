"use strict";
const dos2unix = require('./dos2unix');
const document = require('./document');

const DOCUMENTS_VERSION = 10;
const SIGNED = false
const UNSIGNED = true

module.exports = new function() {

  this.getOfficialIdentity = (json, withSig) => {
    return document.Identity.toRAW(json, withSig !== false) // Defaut with sig
  };

  this.getOfficialCertification = (json) => {
    let raw = getNormalHeader('Certification', json);
    raw += "IdtyIssuer: " + json.idty_issuer + '\n';
    raw += "IdtyUniqueID: " + json.idty_uid + '\n';
    raw += "IdtyTimestamp: " + json.idty_buid + '\n';
    raw += "IdtySignature: " + json.idty_sig + '\n';
    raw += "CertTimestamp: " + json.buid + '\n';
    if (json.sig) {
      raw += json.sig + '\n';
    }
    return dos2unix(raw);
  };

  this.getOfficialRevocation = (json) => {
    let raw = getNormalHeader('Revocation', json);
    raw += "IdtyUniqueID: " + json.uid + '\n';
    raw += "IdtyTimestamp: " + json.buid + '\n';
    raw += "IdtySignature: " + json.sig + '\n';
    if (json.revocation) {
      raw += json.revocation + '\n';
    }
    return dos2unix(raw);
  };

  this.getPeerWithoutSignature = (json) => document.Peer.fromJSON(json).getRawUnsigned()

  this.getPeer = (json) => document.Peer.fromJSON(json).getRaw()

  this.getMembershipWithoutSignature = (json) => {
    return document.Membership.toRAW(json)
  };

  this.getMembership = (json) => {
    return dos2unix(signed(this.getMembershipWithoutSignature(json), json));
  };

  this.getBlockInnerPart = (json) => {
    return document.Block.toRAWInnerPart(json)
  };

  this.getBlockWithInnerHashAndNonce = (json) => {
    return document.Block.toRAWinnerPartWithHashAndNonce(json)
  };

  this.getBlockInnerHashAndNonce = (json) => {
    return document.Block.toRAWHashAndNonce(json, UNSIGNED)
  };

  this.getBlockInnerHashAndNonceWithSignature = (json) => {
    return document.Block.toRAWHashAndNonce(json, SIGNED)
  };

  this.getBlock = (json) => {
    return dos2unix(signed(this.getBlockWithInnerHashAndNonce(json), json));
  };

  this.getTransaction = (json) => {
    return document.Transaction.toRAW(json)
  };

  this.getCompactTransaction = (json) => {
    return document.Transaction.getCompactTransaction(json)
  };

  let getNormalHeader = (doctype, json) => {
    let raw = "";
    raw += "Version: " + (json.version || DOCUMENTS_VERSION) + "\n";
    raw += "Type: " + doctype + "\n";
    raw += "Currency: " + json.currency + "\n";
    raw += "Issuer: " + json.issuer + "\n";
    return raw;
  };

  let signed = (raw, json) => {
    raw += json.signature + '\n';
    return raw;
  };
};
