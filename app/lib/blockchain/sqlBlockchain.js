"use strict"

const co = require('co')

module.exports = function SQLBlockchain(dal) {

  return {

    store: (b) => {
      return Promise.resolve(b)
    },

    read: (index) => {
      return dal.bindexDAL.sqlFindOne({ number: index, fork: false })
    },

    head: (number) => {
      return dal.bindexDAL.head(number)
    },

    headRange: (number) => {
      return dal.bindexDAL.range(0, number)
    },

    height: () => {
      return co(function*() {
        const head = yield dal.bindexDAL.head()
        return head.number + 1
      })
    },

    revert: () => {
      return co(function*() {
        const head = yield dal.bindexDAL.head()
        yield dal.bindexDAL.removeBlock(head.number)
      })
    }
  }
}
