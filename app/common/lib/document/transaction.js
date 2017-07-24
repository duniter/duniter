"use strict";
const constants = require('../constants');
const regex = require('../regex');
const hashf = require('../../../lib/common-libs').hashf

// Constants
const SIGNED = false
const UNSIGNED = !SIGNED

module.exports = class Transaction {

  constructor(
    version,
    currency,
    issuers,
    signatures,
    inputs,
    unlocks,
    outputs,
    comment,
    blockstamp,
    blockstampTime,
    locktime,
    hash
  ) {
    this.version = version
    this.currency = currency
    this.issuers = (issuers || [])
    this.signatures = (signatures || [])
    this.inputsRAW  = (inputs  || []).map(i => typeof i === 'string' ? i : Transaction.inputObj2Str(i))
    this.outputsRAW = (outputs || []).map(o => typeof o === 'string' ? o : Transaction.outputObj2Str(o))
    this.inputs = this.inputsRAW.map(i => Transaction.inputStr2Obj(i))
    this.outputs = this.outputsRAW.map(o => Transaction.outputStr2Obj(o))
    this.unlocks = (unlocks || [])
    this.output_amount = this.outputs.reduce((sum, output) => sum + output.amount * Math.pow(10, output.base), 0)
    this.output_base = this.outputs.reduce((maxBase, output) => Math.max(maxBase, parseInt(output.base)), 0)
    this.comment = comment
    this.blockstamp = blockstamp
    this.blockstampTime = blockstampTime
    this.locktime = locktime || 0
    this.hash = hash
  }

  json() {
    return {
      'version': parseInt(this.version, 10),
      'currency': this.currency,
      'issuers': this.issuers.slice(),
      'inputs': this.inputsRAW.slice(),
      'unlocks': this.unlocks.slice(),
      'outputs': this.outputsRAW.slice(),
      'comment': this.comment,
      'locktime': this.locktime,
      'blockstamp': this.blockstamp,
      'blockstampTime': this.blockstampTime,
      'signatures': this.signatures.slice(),
      'raw': Transaction.toRAW(this),
      'hash': this.hash
    }
  }

  compact() {
    return Transaction.getCompactTransaction(this)
  }

  getHash(json) {
    const raw = Transaction.toRAW(this)
    return hashf(raw).toUpperCase()
  }

  /**
   * Aliases
   */

  /**
   * Methods
   */

  static getLen(tx) {
    return 2 // header + blockstamp
    + tx.issuers.length * 2 // issuers + signatures
    + tx.inputs.length * 2 // inputs + unlocks
    + (tx.comment ? 1 : 0)
    + tx.outputs.length
  }

  static fromJSON(json) {
    return new Transaction(
      json.version || constants.DOCUMENTS_VERSION,
      json.currency,
      json.issuers,
      json.signatures,
      json.inputsRAW || json.inputs,
      json.unlocks,
      json.outputsRAW || json.outputs,
      json.comment,
      json.blockstamp,
      json.blockstampTime,
      json.locktime,
      json.hash
    )
  }

  static toRAW(json) {
    const tx = Transaction.fromJSON(json)
    let raw = ""
    raw += "Version: " + (tx.version) + "\n"
    raw += "Type: Transaction\n"
    raw += "Currency: " + tx.currency + "\n"
    raw += "Blockstamp: " + tx.blockstamp + "\n"
    raw += "Locktime: " + tx.locktime + "\n"
    raw += "Issuers:\n";
    (tx.issuers || []).forEach((issuer) => {
      raw += issuer + '\n'
    })
    raw += "Inputs:\n";
    (tx.inputsRAW || []).forEach((input) => {
      raw += input + '\n'
    })
    raw += "Unlocks:\n";
    (tx.unlocks || []).forEach((unlock) => {
      raw += unlock + '\n'
    })
    raw += "Outputs:\n";
    (tx.outputsRAW  || []).forEach((output) => {
      raw += output + '\n'
    })
    raw += "Comment: " + (tx.comment || "") + "\n";
    (tx.signatures || []).forEach((signature) => {
      raw += signature + '\n'
    })
    return raw
  }

  static inputObj2Str(inputObj) {
    return [inputObj.amount, inputObj.base, inputObj.type, inputObj.identifier, inputObj.pos].join(':')
  }

  static outputObj2Str(oupoutObj) {
    return [oupoutObj.amount, oupoutObj.base, oupoutObj.conditions].join(':')
  }

  static inputStr2Obj(inputStr) {
    const sp = inputStr.split(':')
    return {
      amount:     sp[0],
      base:       sp[1],
      type:       sp[2],
      identifier: sp[3],
      pos:        parseInt(sp[4]),
      raw:        inputStr
    }
  }

  static outputStr2Obj(outputStr) {
    const sp = outputStr.split(':')
    return {
      amount: parseInt(sp[0]),
      base: parseInt(sp[1]),
      conditions: sp[2],
      raw: outputStr
    }
  }

  static getCompactTransaction(json) {
    const tx = Transaction.fromJSON(json)
    let issuers = tx.issuers;
    let raw = ["TX", tx.version, issuers.length, tx.inputs.length, tx.unlocks.length, tx.outputs.length, tx.comment ? 1 : 0, tx.locktime || 0].join(':') + '\n';
    raw += tx.blockstamp + "\n";
    (issuers || []).forEach((issuer) => {
      raw += issuer + '\n';
    });
    (tx.inputsRAW || []).forEach((input) => {
      raw += input + '\n';
    });
    (tx.unlocks || []).forEach((input) => {
      raw += input + '\n';
    });
    (tx.outputsRAW || []).forEach((output) => {
      raw += output + '\n';
    });
    if (tx.comment)
      raw += tx.comment + '\n';
    (tx.signatures || []).forEach((signature) => {
      raw += signature + '\n'
    })
    return raw
  }
}
