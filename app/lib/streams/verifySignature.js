var async    = require('async');
var sha1     = require('sha1');
var util     = require('util');
var stream   = require('stream');

module.exports = function (onError) {
  return new VerifySignature(onError);
};

function VerifySignature (onError) {

  stream.Transform.call(this, { objectMode: true });

  var that = this;

  this._write = function (json, enc, done) {
    async.waterfall([
      function (next){
        jpgp()
          .publicKey(json.pubkey.raw)
          .data(json.raw)
          .signature(json.signature)
          .verify(next);
      },
      function (verified, next) {
        if(!verified){
          next('Bad signature for document');
          return;
        }
        that.push(json);
        next();
      }
    ], function (err) {
      if (err && typeof onError == 'function')
        onError(err);
      that.push(null);
      done();
    });
  };
};

util.inherits(VerifySignature, stream.Transform);
