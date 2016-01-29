"use strict";
let sha1 = require('sha1');
let constants = require('./constants');

let buidFunctions = function(number, hash) {
  if (arguments.length === 2) {
    return [number, hash].join('-');
  }
  if (arguments[0]) {
    return [arguments[0].number, arguments[0].hash].join('-');
  }
  return '0-DA39A3EE5E6B4B0D3255BFEF95601890AFD80709';
};

buidFunctions.fromTS = (line) => line.match(/TS:(.*)/)[1];
buidFunctions.fromIdty = (idty) => this(idty.ts_number, idty.ts_hash);

module.exports = {

  format: {

    sha1: (value) => sha1(String(value)).toUpperCase(),

    isBuid: (value) => (typeof value === 'string') && value.match(constants.BLOCK_UID) ? true : false,

    buid: buidFunctions,

    obuid: (line) => {
      let sp = this.buid.fromTS(line).split('-');
      return {
        number: sp[0],
        hash: sp[1]
      };
    }
  }
};
