var async     = require('async');
var openpgp   = require('openpgp');
var jpgp      = require('./jpgp');
var logger    = require('./logger')('peerserver');

module.exports = function (armoredPrivateKey, password, withOpenPGPJS, done) {
  var privateKey = openpgp.key.readArmored(armoredPrivateKey).keys[0];
  var fingerprint = privateKey.getKeyPacket().getFingerprint().toUpperCase();
  async.waterfall([
    function (next) {
      if (withOpenPGPJS) {
        var pgp = jpgp();
        privateKey.decrypt(password);
        var signingFunc = async.apply(pgp.sign.bind(pgp.sign), privateKey);
        next(null, function (message, done) {
          jpgp().sign(message, privateKey, done);
        });
      } else {
        var asciiPrivateKey = armoredPrivateKey;
        var keyring = '~/.gnupg/ucoin_' + fingerprint;
        logger.debug("Keyring = %s", keyring);
        var gnupg = new (require('./gnupg'))(asciiPrivateKey, password, fingerprint, keyring);
        gnupg.init(function (err) {
          next(err, function (message, done) {
            gnupg.sign(message, done);
          });
        });
      }
    },
    function (signFunc, next){
      try{
        signFunc("some test\nwith line return", function (err) {
          next(err, signFunc);
        });
      } catch(ex){
        next("Wrong private key password.");
      }
    },
  ], function (err, signFunc) {
    done(err, signFunc);
  });
};
