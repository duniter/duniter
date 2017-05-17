"use strict";

const wotb = require('wotb');

module.exports = {

  fileInstance: (filepath) => wotb.newFileInstance(filepath),
  memoryInstance: () => wotb.newMemoryInstance(),
  setVerbose: wotb.setVerbose
};
