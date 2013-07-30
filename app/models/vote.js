var sha1      = require('sha1');
var async     = require('async');
var jpgp      = require('../lib/jpgp');
var merkle    = require('merkle');
var mongoose  = require('mongoose');
var fs        = require('fs');
var PublicKey = mongoose.model('PublicKey');
var Amendment = mongoose.model('Amendment');
var Schema    = mongoose.Schema;

var VoteSchema = new Schema({
  issuer: String,
  signature: String,
  amendment: String,
  created: Date,
  updated: Date
});

VoteSchema.methods = {

  verify: function (done) {
    var obj = this;
    async.waterfall([
      function(callback){
        callback(null, obj.publicKey);
      },
      function(publicKey, callback){
        if(publicKey)
          callback(null, [publicKey]);
        else
          PublicKey.search("0x" + this.issuer, callback);
      }
    ], function (err, keys) {
      if(!err){
        if(keys.length > 0){
          var publicKey = keys[0];
          VoteSchema.statics.verify(obj.amendment, obj.signature, publicKey, function (err) {
            done(err);
          });
        }
        else done("Key not found");
      }
      else done(err);
    });
    return this;
  },

  loadFromFiles: function(voteFile, amendFile, done) {
    var obj = this;
    fs.readFile(voteFile, {encoding: "utf8"}, function (err, voteData) {
      if(!err){
        fs.readFile(amendFile, {encoding: "utf8"}, function (err, amendData) {
          if(!err){
            obj.signature = voteData;
            obj.amendment = amendData;
            done();
          }
          else done(err);
        });
      }
      else done(err);
    });
    return this;
  }
};

VoteSchema.statics.verify = function (amendment, signature, publicKey, done) {
  jpgp()
    .publicKey(publicKey)
    .data(amendment)
    .noCarriage()
    .signature(signature)
    .verify(done);
};

var Vote = mongoose.model('Vote', VoteSchema);