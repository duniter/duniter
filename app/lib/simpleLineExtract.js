"use strict";

module.exports = function simpleLineExtraction(pr, rawEntry, cap, parser) {
  var fieldValue = rawEntry.match(cap.regexp);
  if(fieldValue && fieldValue.length >= 2){
    pr[cap.prop] = cap.parser ? cap.parser(fieldValue[1]) : fieldValue[1];
  }
  return;
};
