var jpgp     = require('../lib/jpgp');
var mongoose = require('mongoose');

module.exports = {

  getTransaction: function (req, callback) {
    this.getTransactionFromRaw(req.body && req.body.transaction, req.body && req.body.signature, callback);
  },

  getTransactionFromRaw: function (transaction, signature, callback) {
    // Parameters
    if(!(transaction && signature)){
      callback('Requires a transaction + signature');
      return;
    }

    // Check signature's key ID
    var keyID = jpgp().signature(signature).issuer();
    if(!(keyID && keyID.length == 16)){
      callback('Cannot identify signature issuer`s keyID');
      return;
    }

    // Looking for corresponding public key
    mongoose.model('PublicKey').search("0x" + keyID, function (err, keys) {
      if(keys.length > 1){
        callback('Multiple PGP keys found for this keyID.');
        return;
      }
      if(keys.length < 1){
        callback('Corresponding Public Key not found.');
        return;
      }
      callback(null, keys[0], transaction + signature);
    });
  },

  getPeeringEntry: function (req, callback) {
    this.getPeeringEntryFromRaw(req.body && req.body.entry, req.body && req.body.signature, callback);
  },

  getPeeringEntryFromRaw: function (entry, signature, callback) {
    // Parameters
    if(!(entry && signature)){
      callback('Requires a peering entry + signature');
      return;
    }

    // Check signature's key ID
    var keyID = jpgp().signature(signature).issuer();
    if(!(keyID && keyID.length == 16)){
      callback('Cannot identify signature issuer`s keyID');
      return;
    }
    callback(null, entry + signature, keyID);
  },

  getFingerprint: function (req, callback){
    if(!req.params.fpr){
      callback("Fingerprint is required");
      return;
    }
    var matches = req.params.fpr.match(/(\w{40})/);
    if(!matches){
      callback("Fingerprint format is incorrect, must be an upper-cased SHA1 hash");
      return;
    }
    callback(null, matches[1]);
  },

  getCount: function (req, callback){
    if(!req.params.count){
      callback("Count is required");
      return;
    }
    var matches2 = req.params.count.match(/^(\d+)$/);
    if(!matches2){
      callback("Count format is incorrect, must be an upper-cased SHA1 hash");
      return;
    }
    callback(null, matches2[1]);
  },

  getTransactionID: function (req, callback) {
    if(!req.params.transaction_id){
      callback("Transaction ID is required");
      return;
    }
    var matches = req.params.transaction_id.match(/(\w{40})-(\d+)/);
    if(!matches){
      callback("Transaction ID format is incorrect, must be an upper-cased SHA1 hash");
      return;
    }
    callback(null, matches[1], matches[2]);
  },

  getVote: function (req, callback){
    if(!(req.body && req.body.amendment && req.body.signature)){
      callback('Requires an amendment + signature');
      return;
    }
    // Note: peer is not mandatory and may be undefined
    callback(null, req.body.amendment.unix2dos() + req.body.signature.unix2dos(), req.body.peer || "");
  },

  getAmendmentID: function (req, callback) {
    if(!req.params || !req.params.amendment_id){
      callback("Amendment ID is required");
      return;
    }
    var matches = req.params.amendment_id.match(/^(\d+)-(\w{40})$/);
    if(!matches){
      callback("Amendment ID format is incorrect, must be 'number-hash'");
      return;
    }
    callback(null, matches[1], matches[2]);
  },

  getAmendmentNumber: function (req, callback) {
    if(!req.params || !req.params.amendment_number){
      callback("Amendment number is required");
      return;
    }
    var matches = req.params.amendment_number.match(/^(\d+)$/);
    if(!matches){
      callback("Amendment number format is incorrect, must be an integer value");
      return;
    }
    callback(null, matches[1]);
  },

  getMembership: function (req, callback) {
    if(!(req.body && req.body.membership && req.body.signature)){
      callback('Requires a membership + signature');
      return;
    }
    callback(null, req.body.membership + req.body.signature);
  },

  getVoting: function (req, callback) {
    if(!(req.body && req.body.voting && req.body.signature)){
      callback('Requires a voting + signature');
      return;
    }
    callback(null, req.body.voting + req.body.signature);
  },

  getTHTEntry: function (req, callback) {
    if(!(req.body && req.body.entry && req.body.signature)){
      callback('Requires a THT entry + signature');
      return;
    }
    callback(null, req.body.entry + req.body.signature);
  },

  getStatus: function (req, callback) {
    if(!(req.body && req.body.status && req.body.signature)){
      callback('Requires a status + signature');
      return;
    }
    callback(null, req.body.status + req.body.signature);
  },

  getPubkey: function (req, callback) {
    if(!req.body){
      callback('Parameters `keytext` and `keysign` are required');
      return;
    }
    if(!req.body.keytext){
      callback('Key is required');
      return;
    }
    if(!req.body.keysign){
      callback('Key signature is required');
      return;
    }
    if(!req.body.keytext.match(/BEGIN PGP PUBLIC KEY/) || !req.body.keytext.match(/END PGP PUBLIC KEY/)){
      callback('Keytext does not look like a public key message');
      return;
    }
    if(!req.body.keysign.match(/BEGIN PGP/) || !req.body.keysign.match(/END PGP/)){
      callback('Keysign does not look like a PGP message');
      return;
    }
    callback(null, req.body.keytext, req.body.keysign);
  }
}