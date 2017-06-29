"use strict"

const co = require('co')
const _  = require('underscore')
const BasicBlockchain = require('./basicBlockchain')

module.exports = class IndexedBlockchain extends BasicBlockchain {

  constructor(bcOperations, indexOperations, numberField, pkFields) {
    super(bcOperations)
    this.indexOperations = indexOperations
    this.numberField = numberField
    this.pkFields = pkFields
  }

  recordIndex(index) {
    return this.indexOperations.recordIndex(index)
  }

  indexTrim(maxNumber) {
    const that = this
    return co(function*() {
      const subIndexes = yield that.indexOperations.getSubIndexes()
      // Trim the subIndexes
      const records = {}
      for (const subIndex of subIndexes) {
        records[subIndex] = []
        const pks = typeof that.pkFields[subIndex].pk !== 'string' && that.pkFields[subIndex].pk.length ? Array.from(that.pkFields[subIndex].pk) : [that.pkFields[subIndex].pk]
        const rm = that.pkFields[subIndex].remove
        let potentialRecords = yield that.indexOperations.findTrimable(subIndex, that.numberField, maxNumber)
        potentialRecords = reduceBy(potentialRecords, pks)
        for (const potential of potentialRecords) {
          const subCriteriasRowsToDelete = criteriasFromPks(pks, potential)
          subCriteriasRowsToDelete[that.numberField] = { $lt: maxNumber }
          const rowsToReduce = yield that.indexOperations.findWhere(subIndex, subCriteriasRowsToDelete)
          // No reduction if 1 line to delete
          if (rowsToReduce.length > 1) {
            const reduced = reduce(rowsToReduce)
            const subCriteriasRowsToKeep = criteriasFromPks(pks, potential)
            subCriteriasRowsToKeep[that.numberField] = { $gte: maxNumber }
            const toKeep = yield that.indexOperations.findWhere(subIndex, subCriteriasRowsToKeep)
            const subCriteriasAllRowsOfObject = criteriasFromPks(pks, potential)
            yield that.indexOperations.removeWhere(subIndex, subCriteriasAllRowsOfObject)
            // Add the reduced row + rows to keep
            if (!rm || reduced[rm] !== true) {
              records[subIndex] = records[subIndex].concat([reduced]).concat(toKeep)
            }
          }
        }
      }
      yield that.recordIndex(records)
      return Promise.resolve()
    })
  }

  indexCount(indexName, criterias) {
    const that = this
    return co(function*() {
      const records = yield that.indexOperations.findWhere(indexName, criterias)
      return records.length
    })
  }

  indexReduce(indexName, criterias) {
    const that = this
    return co(function*() {
      const records = yield that.indexOperations.findWhere(indexName, criterias)
      return reduce(records)
    })
  }

  indexReduceGroupBy(indexName, criterias, properties) {
    const that = this
    return co(function*() {
      const records = yield that.indexOperations.findWhere(indexName, criterias)
      return reduceBy(records, properties)
    })
  }
}

function reduce(records) {
  return records.reduce((obj, record) => {
    const keys = Object.keys(record);
    for (const k of keys) {
      if (record[k] !== undefined && record[k] !== null) {
        obj[k] = record[k];
      }
    }
    return obj;
  }, {});
}

function reduceBy(reducables, properties) {
  const reduced = reducables.reduce((map, entry) => {
    const id = properties.map((prop) => entry[prop]).join('-');
    map[id] = map[id] || [];
    map[id].push(entry);
    return map;
  }, {});
  return _.values(reduced).map((value) => reduce(value))
}

function criteriasFromPks(pks, values) {
  const criterias = {}
  for (const key of pks) {
    criterias[key] = values[key]
  }
  return criterias
}
