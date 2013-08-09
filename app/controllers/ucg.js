var jpgp = require('../lib/jpgp');

module.exports = function (pgp, currency, conf) {
  
  this.ascciiPubkey = pgp.keyring.privateKeys[0].obj.extractPublicKey();

  this.pubkey = function (req, res) {
    res.send(200, this.ascciiPubkey);
  },

  this.peering = function (req, res) {
    res.writeHead(200);
    res.end(JSON.stringify({
      currency: currency,
      key: jpgp().certificate(this.ascciiPubkey).fingerprint,
      ipv4: conf.ipv4,
      ipv6: conf.ipv6,
      port: conf.port,
      peers: []
    }));
  }
  
  return this;
}
