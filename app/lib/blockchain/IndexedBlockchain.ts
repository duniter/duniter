// Source file from duniter: Crypto-currency software to manage libre currency such as Ğ1
// Copyright (C) 2018  Cedric Moreau <cem.moreau@gmail.com>
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.

"use strict"
import {BasicBlockchain} from "./BasicBlockchain"
import {IndexOperator} from "./interfaces/IndexOperator"
import {BlockchainOperator} from "./interfaces/BlockchainOperator"

const _ = require('underscore')

export class IndexedBlockchain extends BasicBlockchain {

  private initIndexer: Promise<void>

  constructor(bcOperations: BlockchainOperator, private indexOperations: IndexOperator, private numberField: string, private pkFields: any) {
    super(bcOperations)
    this.initIndexer = indexOperations.initIndexer(pkFields)
  }

  async recordIndex(index: { [index: string]: any }) {
    // Wait indexer init
    await this.initIndexer

    return this.indexOperations.recordIndex(index)
  }

  async indexTrim(maxNumber:number) {

    // Wait indexer init
    await this.initIndexer

    const subIndexes = await this.indexOperations.getSubIndexes()
    // Trim the subIndexes
    const records: { [index: string]: any } = {}
    for (const subIndex of subIndexes) {
      records[subIndex] = []
      const pks = typeof this.pkFields[subIndex].pk !== 'string' && this.pkFields[subIndex].pk.length ? Array.from(this.pkFields[subIndex].pk) : [this.pkFields[subIndex].pk]
      const rm = this.pkFields[subIndex].remove
      let potentialRecords = await this.indexOperations.findTrimable(subIndex, this.numberField, maxNumber)
      potentialRecords = reduceBy(potentialRecords, pks)
      for (const potential of potentialRecords) {
        const subCriteriasRowsToDelete = criteriasFromPks(pks, potential)
        subCriteriasRowsToDelete[this.numberField] = { $lt: maxNumber }
        const rowsToReduce = await this.indexOperations.findWhere(subIndex, subCriteriasRowsToDelete)
        // No reduction if 1 line to delete
        if (rowsToReduce.length > 1) {
          const reduced = reduce(rowsToReduce)
          const subCriteriasRowsToKeep = criteriasFromPks(pks, potential)
          subCriteriasRowsToKeep[this.numberField] = { $gte: maxNumber }
          const toKeep = await this.indexOperations.findWhere(subIndex, subCriteriasRowsToKeep)
          const subCriteriasAllRowsOfObject = criteriasFromPks(pks, potential)
          await this.indexOperations.removeWhere(subIndex, subCriteriasAllRowsOfObject)
          // Add the reduced row + rows to keep
          if (!rm || !reduced[rm]) {
            records[subIndex] = records[subIndex].concat([reduced]).concat(toKeep)
          }
        }
      }
    }
    await this.recordIndex(records)
    return Promise.resolve()
  }

  async indexCount(indexName: string, criterias: { [index: string]: any }) {

    // Wait indexer init
    await this.initIndexer

    const records = await this.indexOperations.findWhere(indexName, criterias)
    return records.length
  }

  async indexReduce(indexName: string, criterias: { [index: string]: any }) {

    // Wait indexer init
    await this.initIndexer

    const records = await this.indexOperations.findWhere(indexName, criterias)
    return reduce(records)
  }

  async indexReduceGroupBy(indexName: string, criterias: { [index: string]: any }, properties: string[]) {

    // Wait indexer init
    await this.initIndexer

    const records = await this.indexOperations.findWhere(indexName, criterias)
    return reduceBy(records, properties)
  }

  async indexRevert(blockNumber:number) {
    const subIndexes = await this.indexOperations.getSubIndexes()
    for (const subIndex of subIndexes) {
      const removeCriterias: { [index: string]: any } = {}
      removeCriterias[this.numberField] = blockNumber
      await this.indexOperations.removeWhere(subIndex, removeCriterias)
    }
  }
}

function reduce(records: any[]) {
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

function reduceBy(reducables: any[], properties: string[]) {
  const reduced = reducables.reduce((map, entry) => {
    const id = properties.map((prop) => entry[prop]).join('-');
    map[id] = map[id] || [];
    map[id].push(entry);
    return map;
  }, {});
  return _.values(reduced).map((rows: any[]) => reduce(rows))
}

function criteriasFromPks(pks: string[], values: any): { [index: string]: any } {
  const criterias: { [index: string]: any } = {}
  for (const key of pks) {
    criterias[key] = values[key]
  }
  return criterias
}
