"use strict";
const constants = require('../../../../app/lib/common-libs/constants').CommonConstants

// Constants
const SIGNED = false
const UNSIGNED = !SIGNED

module.exports = class Peer {

  constructor(version, currency, pubkey, endpoints, blockstamp, signature) {

    this.version = version
    this.currency = currency
    this.pubkey = pubkey
    this.endpoints = endpoints || [];
    this.blockstamp = blockstamp;
    this.signature = signature;
  }

  /**
   * Aliases
   */

  get pub() {
    return this.pubkey
  }

  set pub(pub) {
    this.pubkey = pub
  }

  get block() {
    return this.blockstamp
  }

  get statics() {
    return {
      peerize: (json) => Peer.fromJSON(json),
      fromJSON: (json) => Peer.fromJSON(json)
    }
  }

  /**
   * Methods
   */

  getDns() {
    const bma = this.getBMA();
    return bma.dns ? bma.dns : null;
  }

  getIPv4() {
    const bma = this.getBMA();
    return bma.ipv4 ? bma.ipv4 : null;
  }

  getIPv6() {
    const bma = this.getBMA();
    return bma.ipv6 ? bma.ipv6 : null;
  }

  getPort() {
    const bma = this.getBMA();
    return bma.port ? bma.port : null;
  }

  getBMA() {
    let bma = null;
    this.endpoints.forEach((ep) => {
      const matches = !bma && ep.match(constants.BMA_REGEXP);
      if (matches) {
        bma = {
          "dns": matches[2] || '',
          "ipv4": matches[4] || '',
          "ipv6": matches[6] || '',
          "port": matches[8] || 9101
        };
      }
    });
    return bma || {};
  }

  getURL() {
    const bma = this.getBMA();
    let base = this.getHostPreferDNS();
    if(bma.port)
      base += ':' + bma.port;
    return base;
  }

  getHostPreferDNS() {
    const bma = this.getBMA();
    return (bma.dns ? bma.dns :
      (bma.ipv4 ? bma.ipv4 :
        (bma.ipv6 ? bma.ipv6 : '')));
  }

  getRaw() {
    return Peer.toRAW(this, SIGNED)
  }

  getRawUnsigned() {
    return Peer.toRAW(this, UNSIGNED)
  }

  endpointSum() {
    return this.endpoints.join('_')
  }

  blockNumber() {
    return this.blockstamp.match(/^(\d+)-/)[1]
  }

  static fromJSON(json) {
    // Returns a new Peer only if `json` is defined and not null
    if (!json) return null
    return new Peer(
      json.version || constants.DOCUMENTS_VERSION,
      json.currency,
      json.pubkey || json.pub || "",
      json.endpoints,
      json.blockstamp || json.block,
      json.signature
    )
  }

  static toRAW(json, unsigned) {
    const p = Peer.fromJSON(json)
    let raw = ""
    raw += "Version: " + p.version + "\n"
    raw += "Type: Peer\n"
    raw += "Currency: " + p.currency + "\n"
    raw += "PublicKey: " + p.pubkey + "\n"
    raw += "Block: " + p.blockstamp + "\n"
    raw += "Endpoints:" + "\n"
    for(const ep of p.endpoints) {
      raw += ep + "\n"
    }
    if (!unsigned) {
      raw += json.signature + '\n'
    }
    return raw
  }

  static endpoint2host(endpoint) {
    return Peer.fromJSON({ endpoints: [endpoint] }).getURL()
  }

  static endpointSum(json) {
    return Peer.fromJSON(json).endpointSum()
  }

  static blockNumber(json) {
    const p = Peer.fromJSON(json)
    return p ? p.blockNumber() : -1
  }

  keyID () {
    return this.pubkey && this.pubkey.length > 10 ? this.pubkey.substring(0, 10) : "Unknown"
  }

  copyValues(to) {
    ["version", "currency", "pub", "endpoints", "hash", "status", "statusTS", "block", "signature"].forEach((key)=> {
      to[key] = this[key];
    });
  }

  // this.copyValuesFrom = (from) => {
  //   ["version", "currency", "pub", "endpoints", "block", "signature"].forEach((key) => {
  //     this[key] = from[key];
  //   });
  // };
  //
  // this.json = () => {
  //   const json = {};
  //   ["version", "currency", "endpoints", "status", "block", "signature"].forEach((key) => {
  //     json[key] = this[key];
  //   });
  //   json.raw = this.getRaw();
  //   json.pubkey = this.pubkey;
  //   return json;
  // };

  // this.hasValid4 = (bma) => !!(bma.ipv4 && !bma.ipv4.match(/^127.0/) && !bma.ipv4.match(/^192.168/));
  //
  // this.getNamedURL = () => this.getURL();
  //
  // this.getRaw = () => rawer.getPeerWithoutSignature(this);
  //
  // this.getRawSigned = () => rawer.getPeer(this);
  //
  // this.isReachable = () => {
  //   return !!this.getURL();
  // };
  //
  // this.containsEndpoint = (ep) => this.endpoints.reduce((found, endpoint) => found || endpoint === ep, false);
  //
  //
}
