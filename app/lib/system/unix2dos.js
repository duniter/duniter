"use strict";
const dos2unix = require('duniter-common').dos2unix;
const util     = require('util');
const stream   = require('stream');

module.exports = function (str) {
  if (str)
    return unix2dos(str);
  else
    return new Unix2DosStream();
};

function unix2dos(str){
  return dos2unix(str).replace(/\n/g, '\r\n');
}

function Unix2DosStream () {
  stream.Transform.apply(this);

  this._write = function (str, enc, done) {
    this.push(unix2dos(str.toString()));
    done();
  }
}

util.inherits(Unix2DosStream, stream.Transform);
