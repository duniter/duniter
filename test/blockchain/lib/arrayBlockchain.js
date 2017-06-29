"use strict"

module.exports = function ArrayBlockchain() {

  // The blockchain storage
  const bcArray = []

  return {

    store: (b) => {
      bcArray.push(b)
      return Promise.resolve(b)
    },

    read: (index) => {
      return Promise.resolve(bcArray[index])
    },

    head: (number) => {
      const index = Math.max(0, bcArray.length - 1 - (number || 0))
      return Promise.resolve(bcArray[index])
    },

    headRange: (number) => {
      const index = Math.max(0, bcArray.length - (number || 0))
      return Promise.resolve(bcArray.slice(index, bcArray.length))
    },

    height: () => {
      return Promise.resolve(bcArray.length)
    },

    revert: () => {
      const reverted = bcArray.pop()
      return Promise.resolve(reverted)
    }

  }
}
