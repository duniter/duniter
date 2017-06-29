"use strict"

const IndexedBlockchain = require('./indexedBlockchain')

module.exports = class DuniterBlockchain extends IndexedBlockchain {

  constructor(bcOperations, indexOperations) {
    super(bcOperations, indexOperations)
  }

  checkBlock(block, env) {

  }
}
