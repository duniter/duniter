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
import {IndexOperator} from "../../../app/lib/blockchain/interfaces/IndexOperator"

const _  = require('underscore')

export class MemoryIndex implements IndexOperator {

  // The blockchain storage
  private indexStorage: { [index: string]: any[] } = { }

  initIndexer(pkFields: any): Promise<void> {
    return Promise.resolve()
  }

  getSubIndexes(): Promise<string[]> {
    return Promise.resolve(_.keys(this.indexStorage))
  }

  findTrimable(subIndex: string, numberField: string, maxNumber: number): Promise<any[]> {
    const criterias:any = {}
    criterias[numberField] = { $lt: maxNumber }
    return this.findWhere(subIndex, criterias)
  }

  removeWhere(subIndex: string, criterias: {}): Promise<void> {
    let i = 0
    let rows = this.indexStorage[subIndex]
    while (i < rows.length) {
      if (MemoryIndex.matchComplexCriterias(criterias, rows[i])) {
        rows.splice(i, 1)
      } else {
        i++
      }
    }
    return Promise.resolve()
  }

  recordIndex(index: any): Promise<void> {
    const subIndexes = _.keys(index)
    // Create subIndexes if they do not exist
    for (const subIndex of subIndexes) {
      this.indexStorage[subIndex] = this.indexStorage[subIndex] || []
    }
    // Feed the subIndexes
    for (const subIndex of subIndexes) {
      this.indexStorage[subIndex] = this.indexStorage[subIndex].concat(index[subIndex])
    }
    return Promise.resolve()
  }

  private static matchComplexCriterias(criterias:any, row:any): boolean {
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

  findWhere(subIndex: string, criterias: {}): Promise<any[]> {
    let res: any[] = []
    const areBasicCriterias = _.values(criterias).reduce((are:boolean, criteria:any) => are && typeof criteria !== 'function' && typeof criteria !== 'object', true)
    if (areBasicCriterias) {
      res = _.where(this.indexStorage[subIndex], criterias)
    } else {
      // Slower test, with specific criterias
      for (const row of this.indexStorage[subIndex]) {
        if (MemoryIndex.matchComplexCriterias(criterias, row)) {
          res.push(row)
        }
      }
    }
    return Promise.resolve(res)
  }
}
