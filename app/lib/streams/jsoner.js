var async    = require('async');
var sha1     = require('sha1');
var util     = require('util');
var stream   = require('stream');

module.exports = function () {
  return new JSONer();
};

function JSONer () {

  stream.Transform.call(this, { objectMode: true });

  var that = this;

  this._write = function (entity, enc, done) {
    that.push(entity.json());
    done();
  };
};

util.inherits(JSONer, stream.Transform);
