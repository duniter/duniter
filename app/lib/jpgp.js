var openpgp = require('./openpgp').openpgp;
var logger  = require('./logger')();

openpgp.init();

function JPGP() {

  this.args = [];
  this.signature = "";
  this.uid = "";
  this.data = "";
  this.noCarriage = false;

  // PUBLIC
  this.publicKey = function(asciiArmored) {
    openpgp.keyring.importPublicKey(asciiArmored);
    return this;
  };

  this.certificate = function(asciiArmored) {
    var readKeys = openpgp.read_publicKey(asciiArmored);
    if(readKeys.length == 0){
      throw new Error('No key found in ASCII armored message');
    }
    if(readKeys.length > 1){
      throw new Error('Multiple keys found in ASCII armored message');
    }
    var cert = readKeys[0];
    var fpr = cert.publicKeyPacket.getFingerprint().hexstrdump().toUpperCase();
    var uids = [];
    cert.userIds.forEach(function (uid) {
      uids.push(uid.text);
    });
    return {
      "fingerprint": fpr,
      "uids": uids,
      "raw": cert
    };
  };

  this.signature = function(asciiArmored) {
    this.signature = asciiArmored;
    return this;
  };

  this.sign = function (message, privateKey, done) {
    done(null, openpgp.write_signed_message(privateKey.obj, message));
  }

  this.signsDetached = function (message, privateKey, done) {
    require('./server').sign(message, done);
  }

  this.issuer = function() {
    var issuer = "";
    try{
      var signatures = openpgp.read_message(this.signature) || [];
      var sig = null;
      signatures.forEach(function (siga) {
        if(siga.messagePacket && siga.messagePacket.tagType == 2)
          sig = siga;
      });
      if(!sig){
        throw new Error("No signature packet found");
      }
      issuer = sig.signature.getIssuer().hexstrdump().toUpperCase();
      if(!issuer){
        issuer = JSON.stringify(signatures);
      }
    }
    catch(ex){
      logger.debug("Error with signature: " + ex);
    }
    return issuer;
  };

  this.signatureDate = function() {
    var sigDate;
    try{
      var signatures = openpgp.read_message(this.signature) || [];
      var sig = null;
      signatures.forEach(function (siga) {
        if(siga.messagePacket && siga.messagePacket.tagType == 2)
          sig = siga;
      });
      if(!sig){
        throw new Error("No signature packet found");
      }
      sigDate = sig.signature.creationTime;
    }
    catch(ex){
      logger.debug("Error with signature: " + ex);
    }
    return sigDate;
  };

  this.data = function(data_string) {
    this.data = data_string;
    return this;
  };

  this.noCarriage = function() {
    this.noCarriage = true;
    return this;
  };

  this.verify = function(pubkey, callback) {
    var start = new Date();
    var verified = false;
    var err = undefined;
    var sig = undefined;
    var detached = false;
    if(pubkey && !callback){
      callback = pubkey;
      pubkey = undefined;
    }
    // Do
    try{
      var signatures = openpgp.read_message(this.signature);
      if(signatures.length >= 3){
        sig = signatures[2];
      }
      else if(signatures.length == 1){
        sig = signatures[0];
        sig.text = this.data;
        detached = true;
      }
      else{
        throw new Error('No signature found');
      }
      var verified = sig.verifySignature();
      if(!verified){
        err = "Signature does not match.";
      }
      if(verified){
        if(!sig.text){
          err = 'Signature does not contain text data';
          verified = false;
        }
        else{
          if(sig.text != this.data){
            err = "Signature does not match signed data.";
            verified = false;
          }
        }
      }
      // Verify issuer is matching pubkey
      if(verified && pubkey){
        var cert = this.certificate(pubkey);
        var issuer = sig.signature.getIssuer().hexstrdump().toUpperCase();
        verified = cert.fingerprint.toUpperCase().indexOf(issuer) != -1;
        if(!verified){
          err = "Signature does not match issuer.";
        }
      }
    }
    catch(ex){
      verified = false;
      err = ex.toString();
    }
    callback(err, verified);
  };
}

module.exports = function () {
  return new JPGP();
};