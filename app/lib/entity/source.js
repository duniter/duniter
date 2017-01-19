"use strict";
const _ = require('underscore');

module.exports = Source;

function Source(json) {
  
  _(json || {}).keys().forEach((key) => {
    let value = json[key];
    if (key == "number") {
      value = parseInt(value);
    }
    else if (key == "consumed") {
      value = !!value;
    }
    this[key] = value;
  });

  this.json = function () {
    return {
      "type": this.type,
      "noffset": this.pos,
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
