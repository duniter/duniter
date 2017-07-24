"use strict"

const assert = require('assert')
const bs58 = require('bs58')

module.exports = {
  encode: (bytes) => bs58.encode(bytes),
  decode: (data) => new Uint8Array(bs58.decode(data))
};
