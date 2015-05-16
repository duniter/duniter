"use strict";

module.exports = function hexstrdump(str) {
  if (str == null)
    return "";
  var r=[];
  var e=str.length;
  var c=0;
  var h;
  while(c<e){
      h=str[c++].charCodeAt().toString(16);
      while(h.length<2) h="0"+h;
      r.push(""+h);
  }
  return r.join('');
}
