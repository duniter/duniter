var openpgp = require('./openpgp').openpgp;

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
    var cert = openpgp.read_publicKey(asciiArmored)[0];
    var fpr = hexstrdump(cert.publicKeyPacket.getFingerprint()).toUpperCase();
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

  this.issuer = function() {
    var issuer = "";
    try{
      var signatures = openpgp.read_message(this.signature);
      var sig = signatures[2];
      issuer = hexstrdump(sig.signature.getIssuer()).toUpperCase();
    }
    catch(ex){
    }
    return issuer;
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
    if(pubkey && !callback){
      callback = pubkey;
      pubkey = undefined;
    }
    // Do
    try{
      var signatures = openpgp.read_message(this.signature);
      var sig = signatures[2];
      var verified = sig.verifySignature();
      if(!verified){
        err = "Signature does not match signed data.";
      }
      if(verified && pubkey){
        var cert = this.certificate(pubkey);
        var issuer = hexstrdump(sig.signature.getIssuer()).toUpperCase();
        verified = cert.fingerprint.toUpperCase().indexOf(issuer) != -1;
        if(!verified){
          err = "Signature does not match issuer.";
        }
      }
    }
    catch(err){
    }
    // Done
    var end = new Date();
    var diff = end.getTime() - start.getTime();
    // console.log("jpgp verify", diff + " ms");
    callback(err, verified);
  };


  // PRIVATE
  function hexstrdump(str) {
    if (str == null)
      return "";
    var r=[];
    var e=str.length;
    var c=0;
    var h;
    while(c<e){
        h=str[c++].charCodeAt().toString(16);
        while(h.length<2) h="0"+h;
        r.push(""+h);
    }
    return r.join('');
  };
}

module.exports = function () {
  return new JPGP();
};