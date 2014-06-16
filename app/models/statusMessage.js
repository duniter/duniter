var async    = require('async');
var sha1     = require('sha1');
var jpgp     = require('../lib/jpgp');
var rawer    = require('../lib/rawer');
var _        = require('underscore');

module.exports = function StatusMessage (values) {

  var that = this;
  ['version', 'currency', 'status', 'hash', 'pubkey'].forEach(function(field){
    that[field] = values && values[field] || '';
  });

  this.json = function () {
    var obj = {};
    ['version', 'currency', 'status'].forEach(function(field){
      obj[field] = that[field] || '';
    });
    return obj;
  }

  this.isAsk = function () {
    return this.status == 'ASK';
  }

  this.isNew = function () {
    return this.status == 'NEW';
  }

  this.isNewBack = function () {
    return this.status == 'NEW_BACK';
  }

  this.isUp = function () {
    return this.status == 'UP';
  }

  this.isDown = function () {
    return this.status == 'DOWN';
  }
  
  this.parse = function(rawStatusReq, callback) {
    var rawSR = rawStatusReq;
    var sigIndex = rawStatusReq.lastIndexOf("-----BEGIN");
    if(~sigIndex){
      this.signature = rawStatusReq.substring(sigIndex);
      rawSR = rawStatusReq.substring(0, sigIndex);
      try{
        this.sigDate = jpgp().signature(this.signature).signatureDate();
      }
      catch(ex){}
    }
    if(!rawSR){
      callback("No status request given");
      return false;
    }
    else{
      var obj = this;
      var captures = [
        {prop: "version",   regexp: /Version: (.*)/},
        {prop: "currency",  regexp: /Currency: (.*)/},
        {prop: "status",    regexp: /Status: (.*)/}
      ];
      var crlfCleaned = rawSR.replace(/\r\n/g, "\n");
      if(crlfCleaned.match(/\n$/)){
        captures.forEach(function (cap) {
          var fieldValue = crlfCleaned.match(cap.regexp);
          if(fieldValue && fieldValue.length === 2){
            obj[cap.prop] = fieldValue[1];
          }
        });
      }
      else{
        callback("Bad document structure: no new line character at the end of the document.");
        return false;
      }
    }
    this.hash = sha1(rawStatusReq).toUpperCase();
    callback(null, this);
  }

  this.verifySignature = function (publicKey, done) {
    jpgp()
      .publicKey(publicKey)
      .data(this.getRaw())
      .signature(this.signature)
      .verify(publicKey, done);
  }

  this.getRaw = function() {
    return rawer.getStatusWithoutSignature(this);
  },

  this.getRawSigned = function() {
    return rawer.getStatus(this);
  }
}
