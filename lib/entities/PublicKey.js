var async = require('async'),
orm       = require('orm'),
sys       = require('sys'),
jpgp      = require('../jpgp'),
_         = require('underscore');

module.exports = function (db, cb) {

  var PublicKey = db.define("pubkey", {
    raw: {type: "text", size: 50000},
    fingerprint: {type: "text", size: 40},
    name: String,
    email: String,
    comment: String,
    created: Date,
    updated: Date
  }, {
    methods: {
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
    }
  });

  PublicKey.search = function (motif, done) {
    var obj = this;
    var found = [];
    var fprPattern = motif.match(/^0x(.*)$/);
    var searchByUID = {
      byName: function(callback){
        obj.find({ name: orm.like("%" + motif + "%")}, function (err, keys) {
          found.push(keys);
          callback();
        });
      },
      byEmail: function(callback){
        obj.find({ email: orm.like("%" + motif + "%")}, function (err, keys) {
          found.push(keys);
          callback();
        });
      },
      byComment: function(callback){
        obj.find({ comment: orm.like("%" + motif + "%")}, function (err, keys) {
          found.push(keys);
          callback();
        });
      }
    };
    var searchByFingerprint = {
      byFingerprint: function (callback) {
        var fpr = fprPattern ? fprPattern[1] : "";
        obj.find({ fingerprint: orm.like("%" + fpr + "%")}, function (err, keys) {
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

  return cb();
};