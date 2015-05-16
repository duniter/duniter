"use strict";
var async    = require('async');
var sha1     = require('sha1');
var util     = require('util');
var stream   = require('stream');

module.exports = function (onError) {
  return new VersionFilter(onError);
};

function VersionFilter (onError) {

  stream.Transform.call(this, { objectMode: true });

  var that = this;

  this._write = function (json, enc, done) {
    if (json && json.version && parseInt(json.version) == 1)
      that.push(json);
    else
      onError("Document version must be 1");
    that.push(null);
  };
};

util.inherits(VersionFilter, stream.Transform);
