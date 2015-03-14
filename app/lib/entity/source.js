var _ = require('underscore');

module.exports = Link;

function Link(json) {

  var that = this;

  _(json || {}).keys().forEach(function(key) {
    var value = json[key];
    if (key == "number") {
      value = parseInt(value);
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
  }
}