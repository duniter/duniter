var async    = require('async');
var sha1     = require('sha1');
var rawer    = require('../lib/rawer');
var _        = require('underscore');

module.exports = function StatusMessage (values) {

  var that = this;
  ['version', 'currency', 'status', 'from', 'to', 'hash', 'pubkey', 'time', 'signature'].forEach(function(field){
    that[field] = values && values[field] || '';
  });

  this.json = function () {
    var obj = {};
    ['version', 'currency', 'status', 'from', 'to', 'signature'].forEach(function(field){
      obj[field] = that[field] || '';
    });
    obj.time = this.time.timestamp();
    obj.raw = this.getRaw();
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

  this.getRaw = function() {
    return rawer.getStatusWithoutSignature(this);
  },

  this.getRawSigned = function() {
    return rawer.getStatus(this);
  }
}
