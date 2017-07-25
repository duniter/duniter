"use strict";
const constants = require('../../../../app/lib/common-libs/constants').CommonConstants

// Constants
const SIGNED = true
const UNSIGNED = !SIGNED

module.exports = class Identity {

  constructor(
    version,
    currency,
    pubkey,
    uid,
    blockstamp,
    signature,
    revoked,
    revoked_on,
    revocation_sig) {
    this.version = version || constants.DOCUMENTS_VERSION
    this.currency = currency
    this.pubkey = pubkey
    this.uid = uid
    this.blockstamp = blockstamp
    this.signature = signature
    this.revoked = revoked
    this.revoked_on = revoked_on
    this.revocation_sig = revocation_sig
    this.certs = []
  }

  /**
   * Aliases
   */

  get buid() {
    return this.blockstamp
  }

  set buid(buid) {
    this.blockstamp = buid
  }

  get sig() {
    return this.signature
  }

  set sig(sig) {
    this.signature = sig
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

  get hash() {
    return this.getTargetHash()
  }

  /**
   * Methods
   */

  getTargetHash() {
    const hashf = require('../../../lib/common-libs').hashf
    return hashf(this.uid + this.buid + this.pubkey).toUpperCase();
  }

  inline() {
    return [this.pubkey, this.sig, this.buid, this.uid].join(':');
  }

  rawWithoutSig() {
    return Identity.toRAW(this, UNSIGNED)
  }

  json() {
    const others = [];
    this.certs.forEach((cert) => {
      others.push({
        "pubkey": cert.from,
        "meta": {
          "block_number": cert.block_number,
          "block_hash": cert.block_hash
        },
        "uids": cert.uids,
        "isMember": cert.isMember,
        "wasMember": cert.wasMember,
        "signature": cert.sig
      });
    });
    const uids = [{
      "uid": this.uid,
      "meta": {
        "timestamp": this.buid
      },
      "revoked": this.revoked,
      "revoked_on": this.revoked_on,
      "revocation_sig": this.revocation_sig,
      "self": this.sig,
      "others": others
    }];
    const signed = [];
    this.signed.forEach((cert) => {
      signed.push({
        "uid": cert.idty.uid,
        "pubkey": cert.idty.pubkey,
        "meta": {
          "timestamp": cert.idty.buid
        },
        "cert_time": {
          "block": cert.block_number,
          "block_hash": cert.block_hash
        },
        "isMember": cert.idty.member,
        "wasMember": cert.idty.wasMember,
        "signature": cert.sig
      });
    });
    return {
      "pubkey": this.pubkey,
      "uids": uids,
      "signed": signed
    }
  }

  /**
   * Statics
   */

  static fromJSON(json) {
    return new Identity(
      json.version || constants.DOCUMENTS_VERSION,
      json.currency,
      json.pubkey || json.issuer,
      json.uid,
      json.blockstamp || json.buid,
      json.signature || json.sig,
      json.revoked,
      json.revoked_on,
      json.revocation_sig)
  }

  static toRAW(json, withSig) {
    const idty = Identity.fromJSON(json)
    let raw = ""
    raw += "Version: " + idty.version + "\n"
    raw += "Type: Identity\n"
    raw += "Currency: " + idty.currency + "\n"
    raw += "Issuer: " + (idty.issuer || idty.pubkey) + "\n"
    raw += "UniqueID: " + idty.uid + '\n'
    raw += "Timestamp: " + idty.buid + '\n'
    if (idty.sig && withSig) {
      raw += idty.sig + '\n'
    }
    return raw
  }

  static fromInline(inline) {
    const sp = inline.split(':')
    return Identity.fromJSON({
      pubkey: sp[0],
      sig: sp[1],
      buid: sp[2],
      uid: sp[3]
    })
  }

  static revocationFromInline(inline) {
    const sp = inline.split(':')
    return {
      pubkey: sp[0],
      sig: sp[1]
    }
  }
}
