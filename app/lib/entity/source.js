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
      "pubkey": this.pubkey,
      "type": this.type,
      "number": this.number,
      "fingerprint": this.fingerprint,
      "amount": this.amount
    };
  };

  this.UDjson = function () {
    return {
      "block_number": this.number,
      "consumed": this.consumed,
      "time": this.time,
      "amount": this.amount
    };
  }
}