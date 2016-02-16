"use strict";
var _ = require('underscore');

module.exports = Source;

function Source(json) {

  var that = this;

  _(json || {}).keys().forEach(function(key) {
    var value = json[key];
    if (key == "number") {
      value = parseInt(value);
    }
    else if (key == "consumed") {
      value = !!value;
    }
    that[key] = value;
  });

  this.json = function () {
    return {
      "type": this.type,
      "noffset": this.noffset,
      "identifier": this.identifier,
      "amount": this.amount,
      "base": this.base
    };
  };

  this.UDjson = function () {
    return {
      "block_number": this.number,
      "consumed": this.consumed,
      "time": this.time,
      "amount": this.amount,
      "base": this.base
    };
  };
}