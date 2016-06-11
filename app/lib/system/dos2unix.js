"use strict";
var util     = require('util');
var stream   = require('stream');

module.exports = function (str) {
  if (str)
    return dos2unix(str);
  else
    return new Dos2UnixStream();
}

function dos2unix(str){
  return str.replace(/\r\n/g, '\n');
}

function Dos2UnixStream () {
  stream.Transform.apply(this);

  this._write = function (str, enc, done) {
    this.push(dos2unix(str.toString()));
    done();
  }
}

util.inherits(Dos2UnixStream, stream.Transform);
