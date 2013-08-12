var jpgp = require('../lib/jpgp');
var mongoose = require('mongoose');

module.exports = function (pgp, currency, conf) {

  this.pubkey = function (req, res) {
    res.send(200, this.ascciiPubkey);
  };
  
  return this;
}
