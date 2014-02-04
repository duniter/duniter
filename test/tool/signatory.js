var jpgp    = require('../../app/lib/jpgp');
var openpgp = require('../../app/lib/openpgp');

module.exports = function () {
  
  return function signatory (asciiPrivateKey, password) {

    var privateKey = null;
    var publicKeyASCII = "";
    var certificate = null;

    try{
      openpgp.keyring.importPrivateKey(asciiPrivateKey, password);
      openpgp.write_signed_message(openpgp.keyring.privateKeys[0].obj, "test");

      privateKey = openpgp.keyring.privateKeys[0].obj;
      publicKeyASCII = privateKey ? privateKey.extractPublicKey() : "";
      certificate = publicKeyASCII ? jpgp().certificate(publicKeyASCII) : { fingerprint: '' };
    }
    catch(ex){
      console.error(ex);
      throw new Error("Wrong private key password.");
    }

    this.sign = function (message) {
      var clearSignature = openpgp.write_signed_message(privateKey, message);
      var detached = clearSignature.substring(clearSignature.indexOf('-----BEGIN PGP SIGNATURE'));
      done(null, detached);
    };

    this.fingerprint = function () {
      return cert.fingerprint;
    };

    return this;
  }
}
