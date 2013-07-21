var jpgp     = require('../lib/jpgp');
var mongoose = require('mongoose');
var async    = require('async');
var _        = require('underscore');
var Schema   = mongoose.Schema;

var PublicKeySchema = new Schema({
  raw: String,
  fingerprint: String,
  name: String,
  email: String,
  comment: String,
  created: Date,
  updated: Date
});

PublicKeySchema.methods = {
  construct: function(done) {
    var obj = this;
    jpgp().certificate(obj.raw).parse(function (err, stdout, stderr) {
      if(stderr)
        sys.print('stderr: \n' + stderr);
      if (err !== null) {
        console.log('exec error: ' + err);
      }
      var k = JSON.parse(stdout).data;
      obj.fingerprint = k.fingerprint;
      var uid = k.uids[0].uid;
      var extract = uid.match(/([\s\S]*) \(([\s\S]*)\) <([\s\S]*)>/);
      if(extract && extract.length === 4){
        obj.name = extract[1];
        obj.comment = extract[2];
        obj.email = extract[3];
      }
      else{
        extract = uid.match(/([\s\S]*) <([\s\S]*)>/);
        if(extract && extract.length === 3){
          obj.name = extract[1];
          obj.comment = '';
          obj.email = extract[2];
        }
      }
      done(err);
    });
  }
};

PublicKeySchema.statics.search = function (motif, done) {
  var obj = this;
  var found = [];
  var fprPattern = motif.match(/^0x(.*)$/);
  var searchByUID = {
    byName: function(callback){
      obj.find({ name: new RegExp(motif, 'i')}, function (err, keys) {
        found.push(keys);
        callback();
      });
    },
    byEmail: function(callback){
      obj.find({ email: new RegExp(motif, 'i')}, function (err, keys) {
        found.push(keys);
        callback();
      });
    },
    byComment: function(callback){
      obj.find({ comment: new RegExp(motif, 'i')}, function (err, keys) {
        found.push(keys);
        callback();
      });
    }
  };
  var searchByFingerprint = {
    byFingerprint: function (callback) {
      var fpr = fprPattern ? fprPattern[1] : "";
      obj.find({ fingerprint: new RegExp(fpr, 'i')}, function (err, keys) {
        found.push(keys);
        callback();
      });
    }
  };
  var searchFunc = fprPattern ? searchByFingerprint : searchByUID;
  async.parallel(searchFunc, function(err) {
    var pubKeys = {};
    var foundKeys = _(found).flatten();
    async.each(foundKeys, function (key, done) {
      pubKeys[key.id] = key;
      done();
    }, function (err) {
      done(err, _(pubKeys).values());
    });
  });
};

PublicKeySchema.statics.verify = function (asciiArmored, signature, done) {
  jpgp()
    .publicKey(asciiArmored)
    .data(asciiArmored)
    .noCarriage()
    .signature(signature)
    .verify(done);
};

var PublicKey = mongoose.model('PublicKey', PublicKeySchema);