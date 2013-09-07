var jpgp      = require('../lib/jpgp');
var async     = require('async');
var mongoose  = require('mongoose');
var Amendment = mongoose.model('Amendment');
var Merkle    = mongoose.model('Merkle');

module.exports = function (pgp, currency, conf) {
  
  this.ascciiPubkey = pgp.keyring.privateKeys[0] ? pgp.keyring.privateKeys[0].obj.extractPublicKey() : '';

  this.pubkey = function (req, res) {
    res.send(200, this.ascciiPubkey);
  },

  this.peering = function (req, res) {
    var am = null;
    var pkMerkle = null;
    var msMerkle = null;
    var votesMerkle = null;
    async.waterfall([
      function (next){
        Amendment.current(function (err, currentAm) {
          am = currentAm;
          next();
        });
      },
      function (next){
        Merkle.forPublicKeys(next);
      },
      function (merkle, next){
        Merkle.processForURL(req, merkle, null, next);
      },
      function (json, next){
        pkMerkle = json;
        Merkle.forNextMembership(next);
      },
      function (merkle, next){
        Merkle.processForURL(req, merkle, null, next);
      },
      function (json, next){
        msMerkle = json;
        async.waterfall([
          function (cb){
            Merkle.signaturesOfAmendment(am ? am.number : undefined, am ? am.hash : undefined, cb);
          },
          function (merkle, cb){
            Merkle.processForURL(req, merkle, null, cb);
          },
          function (json, cb){
            votesMerkle = json;
            cb();
          }
        ], next);
      }
    ], function (err, result) {
      if(err){
        res.send(500, err);
        return;
      }
      res.writeHead(200);
      res.end(JSON.stringify({
        currency: currency,
        key: ascciiPubkey != '' ? jpgp().certificate(this.ascciiPubkey).fingerprint : '',
        remote: {
          host: conf.remotehost ? conf.remotehost : '',
          ipv4: conf.remoteipv4 ? conf.remoteipv4 : '',
          ipv6: conf.remoteipv6 ? conf.remoteipv6 : '',
          port: conf.remoteport ? conf.remoteport : ''
        },
        contract: {
          currentNumber: am ? "" + am.number : '',
          hash: am ? am.hash : ''
        },
        "hdc/pks/all": pkMerkle,
        "hdc/community/memberships": msMerkle,
        "hdc/community/votes": votesMerkle
      }, null, "  "));
    });
  }
  
  return this;
}
