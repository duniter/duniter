var sha1    = require('sha1');
var openpgp = require('openpgp');
var constants = require('./constants');

openpgp.cleartext.CleartextMessage.prototype.getText = function() {
  // normalize end of line to \n
  return this.text;//.replace(/\r\n/g,"\n");
};

/**
 * Returns udid2 user and most significant (latest valid) self signature
 * - if multiple users are udid2 users returns the one with the latest self signature
 * - if no udid2 user is found returns null
 * @return {{user: Array<module:packet/User>, selfCertificate: Array<module:packet/signature>}|null} The primary user and the self signature
 */
openpgp.key.Key.prototype.getUdid2User = function() {
  var user = null;
  var userSelfCert;
  for (var i = 0; i < this.users.length; i++) {
    if (!this.users[i].userId) {
      continue;
    }
    var selfCert = this.users[i].getValidSelfCertificate(this.primaryKey);
    if (!selfCert) {
      continue;
    }
    if (this.users[i].userId.userid.match(constants.UDID2_FORMAT) != null &&
        (!user || 
          (!userSelfCert.isPrimaryUserID || selfCert.isPrimaryUserID) &&
          userSelfCert.created > selfCert.created)) {
      user = this.users[i];
      userSelfCert = selfCert;
    }
  }
  return user ? {user: user, selfCertificate: userSelfCert} : null;
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

Date.prototype.utc = function(){
  return new Date();
};

Date.prototype.utcZero = function(){
  return new Date(this.getTime() + this.getTimezoneOffset()*60*1000);
};

Date.prototype.timestamp = function(){
  return Math.floor(this.getTime() / 1000);
};
