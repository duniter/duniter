"use strict";
let hashf = require('./hashf');
let constants = require('./../constants');

let buidFunctions = function(number, hash) {
  if (arguments.length === 2) {
    return [number, hash].join('-');
  }
  if (arguments[0]) {
    return [arguments[0].number, arguments[0].hash].join('-');
  }
  return '0-E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855';
};

buidFunctions.fromTS = (line) => line.match(/TS:(.*)/)[1];
buidFunctions.fromIdty = (idty) => this(idty.ts_number, idty.ts_hash);

module.exports = {

  format: {

    hashf: (value) => hashf(String(value)).toUpperCase(),

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
