"use strict";
var sha1    = require('sha1');

module.exports = {

  /**
   * Shim that adds methods to Sting and Date types
   */
  shim: function() {

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
  }
};
