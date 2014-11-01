var mongoose = require('mongoose');
var async    = require('async');
var _        = require('underscore');
var Schema   = mongoose.Schema;

var SourceSchema = new Schema({
  pubkey: String,
  type: String,
  number: Number,
  fingerprint: String,
  amount: Number,
  consumed: { type: Boolean, default: false },
  created: { type: Date, default: Date.now },
  updated: { type: Date, default: Date.now }
});

SourceSchema.pre('save', function (next) {
  this.updated = Date.now();
  next();
});

SourceSchema.methods = {

  json: function () {
    return {
      "pubkey": this.pubkey,
      "type": this.type,
      "number": this.number,
      "fingerprint": this.fingerprint,
      "amount": this.amount
    };
  }
};

SourceSchema.statics.getAvailableByPubkey = function (pubkey, done) {
  var Source = this.model('Source');
  Source
    .find({ "pubkey": pubkey, "consumed": false })
    .exec(done);
}

SourceSchema.statics.existsNotConsumed = function (type, pubkey, number, fingerprint, amount, done) {
  var Source = this.model('Source');
  Source
    .find({ "type": type, "pubkey": pubkey, "number": number, "fingerprint": fingerprint, "amount": amount, "consumed": false })
    .limit(1)
    .exec(function (err, sources) {
      done(err, sources.length == 1);
    });
}

SourceSchema.statics.setConsumed = function (type, pubkey, number, fingerprint, amount, done) {
  var Source = this.model('Source');
  Source
    .update({ "type": type, "pubkey": pubkey, "number": number, "fingerprint": fingerprint, "amount": amount }, { "consumed": true }, { multi: true }, function (err) {
      done(err);
    });
}

module.exports = SourceSchema;
