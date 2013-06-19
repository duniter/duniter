var async = require('async'),
orm       = require('orm'),
pgp       = require('node-pgp'),
_         = require('underscore');

module.exports = function (db, cb) {

  var PublicKey = db.define("pubkey", {
    raw: Buffer,
    fingerprint: {type: "text", size: 40},
    name: String,
    email: String,
    comment: String,
    created: Date,
    updated: Date
  }, {
    methods: {
      enarmor: function(done) {
        var obj = this;
        pgp.formats.enarmor(new pgp.BufferedStream(obj.raw), pgp.consts.ARMORED_MESSAGE).readUntilEnd(function(err, data) {
          if(!err){
            obj.asciiArmored = data.toString().replace(/\[object Object\]/g, "PUBLIC KEY BLOCK");
          }
          done(err);
        });
      },
      construct: function(done) {
        var obj = this;
        pgp.packets.splitPackets(this.raw).forEachSeries(function(type, header, body, next) {
          pgp.packetContent.getPacketInfo(type, body, function (err, infos) {
            switch(type){
              case pgp.consts.PKT.PUBLIC_KEY:
                obj.fingerprint = infos.fingerprint;
                break;
              case pgp.consts.PKT.USER_ID:
                obj.name = infos.name;
                obj.email = infos.email;
                obj.comment = infos.comment;
                break;
            }
            next();
          });
        }, function(err) {
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