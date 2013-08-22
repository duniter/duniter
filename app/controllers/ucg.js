var jpgp = require('../lib/jpgp');

module.exports = function (pgp, currency, conf) {
  
  this.ascciiPubkey = pgp.keyring.privateKeys[0] ? pgp.keyring.privateKeys[0].obj.extractPublicKey() : '';

  this.pubkey = function (req, res) {
    res.send(200, this.ascciiPubkey);
  },

  this.peering = function (req, res) {
    res.writeHead(200);
    res.end(JSON.stringify({
      currency: currency,
      key: ascciiPubkey != '' ? jpgp().certificate(this.ascciiPubkey).fingerprint : '',
      remote: {
        host: conf.remotehost ? conf.remotehost : '',
        port: conf.remoteport ? conf.remoteport : ''
      },
      peers: []
    }));
  }
  
  return this;
}
