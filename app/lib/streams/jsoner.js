"use strict";
const util     = require('util');
const stream   = require('stream');

module.exports = function () {
  return new JSONer();
};

function JSONer () {

  stream.Transform.call(this, { objectMode: true });

  const that = this;

  this._write = function (entity, enc, done) {
    that.push(entity.json());
    done();
  };
}

util.inherits(JSONer, stream.Transform);
