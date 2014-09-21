var openpgp = require('openpgp');
var logger  = require('../../app/lib/logger')('test');
var gnupg   = require('../../app/lib/gnupg');
var async   = require('async');

module.exports = function (asciiPrivateKey, password, name) {
  return new signatory(asciiPrivateKey, password, name);
};

function signatory (asciiPrivateKey, password, name) {

  var privateKey = null;
  var publicKeyASCII = "";
  var certificate = null;

  try{
    privateKey = openpgp.key.readArmored(asciiPrivateKey).keys[0];
    // console.log(privateKey);
    if(!privateKey.decrypt(password))
      throw new Error("Wrong private key password.");

    openpgp.signClearMessage(privateKey, "test");
    publicKeyASCII = privateKey ? privateKey.toPublic().armor() : "";
    certificate = publicKeyASCII ? jpgp().certificate(publicKeyASCII) : { fingerprint: '' };
  }
  catch(ex){
    logger.error(ex);
    throw ex;
  }

  this.sign = function (message, done) {
    var clearSignature = openpgp.signClearMessage(privateKey, message);
    var detached = clearSignature.substring(clearSignature.indexOf('-----BEGIN PGP SIGNATURE'));
    if (done) {
      done(null, detached);
    }
    return detached;
  };

  this.signGnuPG = function (message, done) {
    var gpg = new gnupg(asciiPrivateKey, password, "testring");
    async.series({
      init: function(callback){
        gpg.init(callback);
      },
      sign: function(callback){
        gpg.sign(message, callback);
      },
    },
    function(err, results) {
      done(err, results.sign);
    });
  };

  this.fingerprint = function () {
    return certificate.fingerprint;
  };

  this.name = function () {
    return name;
  };

  return this;
}
