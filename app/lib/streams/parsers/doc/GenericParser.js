var sha1                 = require('sha1');
var util                 = require('util');
var stream               = require('stream');
var simpleLineExtract    = require('../../../simpleLineExtract');
var multipleLinesExtract = require('../../../multipleLinesExtract');

module.exports = GenericParser;

var SIGNATURE_END_LENGTH = '-----END PGP SIGNATURE-----\r\n'.length;

function GenericParser (captures, multipleLinesFields, rawerFunc, onError) {

  stream.Transform.call(this, { decodeStrings: false, objectMode: true });

  var that = this;
  this.rawerFunc = rawerFunc;

  // Stream way
  this._write = function (str, enc, done) {
    doJob(str.toString(), function (err, obj) {
      if (!err) {
        // Readable object for piped streams
        that.push(obj);
      } else {
        // Error callback
        if (typeof onError == 'function')
          onError(err);
        that.push(null);
      }
      done();
    });
  };

  // Async way
  this.asyncWrite = function (str, done) {
    doJob(str, done);
  };

  function doJob (str, done) {
    var error;
    var obj = {};
    that._parse(str, obj);
    that._clean(obj);
    if (!error) {
      error = that._verify(obj);
    }
    if (!error) {
      var raw = that.rawerFunc(obj);
      if (sha1(str) != sha1(raw))
        error = 'Document has unkown fields or wrong line ending format';
    }
    done(error, obj);
  }

  this._clean = function (obj) {
    // To override
  };

  this._verify = function (obj) {
    // To override
    return null;
  };

  this._parse = function (str, obj) {
    if(!str){
      error = "No document given";
    } else {
      error = "";
      obj.hash = sha1(str).toUpperCase();
      // Divide in 2 parts: document & signature
      var sigIndex = str.lastIndexOf('-----BEGIN PGP SIGNATURE-----\r\n');
      var endIndex = str.lastIndexOf('-----END PGP SIGNATURE-----\r\n');
      if (~sigIndex && ~endIndex) {
        obj.signature = str.substring(sigIndex, endIndex + SIGNATURE_END_LENGTH);
      }
      obj.hash = sha1(str).toUpperCase();
      obj.raw = ~sigIndex ? str.substring(0, sigIndex) : str;
      var docLF = obj.raw.replace(/\r\n/g, "\n");
      if(docLF.match(/\n$/)){
        captures.forEach(function (cap) {
          if(~multipleLinesFields.indexOf(multipleLinesFields))
            error = multipleLinesExtract(obj, docLF, cap);
          else
            simpleLineExtract(obj, docLF, cap);
        });
      }
      else{
        error = "Bad document structure: no new line character at the end of the document.";
      }
    }
  };
};

util.inherits(GenericParser, stream.Transform);
