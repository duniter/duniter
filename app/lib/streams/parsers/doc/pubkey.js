var GenericParser = require('./GenericParser');
var util          = require('util');
var split         = require('../../../split');
var rawer         = require('../../../rawer');
var sha1          = require('sha1');
var unix2dos      = require('../../../unix2dos');
var jpgp          = require('../../../jpgp');

module.exports = PubkeyParser;

function PubkeyParser (onError) {
  
  var captures = [];
  var multilineFields = [];
  GenericParser.call(this, captures, multilineFields, rawer.getPubkey, onError);

  this.parse = function (str, obj) {
    obj.raw = str;
    obj.hash = sha1(str).toUpperCase();
    // Extracting email, name and comment
    var k = jpgp().certificate(obj.raw);
    obj.fingerprint = k.fingerprint;
    obj.hash = sha1(obj.raw).toUpperCase();
    var uid = k.uids[0];
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
      } else {
        extract = uid.match(/([\s\S]*) \(([\s\S]*)\)/);
        if(extract && extract.length === 3) {
        obj.name = extract[1];
          obj.comment = extract[2];
          obj.email = "";
        } else {
          obj.name = "";
          obj.comment = "";
          obj.email = "";
        }
      }
    }
  };

  this.verify = function (obj) {
  };
}

util.inherits(PubkeyParser, GenericParser);
