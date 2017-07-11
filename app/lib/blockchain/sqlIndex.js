"use strict"

const co = require('co')
const _  = require('underscore')
const AbstractSQLite = require('../../../app/lib/dal/sqliteDAL/AbstractSQLite')
const AbstractIndex = require('../../../app/lib/dal/sqliteDAL/AbstractIndex')

module.exports = function SQLIndex(db, definitions) {

  const indexes = {
  }

  const findWhere = (subIndex, criterias) => {
    if (!indexes[subIndex]) {
      return Promise.resolve([])
    }
    return indexes[subIndex].sqlFind(criterias)
  }

  return {

    initIndexer: (pkFields) => co(function*() {
      const keys = _.keys(pkFields)
      for (const k of keys) {
        if (definitions[k].handler) {
          // External table: managed by another object
          indexes[k] = definitions[k].handler
        } else {
          // Internal table: managed here
          const indexTable = new IndexDAL(db);
          const pk = pkFields[k].pk
          indexTable.table = k
          indexTable.fields = definitions[k].fields
          indexTable.booleans = definitions[k].booleans
          indexes[k] = indexTable
          indexTable.init = () => {
            return indexTable.exec('BEGIN;' +
              'CREATE TABLE IF NOT EXISTS ' + indexTable.table + ' (' +
              definitions[k].sqlFields.join(',') +
              ');' +
              'COMMIT;', [])
          }
          yield indexTable.init()
        }
      }
    }),

    getSubIndexes: () => Promise.resolve(_.keys(indexes)),

    findWhere,

    findTrimable: (subIndex, numberField, maxNumber) => {
      if (definitions[subIndex].findTrimable) {
        return definitions[subIndex].findTrimable(maxNumber)
      } else {
        const criterias = {}
        criterias[numberField] = { $lt: maxNumber }
        return indexes[subIndex].sqlFind(criterias)
      }
    },

    removeWhere: (subIndex, criterias) => {
      if (!indexes[subIndex]) {
        return Promise.resolve([])
      }
      return indexes[subIndex].sqlRemoveWhere(criterias)
    },

    recordIndex: (index) => co(function*() {
      const subIndexes = _.keys(index)
      // Feed the indexes
      for (const subIndex of subIndexes) {
        yield indexes[subIndex].insertBatch(index[subIndex])
      }
      return Promise.resolve()
    })
  }
}

function IndexDAL(driver) {

  AbstractSQLite.call(this, driver);
  AbstractIndex.call(this);
}

