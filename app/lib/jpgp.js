var openpgp = require('openpgp');
var logger  = require('./logger')();

function JPGP() {

  this.args = [];
  this.signature = "";
  this.uid = "";
  this.data = "";
  this.noCarriage = false;

  var that = this;
  var publicKey = null;

  // PUBLIC
  this.publicKey = function(asciiArmored) {
    publicKey = openpgp.key.readArmored(asciiArmored).keys[0];
    return this;
  };

  this.certificate = function(asciiArmored) {
    var readKeys = openpgp.key.readArmored(asciiArmored).keys;
    if(readKeys.length == 0 || readKeys.length > 1){
      return {};
    }
    var key = readKeys[0];
    var fpr = key.getKeyPacket().getFingerprint().toUpperCase();
    var uids = key.getUserIds();
    var subkeys = [];
    key.getSubkeyPackets().forEach(function(subkeyPacket){
      subkeys.push(subkeyPacket.getFingerprint().toUpperCase());
    });
    return {
      "key": key,
      "fingerprint": fpr,
      "userid": uids && uids.length > 0 && uids[0],
      "uids": uids,
      "raw": asciiArmored,
      "subkeys": subkeys
    };
  };

  this.signature = function(asciiArmored) {
    this.signature = asciiArmored;
    return this;
  };

  this.sign = function (message, privateKey, done) {
    openpgp.signClearMessage([privateKey], message, function (err, signature) {
      done(err, escapeDashes(signature, message));
    });
  }

  this.issuer = function() {
    var issuer = "";
    try{
      var clearTextMessage = openpgp.message.readArmored(toClearSign("", this.signature));
      var issuers = clearTextMessage.getSigningKeyIds();
      if (issuers && issuers.length > 0)
        issuer = issuers[0].bytes.hexstrdump().toUpperCase();
    }
    catch(ex){
      logger.debug("Error with signature: " + ex);
    }
    return issuer;
  };

  this.signatureDate = function() {
    var sigDate = null;
    try{
      var clearTextMessage = openpgp.message.readArmored(toClearSign("", this.signature));
      var created = clearTextMessage.packets['0'].created;
      sigDate = new Date();
      sigDate.setTime(created.getTime());
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

      var issuerRegexp = new RegExp(this.issuer() + "$");
      var pkStatus = publicKey.verifyPrimaryKey();
      if (pkStatus == openpgp.enums.keyStatus.revoked) {
        err = 'Key has been revoked';
      } else {
        if (!publicKey.getKeyPacket().getFingerprint().toUpperCase().match(issuerRegexp)) {
          // Signature was done using subkey
          (publicKey.subKeys || []).forEach(function(subKey){
            if (subKey.subKey.getFingerprint().toUpperCase().match(issuerRegexp)) {
              if (subKey.verify(publicKey.primaryKey) == openpgp.enums.keyStatus.revoked) {
                err = 'SubKey has been revoked';
              }
            }
          });
        }
        if (!err) {
          var clearsigned = toClearSign(that.data, that.signature);
          var clearTextMessage = openpgp.cleartext.readArmored(clearsigned);
          var res = openpgp.verifyClearSignedMessage([publicKey], clearTextMessage);
          if (res.signatures && res.signatures.length > 0) {
            verified = res.signatures[0].valid && res.text == that.data;
            if (!verified)
              err = 'Signature does not match';
          }
        }
      }
    }
    catch(ex){
      verified = false;
      err = ex.toString();
      console.log('Exception during signature verification: ' + err);
    }
    callback(err, verified);
  };

  this.toClearSign = toClearSign;
}

module.exports = function () {
  return new JPGP();
};

function escapeDashes (clearsign, data) {
  // Escapes correctly dashes
  return clearsign
    .replace(/^- -----/gm, '-----')
    .replace(data, data.replace(/^-----/gm, '- -----'));
}

function toClearSign (data, signature) {
  if (signature.match(/-----BEGIN PGP SIGNED MESSAGE-----/))
    return signature
  else {
    var msg = '-----BEGIN PGP SIGNED MESSAGE-----\r\n' +
            'Hash: SHA1\r\n' +
            '\r\n' +
            data.replace(/^-----/gm, '- -----') + '\r\n' +
            signature + '\r\n';

    var signatureAlgo = findSignatureAlgorithm(msg) || 2;
    msg = msg.replace('Hash: SHA1', 'Hash: ' + hashAlgorithms[signatureAlgo.toString()]);

    return msg;
  }
}

function findSignatureAlgorithm (msg) {
  var signatureAlgo = null;
  var input = openpgp.armor.decode(msg);
  if (input.type !== openpgp.enums.armor.signed) {
    throw new Error('No cleartext signed message.');
  }
  var packetlist = new openpgp.packet.List();
  packetlist.read(input.data);
  packetlist.forEach(function(packet){
    if (packet.tag == openpgp.enums.packet.signature) {
      signatureAlgo = packet.hashAlgorithm;
    }
  });
  return signatureAlgo;
}

var hashAlgorithms = {
  '1': "MD5",
  '2': "SHA1",
  '3': "RIPEMD160",
  '8': "SHA256",
  '9': "SHA384",
  '10': "SHA512",
  '11': "SHA224"
};