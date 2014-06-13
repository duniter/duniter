var sha1                 = require('sha1');
var util                 = require('util');
var stream               = require('stream');
var unix2dos             = require('../../../unix2dos');
var simpleLineExtract    = require('../../../simpleLineExtract');
var multipleLinesExtract = require('../../../multipleLinesExtract');

module.exports = GenericParser;

function GenericParser (obj, captures, multipleLinesFields, rawerFunc, onError) {

  stream.Transform.call(this, { decodeStrings: false, objectMode: true });

  this.rawerFunc = rawerFunc;

  var error = "";

  this._write = function (str, enc, done) {
    this.parse(str, obj);
    this._clean(obj);
    if (!error) {
      error = this.verify(obj);
    }
    if (!error && sha1(str) != sha1(this.rawerFunc(obj))) {
      // console.log(str, rawerFunc(obj));
      error = 'Document has unkown fields or wrong format';
    }
    if (!error) {
      // Reable object for piped streams
      this.push(obj);
      this.push(null);
    } else {
      // Error callback
      if (typeof onError == 'function')
        onError(error);
      this.push(null);
    }
  };

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
