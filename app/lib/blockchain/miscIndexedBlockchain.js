"use strict"

const co = require('co')
const IndexedBlockchain = require('./indexedBlockchain')
const SQLIndex = require('./sqlIndex')

module.exports = function (blockchainStorage, mindexDAL, iindexDAL, sindexDAL, cindexDAL) {

  return new IndexedBlockchain(blockchainStorage, SQLIndex(null, {
    m_index: { handler: mindexDAL },
    i_index: { handler: iindexDAL },
    s_index: { handler: sindexDAL },
    c_index: { handler: cindexDAL }
  }), 'writtenOn', {
    m_index: {
      pk: ['pub']
    },
    i_index: {
      pk: ['pub']
    },
    s_index: {
      pk: ['identifier', 'pos'],
      remove: 'consumed'
    },
    c_index: {
      pk: ['issuer', 'receiver', 'created_on'],
      remove: 'expired_on'
    }
  })
}
