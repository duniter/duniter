"use strict";
var async    = require('async');
var sha1     = require('sha1');
var util     = require('util');
var stream   = require('stream');

module.exports = function (currency, onError) {
  return new CurrencyFilter(currency, onError);
};

function CurrencyFilter (currency, onError) {

  stream.Transform.call(this, { objectMode: true });

  var that = this;

  this._write = function (json, enc, done) {
    if (json && json.currency && json.currency == currency)
      that.push(json);
    else
      onError("Document currency must be '" + currency + "'");
    that.push(null);
  };
};

util.inherits(CurrencyFilter, stream.Transform);
