var jpgp    = require('../../app/lib/jpgp');
var openpgp = require('../../app/lib/openpgp').openpgp;

openpgp.init();

module.exports = function (asciiPrivateKey, password) {
  return new signatory(asciiPrivateKey, password);
};

function signatory (asciiPrivateKey, password) {

  var privateKey = null;
  var publicKeyASCII = "";
  var certificate = null;

  try{
    privateKey = openpgp.read_privateKey(asciiPrivateKey)[0];
    if(!privateKey.decryptSecretMPIs(password))
      throw new Error("Wrong private key password.");

    openpgp.write_signed_message(privateKey, "test");
    publicKeyASCII = privateKey ? privateKey.extractPublicKey() : "";
    certificate = publicKeyASCII ? jpgp().certificate(publicKeyASCII) : { fingerprint: '' };
  }
  catch(ex){
    console.error(ex);
    throw ex;
  }

  this.sign = function (message) {
    var clearSignature = openpgp.write_signed_message(privateKey, message);
    var detached = clearSignature.substring(clearSignature.indexOf('-----BEGIN PGP SIGNATURE'));
    return detached;
  };

  this.fingerprint = function () {
    return certificate.fingerprint;
  };

  console.log("new signatory " + this.fingerprint());
  return this;
}
