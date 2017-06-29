"use strict"

const _  = require('underscore')

module.exports = function MemoryIndex() {

  // The blockchain storage
  const indexStorage = {}

  const matchComplexCriterias = (criterias, row) => {
    const criteriaKeys = _.keys(criterias)
    let matches = true
    let i = 0
    while (matches && i < criteriaKeys.length) {
      const k = criteriaKeys[i]
      if (typeof criterias[k] === 'function') {
        matches = criterias[k](row[k])
      } else if (typeof criterias[k] === 'object') {
        if (criterias[k].$lt) {
          matches = row[k] < criterias[k].$lt
        } else if (criterias[k].$gt) {
          matches = row[k] > criterias[k].$gt
        } else if (criterias[k].$lte) {
          matches = row[k] <= criterias[k].$lte
        } else if (criterias[k].$gte) {
          matches = row[k] >= criterias[k].$gte
        } else {
          // Unknown predicate
          matches = false
        }
      } else {
        matches = row[k] === criterias[k]
      }
      i++
    }
    return matches
  }

  return {

    getSubIndexes: () => Promise.resolve(_.keys(indexStorage)),

    findWhere: (subIndex, criterias) => {
      let res = []
      const areBasicCriterias = _.values(criterias).reduce((are, criteria) => are && typeof criteria !== 'function' && typeof criteria !== 'object', true)
      if (areBasicCriterias) {
        res = _.where(indexStorage[subIndex], criterias)
      } else {
        // Slower test, with specific criterias
        for (const row of indexStorage[subIndex]) {
          if (matchComplexCriterias(criterias, row)) {
            res.push(row)
          }
        }
      }
      return Promise.resolve(res)
    },

    removeWhere: (subIndex, criterias) => {
      let i = 0
      let rows = indexStorage[subIndex]
      while (i < rows.length) {
        if (matchComplexCriterias(criterias, rows[i])) {
          rows.splice(i, 1)
        } else {
          i++
        }
      }
      return Promise.resolve()
    },

    recordIndex: (index) => {
      const subIndexes = _.keys(index)
      // Create subIndexes if they do not exist
      for (const subIndex of subIndexes) {
        indexStorage[subIndex] = indexStorage[subIndex] || []
      }
      // Feed the subIndexes
      for (const subIndex of subIndexes) {
        indexStorage[subIndex] = indexStorage[subIndex].concat(index[subIndex])
      }
      return Promise.resolve()
    }
  }
}
