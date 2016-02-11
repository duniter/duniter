"use strict";
let dos2unix = require('./dos2unix');
let constants = require('./constants');

module.exports = new function() {

  let that = this;

  this.getOfficialIdentity = function (json) {
    let raw = "";
    raw += "Version: " + (json.version || constants.DOCUMENTS_VERSION) + "\n";
    raw += "Type: Identity\n";
    raw += "Currency: " + json.currency + "\n";
    raw += "Issuer: " + (json.issuer || json.pubkey) + "\n";
    raw += "UniqueID: " + json.uid + '\n';
    raw += "Timestamp: " + json.buid + '\n';
    raw += json.sig || '';
    return dos2unix(raw);
  };

  this.getOfficialCertification = function (json) {
    let raw = getNormalHeader('Certification', json);
    raw += "IdtyIssuer: " + json.idty_issuer + '\n';
    raw += "IdtyUniqueID: " + json.idty_uid + '\n';
    raw += "IdtyTimestamp: " + json.idty_buid + '\n';
    raw += "IdtySignature: " + json.idty_sig + '\n';
    raw += "CertTimestamp: " + json.buid + '\n';
    raw += json.sig || '';
    return dos2unix(raw);
  };

  this.getOfficialRevocation = function (json) {
    let raw = getNormalHeader('Revocation', json);
    raw += "IdtyUniqueID: " + json.uid + '\n';
    raw += "IdtyTimestamp: " + json.buid + '\n';
    raw += "IdtySignature: " + json.sig + '\n';
    raw += json.revocation;
    return dos2unix(raw);
  };

  this.getPeerWithoutSignature = function (json) {
    let raw = "";
    raw += "Version: " + (json.version || constants.DOCUMENTS_VERSION) + "\n";
    raw += "Type: Peer\n";
    raw += "Currency: " + json.currency + "\n";
    raw += "PublicKey: " + json.pubkey + "\n";
    raw += "Block: " + json.block + "\n";
    raw += "Endpoints:" + "\n";
    (json.endpoints || []).forEach(function(ep){
      raw += ep + "\n";
    });
    return dos2unix(raw);
  };

  this.getPeer = function (json) {
    return dos2unix(signed(that.getPeerWithoutSignature(json), json));
  };

  this.getMembershipWithoutSignature = function (json) {
    let raw = getNormalHeader('Membership', json);
    raw += "Block: " + json.block + "\n";
    raw += "Membership: " + json.membership + "\n";
    if (json.userid)
      raw += "UserID: " + json.userid + "\n";
    if (json.certts)
      raw += "CertTS: " + json.certts + "\n";
    return dos2unix(raw);
  };

  this.getMembership = function (json) {
    return dos2unix(signed(that.getMembershipWithoutSignature(json), json));
  };

  this.getBlockInnerPart = function (json) {
    let raw = "";
    raw += "Version: " + (json.version || constants.DOCUMENTS_VERSION) + "\n";
    raw += "Type: Block\n";
    raw += "Currency: " + json.currency + "\n";
    raw += "Number: " + json.number + "\n";
    raw += "PoWMin: " + json.powMin + "\n";
    raw += "Time: " + json.time + "\n";
    raw += "MedianTime: " + json.medianTime + "\n";
    if (json.dividend)
      raw += "UniversalDividend: " + json.dividend + "\n";
    raw += "Issuer: " + json.issuer + "\n";
    if(json.previousHash)
      raw += "PreviousHash: " + json.previousHash + "\n";
    if(json.previousIssuer)
      raw += "PreviousIssuer: " + json.previousIssuer + "\n";
    if(json.parameters)
      raw += "Parameters: " + json.parameters + "\n";
    raw += "MembersCount: " + json.membersCount + "\n";
    raw += "Identities:\n";
    for(let i = 0; i < json.identities.length; i++){
      raw += json.identities[i] + "\n";
    }
    raw += "Joiners:\n";
    for(let i = 0; i < json.joiners.length; i++){
      raw += json.joiners[i] + "\n";
    }
    raw += "Actives:\n";
    for(let i = 0; i < json.actives.length; i++){
      raw += json.actives[i] + "\n";
    }
    raw += "Leavers:\n";
    for(let i = 0; i < json.leavers.length; i++){
      raw += json.leavers[i] + "\n";
    }
    raw += "Revoked:\n";
    for(let i = 0; i < json.revoked.length; i++){
      raw += json.revoked[i] + "\n";
    }
    raw += "Excluded:\n";
    for(let i = 0; i < json.excluded.length; i++){
      raw += json.excluded[i] + "\n";
    }
    raw += "Certifications:\n";
    for(let i = 0; i < json.certifications.length; i++){
      raw += json.certifications[i] + "\n";
    }
    raw += "Transactions:\n";
    for(let i = 0; i < json.transactions.length; i++){
      raw += json.transactions[i].raw || that.getCompactTransaction(json.transactions[i]);
    }
    return dos2unix(raw);
  };

  this.getBlockWithInnerHashAndNonce = function (json) {
    let raw = that.getBlockInnerPart(json);
    raw += "InnerHash: " + json.inner_hash + "\n";
    raw += "Nonce: " + json.nonce + "\n";
    return dos2unix(raw);
  };

  this.getBlock = function (json) {
    return dos2unix(signed(that.getBlockWithInnerHashAndNonce(json), json));
  };

  this.getTransaction = function (json) {
    let raw = "";
    raw += "Version: " + (json.version || constants.DOCUMENTS_VERSION) + "\n";
    raw += "Type: Transaction\n";
    raw += "Currency: " + json.currency + "\n";
    raw += "Locktime: " + json.locktime + "\n";
    raw += "Issuers:\n";
    (json.issuers || []).forEach(function (issuer) {
      raw += issuer + '\n';
    });
    raw += "Inputs:\n";
    (json.inputs || []).forEach(function (input) {
      raw += input + '\n';
    });
    raw += "Unlocks:\n";
    (json.unlocks || []).forEach(function (input) {
      raw += input + '\n';
    });
    raw += "Outputs:\n";
    (json.outputs || []).forEach(function (output) {
      raw += output + '\n';
    });
    raw += "Comment: " + (json.comment || "") + "\n";
    (json.signatures || []).forEach(function (signature) {
      raw += signature + '\n';
    });
    return dos2unix(raw);
  };

  this.getCompactTransaction = function (json) {
    let issuers = (json.issuers || json.signatories);
    let raw = ["TX", 1, issuers.length, json.inputs.length, json.unlocks.length, json.outputs.length, json.comment ? 1 : 0, json.locktime || 0].join(':') + '\n';
    (issuers || []).forEach(function (issuer) {
      raw += issuer + '\n';
    });
    (json.inputs || []).forEach(function (input) {
      raw += input + '\n';
    });
    (json.unlocks || []).forEach(function (input) {
      raw += input + '\n';
    });
    (json.outputs || []).forEach(function (output) {
      raw += output + '\n';
    });
    if (json.comment)
      raw += json.comment + '\n';
    (json.signatures || []).forEach(function (signature) {
      raw += signature + '\n';
    });
    return dos2unix(raw);
  };

  function getNormalHeader(doctype, json) {
    let raw = "";
    raw += "Version: " + (json.version || constants.DOCUMENTS_VERSION) + "\n";
    raw += "Type: " + doctype + "\n";
    raw += "Currency: " + json.currency + "\n";
    raw += "Issuer: " + json.issuer + "\n";
    return raw;
  }

  function signed (raw, json) {
    raw += json.signature + '\n';
    return raw;
  }
};
