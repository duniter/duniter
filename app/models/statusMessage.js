var mongoose = require('mongoose');
var async    = require('async');
var sha1     = require('sha1');
var jpgp     = require('../lib/jpgp');
var _        = require('underscore');
var Schema   = mongoose.Schema;

module.exports = function StatusMessage (values) {

  var that = this;

  ['version', 'currency', 'status'].forEach(function(field){
    that[field] = values[field] || '';
  });

  this.json = function () {
    var obj = {};
    ['version', 'currency', 'status'].forEach(function(field){
      obj[field] = that[field] || '';
    });
    return obj;
  }

  this.isUp = function () {
    return ~['UP', 'CONNECTED'].indexOf(this.status);
  }

  this.isDown = function () {
    return !this.isUp();
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

  this.verify = function (currency, done) {
    var firstVerif = this.verifyStruct(this, currency);
    var valid = firstVerif.result;
    if(!valid && done){
      done(firstVerif.errorMessage, valid);
    }
    if(valid && done){
      done(null, valid);
    }
    return valid;
  }

  this.verifySignature = function (publicKey, done) {
    jpgp()
      .publicKey(publicKey)
      .data(this.getRaw())
      .noCarriage()
      .signature(this.signature)
      .verify(publicKey, done);
  }

  this.getRaw = function() {
    var raw = "";
    raw += "Version: " + this.version + "\n";
    raw += "Currency: " + this.currency + "\n";
    raw += "Status: " + this.status + "\n";
    return raw.unix2dos();
  },

  this.getRawSigned = function() {
    var raw = this.getRaw() + this.signature;
    return raw;
  }

  this.verifyStruct = function(obj, currency) {
    var err = null;
    var code = 150;
    var codes = {
      'BAD_VERSION': 150,
      'BAD_CURRENCY': 151,
      'BAD_STATUS': 152
    }
    if(!err){
      // Version
      if(!obj.version || !obj.version.match(/^1$/))
        err = {code: codes['BAD_VERSION'], message: "Version unknown"};
    }
    if(!err){
      // Currency
      if(!obj.currency || !obj.currency.match("^"+ currency + "$"))
        err = {code: codes['BAD_CURRENCY'], message: "Currency '"+ obj.currency +"' not managed"};
    }
    if(!err){
      // Status
      if(obj.status && !(obj.status + "").match(/^(CONNECTED|UP|DISCONNECTED)$/))
        err = {code: codes['BAD_STATUS'], message: "Status must be provided and match either CONNECTED, UP or DISCONNECTED"};
    }
    if(err){
      return { result: false, errorMessage: err.message, errorCode: err.code};
    }
    return { result: true };
  }
}
