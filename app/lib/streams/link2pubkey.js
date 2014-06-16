var async    = require('async');
var sha1     = require('sha1');
var util     = require('util');
var stream   = require('stream');

module.exports = function (PubkeyService, onError) {
  return new Link2Pubkey(PubkeyService, onError);
};

function Link2Pubkey (PubkeyService, onError) {

  stream.Transform.call(this, { objectMode: true });

  var that = this;

  this._write = function (json, enc, done) {
    async.waterfall([
      function (next){
        PubkeyService.getTheOne(json.keyID, next);
      },
      function (pubkey, next){
        json.pubkey = pubkey;
        that.push(json);
        next();
      },
    ], function (err, result) {
      if (err && typeof onError == 'function')
        onError(err);
      that.push(null);
      done();
    });
  };
};

util.inherits(Link2Pubkey, stream.Transform);
