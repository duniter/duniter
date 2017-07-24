"use strict";
const util     = require('util');
const stream   = require('stream');

module.exports = function (str) {
  if (str)
    return dos2unix(str);
  else
    return new Dos2UnixStream();
};

const dos2unix = (str) => str.replace(/\r\n/g, '\n');

function Dos2UnixStream () {
  stream.Transform.apply(this);

  this._write = function (str, enc, done) {
    this.push(dos2unix(str.toString()));
    done();
  }
}

util.inherits(Dos2UnixStream, stream.Transform);
