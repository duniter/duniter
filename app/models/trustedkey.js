var mongoose = require('mongoose');
var Schema   = mongoose.Schema;

var TrustedKeySchema = new Schema({
  keyID: { type: String, unique: true },
  fingerprint: String,
  uid: String,
  packets: String,
  created: { type: Date, default: Date.now },
  updated: { type: Date, default: Date.now }
});

TrustedKeySchema.pre('save', function (next) {
  this.updated = Date.now();
  next();
});

TrustedKeySchema.statics.getTheOne = function (keyID, done) {
  this.find({ keyID: keyID }, function (err, keys) {
    if(keys.length < 1){
      done('Trusted Key 0x' + keyID + ' not found.');
      return;
    }
    var pubkey = keys[0];
    done(null, pubkey);
  });
};

module.exports = TrustedKeySchema;
