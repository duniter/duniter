"use strict";
const util                 = require('util');
const stream               = require('stream');
const hashf                = require('duniter-common').hashf;
const logger               = require('../../logger')('gen_parser');
const constants            = require('../../constants');

module.exports = GenericParser;


function GenericParser (captures, multipleLinesFields, rawerFunc) {

  stream.Transform.call(this, { decodeStrings: false, objectMode: true });

  this.rawerFunc = rawerFunc;

  this._simpleLineExtraction = (pr, rawEntry, cap) => {
    const fieldValue = rawEntry.match(cap.regexp);
    if(fieldValue && fieldValue.length >= 2){
      pr[cap.prop] = cap.parser ? cap.parser(fieldValue[1], pr) : fieldValue[1];
    }
    return;
  };

  this._multipleLinesExtraction = (am, wholeAmend, cap) => {
    const fieldValue = wholeAmend.match(cap.regexp);
    let line = 0;
    am[cap.prop] = [];
    if(fieldValue && fieldValue.length >= 2)
    {
      const lines = fieldValue[1].split(/\n/);
      if(lines[lines.length - 1].match(/^$/)){
        for (let i = 0; i < lines.length - 1; i++) {
          line = lines[i];
          let fprChange = line.match(/([+-][A-Z\d]{40})/);
          if(fprChange && fprChange.length == 2){
            am[cap.prop].push(fprChange[1]);
          }
          else{
            return "Wrong structure for line: '" + line + "'";
          }
        }
      }
      else return "Wrong structure for line: '" + line + "'";
    }
  };

  this.syncWrite = (str) => {
    let error;
    const obj = {};
    this._parse(str, obj);
    this._clean(obj);
    if (!error) {
      error = this._verify(obj);
    }
    if (!error) {
      const raw = this.rawerFunc(obj);
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

  this._parse = (str, obj) => {
    let error;
    if(!str){
      error = "No document given";
    } else {
      error = "";
      obj.hash = hashf(str).toUpperCase();
      // Divide in 2 parts: document & signature
      const sp = str.split('\n');
      if (sp.length < 3) {
        error = "Wrong document: must have at least 2 lines";
      }
      else {
        const endOffset = str.match(/\n$/) ? 2 : 1;
        obj.signature = sp[sp.length - endOffset];
        obj.hash = hashf(str).toUpperCase();
        obj.raw = sp.slice(0, sp.length - endOffset).join('\n') + '\n';
        const docLF = obj.raw.replace(/\r\n/g, "\n");
        if(docLF.match(/\n$/)){
          captures.forEach((cap) => {
            if(~multipleLinesFields.indexOf(multipleLinesFields))
              error = this._multipleLinesExtraction(obj, docLF, cap);
            else
              this._simpleLineExtraction(obj, docLF, cap);
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
