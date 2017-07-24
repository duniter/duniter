"use strict";
const _ = require('underscore')
const constants = require('../constants');
const regex = require('../regex');
const hashf = require('../hashf');
const Transaction = require('./transaction');

// Constants
const SIGNED = false
const UNSIGNED = !SIGNED

module.exports = class Block {

  constructor(
    version,
    nonce,
    number,
    powMin,
    time,
    medianTime,
    membersCount,
    monetaryMass,
    unitbase,
    issuersCount,
    issuersFrame,
    issuersFrameVar,
    len,
    currency,
    issuer,
    signature,
    hash,
    parameters,
    previousHash,
    previousIssuer,
    inner_hash,
    dividend,
    identities,
    joiners,
    actives,
    leavers,
    revoked,
    excluded,
    certifications,
    transactions
  ) {
    this.version         = parseInt(version)
    this.nonce           = parseInt(nonce)
    this.number          = parseInt(number)
    this.powMin          = parseInt(powMin)
    this.time            = parseInt(time)
    this.medianTime      = parseInt(medianTime)
    this.membersCount    = parseInt(membersCount)
    this.monetaryMass    = parseInt(monetaryMass)
    this.unitbase        = parseInt(unitbase)
    this.issuersCount    = parseInt(issuersCount)
    this.issuersFrame    = parseInt(issuersFrame)
    this.issuersFrameVar = parseInt(issuersFrameVar)
    this.len             = parseInt(len)
    this.currency        = currency || ""
    this.issuer          = issuer || ""
    this.signature       = signature || ""
    this.hash            = hash || ""
    this.parameters      = parameters || ""
    this.previousHash    = previousHash || null
    this.previousIssuer  = previousIssuer || null
    this.inner_hash      = inner_hash || null
    this.dividend        = parseInt(dividend) || null
    this.identities      = (identities || []).slice()
    this.joiners         = (joiners || []).slice()
    this.actives         = (actives || []).slice()
    this.leavers         = (leavers || []).slice()
    this.revoked         = (revoked || []).slice()
    this.excluded        = (excluded || []).slice()
    this.certifications  = (certifications || []).slice()
    this.transactions    = (transactions || []).slice()
  }

  /**
   * Aliases
   */

  get pub() {
    return this.pubkey
  }

  get statics() {
    return {
    }
  }

  /**
   * Methods
   */

  json() {
    return {
      version: this.version,
      nonce: this.nonce,
      number: this.number,
      powMin: this.powMin,
      time: this.time,
      medianTime: this.medianTime,
      membersCount: this.membersCount,
      monetaryMass: this.monetaryMass,
      unitbase: this.unitbase,
      issuersCount: this.issuersCount,
      issuersFrame: this.issuersFrame,
      issuersFrameVar: this.issuersFrameVar,
      len: this.len,
      currency: this.currency,
      issuer: this.issuer,
      signature: this.signature,
      hash: this.hash,
      parameters: this.parameters,
      previousHash: this.previousHash,
      previousIssuer: this.previousIssuer,
      inner_hash: this.inner_hash,
      dividend: this.dividend,
      identities: this.identities,
      joiners: this.joiners,
      actives: this.actives,
      leavers: this.leavers,
      revoked: this.revoked,
      excluded: this.excluded,
      certifications: this.certifications,
      transactions: this.transactions.map((tx) => _.omit(tx, 'raw', 'certifiers', 'hash'))
    }
  }

  getRawSigned() {
    return Block.toRAWinnerPartWithHashAndNonce(this, SIGNED)
  }

  getRawInnerPart() {
    return Block.toRAWInnerPart(this)
  }

  getSignedPart() {
    return Block.toRAWHashAndNonce(this, UNSIGNED)
  }

  static getLen(block) {
    return block.identities.length +
      block.joiners.length +
      block.actives.length +
      block.leavers.length +
      block.revoked.length +
      block.certifications.length +
      block.transactions.reduce((sum, tx) => sum + Transaction.getLen(tx), 0)
  }

  static getHash(json) {
    const raw = Block.toRAWHashAndNonce(json)
    return hashf(raw).toUpperCase()
  }

  static fromJSON(json) {
    // Returns a new Peer only if `json` is defined and not null
    if (!json) return null
    return new Block(
      json.version || constants.DOCUMENTS_VERSION,
      json.nonce,
      json.number,
      json.powMin,
      json.time,
      json.medianTime,
      json.membersCount,
      json.monetaryMass,
      json.unitbase,
      json.issuersCount,
      json.issuersFrame,
      json.issuersFrameVar,
      json.len,
      json.currency,
      json.issuer,
      json.signature,
      json.hash,
      json.parameters,
      json.previousHash,
      json.previousIssuer,
      json.inner_hash,
      json.dividend,
      json.identities,
      json.joiners,
      json.actives,
      json.leavers,
      json.revoked,
      json.excluded,
      json.certifications,
      json.transactions
    )
  }

  static toRAW(json, unsigned) {
    const block = Block.fromJSON(json)
    let raw = "";
    raw += "Version: " + block.version + "\n";
    raw += "Type: Block\n";
    raw += "Currency: " + block.currency + "\n";
    raw += "Number: " + block.number + "\n";
    raw += "PoWMin: " + block.powMin + "\n";
    raw += "Time: " + block.time + "\n";
    raw += "MedianTime: " + block.medianTime + "\n";
    if (block.dividend)
      raw += "UniversalDividend: " + block.dividend + "\n";
    raw += "UnitBase: " + block.unitbase + "\n";
    raw += "Issuer: " + block.issuer + "\n";
    raw += "IssuersFrame: " + block.issuersFrame + "\n";
    raw += "IssuersFrameVar: " + block.issuersFrameVar + "\n";
    raw += "DifferentIssuersCount: " + block.issuersCount + "\n";
    if(block.previousHash)
      raw += "PreviousHash: " + block.previousHash + "\n";
    if(block.previousIssuer)
      raw += "PreviousIssuer: " + block.previousIssuer + "\n";
    if(block.parameters)
      raw += "Parameters: " + block.parameters + "\n";
    raw += "MembersCount: " + block.membersCount + "\n";
    raw += "Identities:\n";
    for (const idty of (block.identities || [])){
      raw += idty + "\n";
    }
    raw += "Joiners:\n";
    for (const joiner of (block.joiners || [])){
      raw += joiner + "\n";
    }
    raw += "Actives:\n";
    for (const active of (block.actives || [])){
      raw += active + "\n";
    }
    raw += "Leavers:\n";
    for (const leaver of (block.leavers || [])){
      raw += leaver + "\n";
    }
    raw += "Revoked:\n";
    for (const revoked of (block.revoked || [])){
      raw += revoked + "\n";
    }
    raw += "Excluded:\n";
    for (const excluded of (block.excluded || [])){
      raw += excluded + "\n";
    }
    raw += "Certifications:\n";
    for (const cert of (block.certifications || [])){
      raw += cert + "\n";
    }
    raw += "Transactions:\n";
    for (const tx of (block.transactions || [])){
      raw += tx.raw || Block.getCompactTransaction(tx);
    }
    if (!unsigned) {
      raw += block.signature + '\n'
    }
    return raw
  }

  static toRAWInnerPart(json) {
    const block = Block.fromJSON(json)
    let raw = "";
    raw += "Version: " + block.version + "\n";
    raw += "Type: Block\n";
    raw += "Currency: " + block.currency + "\n";
    raw += "Number: " + block.number + "\n";
    raw += "PoWMin: " + block.powMin + "\n";
    raw += "Time: " + block.time + "\n";
    raw += "MedianTime: " + block.medianTime + "\n";
    if (block.dividend)
      raw += "UniversalDividend: " + block.dividend + "\n";
    raw += "UnitBase: " + block.unitbase + "\n";
    raw += "Issuer: " + block.issuer + "\n";
    raw += "IssuersFrame: " + block.issuersFrame + "\n";
    raw += "IssuersFrameVar: " + block.issuersFrameVar + "\n";
    raw += "DifferentIssuersCount: " + block.issuersCount + "\n";
    if(block.previousHash)
      raw += "PreviousHash: " + block.previousHash + "\n";
    if(block.previousIssuer)
      raw += "PreviousIssuer: " + block.previousIssuer + "\n";
    if(block.parameters)
      raw += "Parameters: " + block.parameters + "\n";
    raw += "MembersCount: " + block.membersCount + "\n";
    raw += "Identities:\n";
    for (const idty of (block.identities || [])){
      raw += idty + "\n";
    }
    raw += "Joiners:\n";
    for (const joiner of (block.joiners || [])){
      raw += joiner + "\n";
    }
    raw += "Actives:\n";
    for (const active of (block.actives || [])){
      raw += active + "\n";
    }
    raw += "Leavers:\n";
    for (const leaver of (block.leavers || [])){
      raw += leaver + "\n";
    }
    raw += "Revoked:\n";
    for (const revoked of (block.revoked || [])){
      raw += revoked + "\n";
    }
    raw += "Excluded:\n";
    for (const excluded of (block.excluded || [])){
      raw += excluded + "\n";
    }
    raw += "Certifications:\n";
    for (const cert of (block.certifications || [])){
      raw += cert + "\n";
    }
    raw += "Transactions:\n";
    for (const tx of (block.transactions || [])){
      raw += tx.raw || Transaction.getCompactTransaction(tx);
    }
    return raw
  }

  static toRAWinnerPartWithHashAndNonce(json, unsigned) {
    let raw = Block.toRAWInnerPart(json);
    raw += "InnerHash: " + json.inner_hash + "\n"
    raw += "Nonce: " + json.nonce + "\n"
    if (unsigned === false) {
      raw += json.signature + "\n"
    }
    return raw
  };

  static toRAWHashAndNonce(json, unsigned) {
    let raw = "" +
      "InnerHash: " + json.inner_hash + "\n" +
      "Nonce: " + json.nonce + "\n"
    if (!unsigned) {
      raw += json.signature + "\n"
    }
    return raw
  }

  static getTransactions(json) {
    const block = Block.fromJSON(json)
    return block.transactions.slice().map((tx) => {
      tx.inputs = tx.inputs.map((i) => {
        if (typeof i === 'string') {
          return Transaction.inputStr2Obj(i)
        } else {
          return i
        }
      })
      tx.outputs = tx.outputs.map((o) => {
        if (typeof o === 'string') {
          return Transaction.outputStr2Obj(o)
        } else {
          return o
        }
      })
      return tx
    })
  };

}
