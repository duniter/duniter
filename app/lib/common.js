var sha1    = require('sha1');
var openpgp = require('openpgp');

openpgp.cleartext.CleartextMessage.prototype.getText = function() {
  // normalize end of line to \n
  return this.text;//.replace(/\r\n/g,"\n");
};

String.prototype.trim = function(){
  return this.replace(/^\s+|\s+$/g, '');
};

String.prototype.unix2dos = function(){
  return this.dos2unix().replace(/\n/g, '\r\n');
};

String.prototype.dos2unix = function(){
  return this.replace(/\r\n/g, '\n');
};

String.prototype.isSha1 = function(){
  return this.match(/^[A-Z0-9]{40}$/);
};

String.prototype.hash = function(){
  return sha1(this).toUpperCase();
};

String.prototype.hexstrdump = function() {
  if (this == null)
    return "";
  var r=[];
  var e=this.length;
  var c=0;
  var h;
  while(c<e){
      h=this[c++].charCodeAt().toString(16);
      while(h.length<2) h="0"+h;
      r.push(""+h);
  }
  return r.join('');
};

Date.prototype.timestamp = function(){
  return Math.floor(this.getTime() / 1000);
};
