"use strict";
var util                 = require('util');
var stream               = require('stream');
var hashf                = require('../../ucp/hashf');
var logger               = require('../../logger')('gen_parser');
var constants            = require('../../constants');
var simpleLineExtract    = require('./helpers/simpleLineExtract');
var multipleLinesExtract = require('./helpers/multipleLinesExtract');

module.exports = GenericParser;

function GenericParser (captures, multipleLinesFields, rawerFunc) {

  stream.Transform.call(this, { decodeStrings: false, objectMode: true });

  var that = this;
  this.rawerFunc = rawerFunc;

  this.syncWrite = (str) => {
    var error;
    var obj = {};
    that._parse(str, obj);
    that._clean(obj);
    if (!error) {
      error = that._verify(obj);
    }
    if (!error) {
      var raw = that.rawerFunc(obj);
      if (hashf(str) != hashf(raw))
        error = constants.ERRORS.WRONG_DOCUMENT;
      if (error) {
        logger.trace(error);
        logger.trace('-----------------');
        logger.trace('Written: %s', JSON.stringify({ str: str }));
        logger.trace('Extract: %s', JSON.stringify({ raw: raw }));
        logger.trace('-----------------');
      }
    }
    if (error){
      logger.trace(error);
      throw constants.ERRORS.WRONG_DOCUMENT;
    }
    return obj;
  };

  this._parse = function (str, obj) {
    var error;
    if(!str){
      error = "No document given";
    } else {
      error = "";
      obj.hash = hashf(str).toUpperCase();
      // Divide in 2 parts: document & signature
      var sp = str.split('\n');
      if (sp.length < 3) {
        error = "Wrong document: must have at least 2 lines";
      }
      else {
        let endOffset = str.match(/\n$/) ? 2 : 1;
        obj.signature = sp[sp.length - endOffset];
        obj.hash = hashf(str).toUpperCase();
        obj.raw = sp.slice(0, sp.length - endOffset).join('\n') + '\n';
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
    }
    return error;
  };
}

util.inherits(GenericParser, stream.Transform);
