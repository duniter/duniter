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

  this.getTransactions = () => {
    const transactions = [];
    const currency = this.currency;
    this.transactions.forEach((simpleTx) => {
      const tx = {};
      tx.issuers = simpleTx.issuers || [];
      tx.signatures = simpleTx.signatures || [];
      // Inputs
      tx.inputs = [];
      (simpleTx.inputs || []).forEach((input) => {
        const sp = input.split(':');
        tx.inputs.push({
          amount:     sp[0],
          base:       sp[1],
          type:       sp[2],
          identifier: sp[3],
          pos:        parseInt(sp[4]),
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

Block.statics.getHash = (block) => {
  const entity = Block.statics.fromJSON(block);
  return entity.getHash();
};

Block.statics.getConf = (block) => {
  const sp = block.parameters.split(':');
  const bconf = {};
  bconf.c = parseFloat(sp[0]);
  bconf.dt = parseInt(sp[1]);
  bconf.ud0 = parseInt(sp[2]);
  bconf.sigPeriod = parseInt(sp[3]);
  bconf.sigStock = parseInt(sp[4]);
  bconf.sigWindow = parseInt(sp[5]);
  bconf.sigValidity = parseInt(sp[6]);
  bconf.sigQty = parseInt(sp[7]);
  bconf.idtyWindow = parseInt(sp[8]);
  bconf.msWindow = parseInt(sp[9]);
  bconf.xpercent = parseFloat(sp[10]);
  bconf.msValidity = parseInt(sp[11]);
  bconf.stepMax = parseInt(sp[12]);
  bconf.medianTimeBlocks = parseInt(sp[13]);
  bconf.avgGenTime = parseInt(sp[14]);
  bconf.dtDiffEval = parseInt(sp[15]);
  bconf.blocksRot = parseInt(sp[16]);
  bconf.percentRot = parseFloat(sp[17]);
  return bconf;
};
