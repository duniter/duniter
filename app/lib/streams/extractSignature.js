var async    = require('async');
var sha1     = require('sha1');
var util     = require('util');
var stream   = require('stream');

module.exports = function (onError) {
  return new ExtractIssuer(onError);
};

function ExtractIssuer (onError) {

  stream.Transform.call(this, { objectMode: true });

  var that = this;

  this._write = function (json, enc, done) {
    async.waterfall([
      function (next){
        if (!json.signature) {
          next('JSON does not contain signature');
          return;
        }
        // KeyID
        var keyID = jpgp().signature(json.signature).issuer();
        if(!(keyID && keyID.length == 16)){
          next('Cannot identify signature issuer`s keyID: ' + keyID);
          return;
        }
        // Signature date
        var sigDate = jpgp().signature(json.signature).signatureDate();
        if(!sigDate){
          next('Cannot extract date of signature for keyID 0x%s', keyID);
          return;
        }
        json.keyID = keyID;
        json.sigDate = sigDate;
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

util.inherits(ExtractIssuer, stream.Transform);
