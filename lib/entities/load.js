var async = require('async'),
orm       = require('orm'),
_         = require('underscore');

module.exports = function (db, cb) {

  async.parallel({
      pubkey: function(callback){
        db.load(__dirname + '/PublicKey', function (err) {
          return callback(err);
        });
      }
  },
  function(err) {
    // loaded !
    return cb();
  });
};