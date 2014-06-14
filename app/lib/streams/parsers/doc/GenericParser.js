var sha1                 = require('sha1');
var util                 = require('util');
var stream               = require('stream');
var unix2dos             = require('../../../unix2dos');
var simpleLineExtract    = require('../../../simpleLineExtract');
var multipleLinesExtract = require('../../../multipleLinesExtract');

module.exports = GenericParser;

function GenericParser (captures, multipleLinesFields, rawerFunc, onError) {

  stream.Transform.call(this, { decodeStrings: false, objectMode: true });

  var that = this;
  this.rawerFunc = rawerFunc;

  // Stream way
  this._write = function (str, enc, done) {
    doJob(str, function (err, obj) {
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
    that.parse(str, obj);
    that._clean(obj);
    if (!error) {
      error = that.verify(obj);
    }
    var raw = that.rawerFunc(obj);
    if (!error && sha1(unix2dos(str)) != sha1(unix2dos(raw))) {
      error = 'Document has unkown fields or wrong format';
    }
    done(error, obj);
  }

  this._clean = function (obj) {
    // To override
  };

  this.parse = function (toParse, obj) {
    var str = unix2dos(toParse);
    if(!str){
      error = "No document given";
    } else {
      error = "";
      obj.hash = sha1(str).toUpperCase();
      var crlfCleaned = str.replace(/\r\n/g, "\n");
      if(crlfCleaned.match(/\n$/)){
        captures.forEach(function (cap) {
          if(~multipleLinesFields.indexOf(multipleLinesFields))
            error = multipleLinesExtract(obj, crlfCleaned, cap);
          else
            simpleLineExtract(obj, crlfCleaned, cap);
        });
      }
      else{
        error = "Bad document structure: no new line character at the end of the document.";
      }
    }
  };
};

util.inherits(GenericParser, stream.Transform);
