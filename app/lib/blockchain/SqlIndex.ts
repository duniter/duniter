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
import {IndexOperator} from "./interfaces/IndexOperator"
import {AbstractIndex} from "../dal/sqliteDAL/AbstractIndex";

const _ = require('underscore')

export class SQLIndex implements IndexOperator {

  private indexes: { [k:string]: any } = {}

  constructor(private db:any, private definitions: any) {
  }

  async initIndexer(pkFields: any): Promise<void> {
    const keys = _.keys(pkFields)
    for (const k of keys) {
      if (this.definitions[k].handler) {
        // External table: managed by another object
        this.indexes[k] = this.definitions[k].handler
      } else {
        // Internal table: managed here
        const indexTable = new AbstractIndex<any>(this.db, k, [], this.definitions[k].fields, [], this.definitions[k].booleans)
        this.indexes[k] = indexTable
        indexTable.init = () => {
          return indexTable.exec('BEGIN;' +
            'CREATE TABLE IF NOT EXISTS ' + indexTable.table + ' (' +
            this.definitions[k].sqlFields.join(',') +
            ');' +
            'COMMIT;')
        }
        await indexTable.init()
      }
    }
  }

  getSubIndexes(): Promise<string[]> {
    return Promise.resolve(_.keys(this.indexes))
  }

  findTrimable(subIndex: string, numberField: string, maxNumber: number): Promise<any[]> {
    if (this.definitions[subIndex].findTrimable) {
      return this.definitions[subIndex].findTrimable(maxNumber)
    } else {
      const criterias:any = {}
      criterias[numberField] = { $lt: maxNumber }
      return this.indexes[subIndex].sqlFind(criterias)
    }
  }

  removeWhere(subIndex: string, criterias: {}): Promise<void> {
    if (!this.indexes[subIndex]) {
      return Promise.resolve()
    }
    return this.indexes[subIndex].sqlRemoveWhere(criterias)
  }

  async recordIndex(index: any): Promise<void> {
    const subIndexes = _.keys(index)
    // Feed the this.indexes
    for (const subIndex of subIndexes) {
      await this.indexes[subIndex].insertBatch(index[subIndex])
    }
    return Promise.resolve()
  }


  findWhere(subIndex: string, criterias: {}): Promise<any[]> {
    if (!this.indexes[subIndex]) {
      return Promise.resolve([])
    }
    return this.indexes[subIndex].sqlFind(criterias)
  }
}
