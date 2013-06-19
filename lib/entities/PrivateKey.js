var async = require('async'),
orm       = require('orm'),
_         = require('underscore');

module.exports = function (db, cb) {

  var PrivateKey = db.define("privkey", {
    raw: Buffer,
    fingerprint: {type: "text", size: 40},
    name: String,
    email: String,
    comment: String,
    created: Date,
    updated: Date
  });

  PrivateKey.search = function (motif, done) {
    var obj = this;
    var found = [];
    async.parallel({
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
    },
    function(err) {
        done(err, _(found).flatten());
    });
  };

  return cb();
};