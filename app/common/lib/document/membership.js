"use strict";
const constants = require('../../../../app/lib/common-libs/constants').CommonConstants

module.exports = class Membership {

  constructor(
    version,
    currency,
    issuer,
    membership,
    userid,
    blockstamp,
    certts,
    signature) {
    this.version = version
    this.currency = currency
    this.issuer = issuer
    this.membership = membership
    this.userid = userid
    this.blockstamp = blockstamp
    this.certts = certts
    this.signature = signature
  }

  /**
   * Aliases
   */

  get number() {
    return this.blockNumber
  }

  get fpr() {
    return this.blockHash
  }

  get block() {
    return this.blockstamp
  }

  get blockNumber() {
    if (!this.blockstamp) {
      return null
    }
    return parseInt(this.blockstamp.split('-')[0])
  }

  get blockHash() {
    if (!this.blockstamp) {
      return null
    }
    return this.blockstamp.split('-')[1]
  }

  /**
   * Methods
   */

  getRaw() {
    return Membership.toRAW(this)
  }

  inline() {
    return [
      this.issuer,
      this.signature,
      this.blockstamp,
      this.certts,
      this.userid
    ].join(':')
  }

  /**
   * Statics
   */

  static toRAW(json) {
    const ms = Membership.fromJSON(json)
    let raw = ""
    raw += "Version: " + ms.version + "\n"
    raw += "Type: Membership\n"
    raw += "Currency: " + ms.currency + "\n"
    raw += "Issuer: " + ms.issuer + "\n"
    raw += "Block: " + ms.block + "\n"
    raw += "Membership: " + ms.membership + "\n"
    if (ms.userid)
      raw += "UserID: " + ms.userid + "\n"
    if (ms.certts)
      raw += "CertTS: " + ms.certts + "\n"
    return raw
  }

  static fromJSON(json) {
    return new Membership(
      json.version || constants.DOCUMENTS_VERSION,
      json.currency,
      json.issuer,
      json.membership,
      json.userid,
      json.blockstamp || json.block,
      json.certts,
      json.signature)
  }

  static fromInline(inline, type, currency) {
    const sp = inline.split(':')
    return Membership.fromJSON({
      version:    constants.DOCUMENTS_VERSION,
      currency:   currency,
      issuer:     sp[0],
      membership: type,
      userid:     sp[4],
      blockstamp: sp[2],
      certts:     sp[3],
      signature:  sp[1]
    })
  }
}
