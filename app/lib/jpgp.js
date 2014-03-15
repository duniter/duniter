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
    var readKeys = openpgp.read_publicKey(asciiArmored);
    if(readKeys.length == 0){
      throw new Error('No key found in ASCII armored message');
    }
    if(readKeys.length > 1){
      throw new Error('Multiple keys found in ASCII armored message');
    }
    var cert = readKeys[0];
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
      issuer = hexstrdump(sig.signature.getIssuer()).toUpperCase();
      if(!issuer){
        issuer = JSON.stringify(signatures);
      }
    }
    catch(ex){
      console.log("Error with signature: " + ex);
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
      console.log("Error with signature: " + ex);
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
        // if(this.data.match(/-C73882B64B7E72237A2F460CE9CAB76D19A8651E/))
        //   sig.text = this.data.unix2dos();
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
      if(verified && pubkey){
        var cert = this.certificate(pubkey);
        var issuer = hexstrdump(sig.signature.getIssuer()).toUpperCase();
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
    // if(err && sig && sig.text){
    //   console.error('==========================================================');
    //   console.error(detached ? '[DETACHED] ' + err : err);
    //   console.error('==========================================================');
    //   console.error({ text: sig.text });
    //   // console.error(hexstrdump(sig.text));
    //   console.error('----------------------------------------------------------');
    //   if(!detached){
    //     console.error({ text: this.data });
    //     // console.error(hexstrdump(this.data));
    //     console.error('----------------------------------------------------------');
    //   }
    // }
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