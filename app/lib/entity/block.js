"use strict";
const _ = require('underscore');
const constants = require('../constants');
const hashf = require('../ucp/hashf');
const Transaction = require('./transaction');

module.exports = Block;

function Block(json) {

  this.documentType = 'block';
  this.transactions = this.transactions || [];
  this.excluded = this.excluded || [];
  this.actives = this.actives || [];
  this.leavers = this.leavers || [];
  this.revoked = this.revoked || [];
  this.identities = this.identities || [];
  this.joiners = this.joiners || [];
  this.certifications = this.certifications || [];

  _(json || {}).keys().forEach((key) => {
    let value = json[key];
    if (
         key == "number"
      || key == "medianTime"
      || key == "time"
      || key == "version"
      || key == "nonce"
      || key == "powMin"
      || key == "membersCount"
      || key == "dividend"
      || key == "unitbase"
      || key == "issuersCount"
      || key == "issuersFrame"
      || key == "issuersFrameVar"
      || key == "len"
      || key == "UDTime"
    ) {
      if (typeof value == "string") {
        value = parseInt(value);
      }
      if (isNaN(value) || value === null) {
        value = 0;
      }
    }
    this[key] = value;
  });

  [
    "dividend"
  ].forEach((field) => {
    this[field] = parseInt(this[field]) || null;
  });

  this.json = () => {
    const json = {};
    [
      "version",
      "nonce",
      "number",
      "powMin",
      "time",
      "medianTime",
      "membersCount",
      "monetaryMass",
      "unitbase",
      "issuersCount",
      "issuersFrame",
      "issuersFrameVar",
      "len"
    ].forEach((field) => {
        json[field] = parseInt(this[field], 10);
      });
    [
      "currency",
      "issuer",
      "signature",
      "hash",
      "parameters"
    ].forEach((field) => {
        json[field] = this[field] || "";
      });
    [
      "previousHash",
      "previousIssuer",
      "inner_hash"
    ].forEach((field) => {
        json[field] = this[field] || null;
      });
    [
      "dividend"
    ].forEach((field) => {
        json[field] = parseInt(this[field]) || null;
      });
    [
      "identities",
      "joiners",
      "actives",
      "leavers",
      "revoked",
      "excluded",
      "certifications"
    ].forEach((field) => {
        json[field] = [];
        this[field].forEach((raw) => {
          json[field].push(raw);
        });
      });
    [
      "transactions"
    ].forEach((field) => {
        json[field] = [];
        this[field].forEach((obj) => {
          json[field].push(_(obj).omit('raw', 'certifiers', 'hash'));
        });
      });
    json.raw = this.getRaw();
    return json;
  };

  this.getHash = () => {
    if (!this.hash) {
      this.hash = hashf(this.getProofOfWorkPart()).toUpperCase();
    }
    return this.hash;
  };

  this.getRawInnerPart = () => {
    return require('../ucp/rawer').getBlockInnerPart(this);
  };

  this.getRaw = () => {
    return require('../ucp/rawer').getBlockWithInnerHashAndNonce(this);
  };

  this.getSignedPart = () => {
    return require('../ucp/rawer').getBlockInnerHashAndNonce(this);
  };

  this.getProofOfWorkPart = () => {
    return require('../ucp/rawer').getBlockInnerHashAndNonceWithSignature(this);
  };

  this.getRawSigned = () => {
    return require('../ucp/rawer').getBlock(this);
  };

  this.quickDescription = () => {
    let desc = '#' + this.number + ' (';
    desc += this.identities.length + ' newcomers, ' + this.certifications.length + ' certifications)';
    return desc;
  };

  this.getInlineIdentity = (pubkey) => {
    let i = 0;
    let found = false;
    while (!found && i < this.identities.length) {
      if (this.identities[i].match(new RegExp('^' + pubkey)))
        found = this.identities[i];
      i++;
    }
    return found;
  };

  this.isLeaving = (pubkey) => {
    let i = 0;
    let found = false;
    while (!found && i < this.leavers.length) {
      if (this.leavers[i].match(new RegExp('^' + pubkey)))
        found = true;
      i++;
    }
    while (!found && i < this.excluded.length) {
      if (this.excluded[i].match(new RegExp('^' + pubkey)))
        found = true;
      i++;
    }
    return found;
  };

  this.isJoining = (pubkey) => {
    let i = 0;
    let found = false;
    while (!found && i < this.joiners.length) {
      if (this.joiners[i].match(new RegExp('^' + pubkey)))
        found = true;
      i++;
    }
    return found;
  };

  this.getTransactions = () => {
    const transactions = [];
    const version = this.version;
    const currency = this.currency;
    this.transactions.forEach((simpleTx) => {
      const tx = {};
      tx.issuers = simpleTx.signatories || [];
      tx.signatures = simpleTx.signatures || [];
      // Inputs
      tx.inputs = [];
      (simpleTx.inputs || []).forEach((input) => {
        const sp = input.split(':');
        tx.inputs.push({
          amount:     this.version >= 3 ? sp[0] : null,
          base:       this.version >= 3 ? sp[1] : null,
          type:       this.version >= 3 ? sp[2] : sp[0],
          identifier: this.version >= 3 ? sp[3] : sp[1],
          noffset:    this.version >= 3 ? parseInt(sp[4]) : parseInt(sp[2]),
          raw: input
        });
      });
      // Unlocks
      tx.unlocks = simpleTx.unlocks;
      // Outputs
      tx.outputs = [];
      (simpleTx.outputs || []).forEach((output) => {
        const sp = output.split(':');
        tx.outputs.push({
          amount: parseInt(sp[0]),
          base: parseInt(sp[1]),
          conditions: sp[2],
          raw: output
        });
      });
      tx.comment = simpleTx.comment;
      tx.version = simpleTx.version;
      tx.currency = currency;
      tx.locktime = parseInt(simpleTx.locktime);
      tx.blockstamp = simpleTx.blockstamp;
      transactions.push(tx);
    });
    return transactions;
  };
}

Block.statics = {};

Block.statics.fromJSON = (json) => new Block(json);

Block.statics.getLen = (block) => block.identities.length +
    block.joiners.length +
    block.actives.length +
    block.leavers.length +
    block.revoked.length +
    block.certifications.length +
    block.transactions.reduce((sum, tx) => sum + Transaction.statics.getLen(tx), 0);
